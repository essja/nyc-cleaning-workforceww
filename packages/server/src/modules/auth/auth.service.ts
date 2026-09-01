import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { User, OrganizationUser, Organization, Employee, UserRole } from '../../db/types.js';
import { AuthTokenPayload, AuthenticatedRequestUser } from './auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../../utils/email.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'enterprise-workforce-jwt-secret-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'enterprise-workforce-refresh-secret-key-2026';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

export class AuthService {
  /**
   * Fetch all permissions associated with a role code
   */
  public static getPermissionsForRole(roleCode: UserRole): string[] {
    const rows = db.query<{ code: string }>(`
      SELECT p.code 
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      WHERE r.code = ?
    `, [roleCode]);

    return rows.map((r) => r.code);
  }

  /**
   * User login with email & password, optional organization slug
   */
  public static async login(
    email: string,
    password: string,
    orgSlug?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    user: AuthenticatedRequestUser;
    accessToken: string;
    refreshToken: string;
    organization: Organization;
    availableOrganizations: { id: string; name: string; slug: string; role: UserRole }[];
  }> {
    const user = db.queryOne<User>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_active) {
      throw new Error('This user account is deactivated');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    // Fetch user's active organization memberships
    const memberships = db.query<{
      org_id: string;
      org_name: string;
      org_slug: string;
      role: UserRole;
      assigned_building_ids: string;
      is_active: number;
    }>(`
      SELECT 
        o.id as org_id, o.name as org_name, o.slug as org_slug,
        ou.role, ou.assigned_building_ids, ou.is_active
      FROM organization_users ou
      JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.user_id = ? AND ou.is_active = 1
    `, [user.id]);

    if (memberships.length === 0) {
      throw new Error('User has no active organization memberships');
    }

    // Select active organization (either requested by slug, or default to first)
    let activeMembership = memberships[0];
    if (orgSlug) {
      const match = memberships.find((m) => m.org_slug === orgSlug);
      if (!match) {
        throw new Error(`User does not have access to organization: ${orgSlug}`);
      }
      activeMembership = match;
    }

    const org = db.queryOne<Organization>('SELECT * FROM organizations WHERE id = ?', [activeMembership.org_id])!;
    let employee = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND user_id = ?',
      [activeMembership.org_id, user.id]
    );

    // If employee profile not yet created for this user in this org, link by email or auto-provision
    if (!employee) {
      const existingByEmail = db.queryOne<Employee>(
        'SELECT * FROM employees WHERE organization_id = ? AND LOWER(email) = LOWER(?)',
        [activeMembership.org_id, user.email]
      );
      if (existingByEmail) {
        db.execute('UPDATE employees SET user_id = ? WHERE id = ?', [user.id, existingByEmail.id]);
        employee = { ...existingByEmail, user_id: user.id };
      } else {
        // Auto-provision employee record for user
        const newEmpId = uuidv4();
        const codeNum = Math.floor(1000 + Math.random() * 9000);
        const empCode = `EMP-${codeNum}`;
        db.execute(`
          INSERT INTO employees (id, organization_id, user_id, employee_code, first_name, last_name, email, phone, employment_type, status, hire_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SALARIED', 'ACTIVE', date('now'))
        `, [newEmpId, activeMembership.org_id, user.id, empCode, user.first_name, user.last_name, user.email, user.phone || null]);
        
        // Link to first building in org
        const firstBuilding = db.queryOne<{ id: string }>('SELECT id FROM buildings WHERE organization_id = ? LIMIT 1', [activeMembership.org_id]);
        if (firstBuilding) {
          db.execute('INSERT OR IGNORE INTO employee_buildings (employee_id, building_id, is_primary) VALUES (?, ?, 1)', [newEmpId, firstBuilding.id]);
        }

        employee = db.queryOne<Employee>('SELECT * FROM employees WHERE id = ?', [newEmpId])!;
      }
    }

    const permissions = this.getPermissionsForRole(activeMembership.role);
    let assignedBuildings: string[] = [];
    try {
      assignedBuildings = JSON.parse(activeMembership.assigned_building_ids || '[]');
    } catch {
      assignedBuildings = [];
    }

    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      orgId: org.id,
      orgSlug: org.slug,
      role: activeMembership.role,
      permissions,
      assignedBuildingIds: assignedBuildings,
      employeeId: employee?.id
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ userId: user.id, orgId: org.id }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY
    });

    const authedUser: AuthenticatedRequestUser = {
      ...payload,
      firstName: user.first_name,
      lastName: user.last_name
    };

    // Record login audit log
    AuditService.log({
      organizationId: org.id,
      actorUserId: user.id,
      action: 'AUTH.LOGIN',
      entityType: 'users',
      entityId: user.id,
      afterState: { email: user.email, role: activeMembership.role },
      ipAddress,
      userAgent
    });

    return {
      user: authedUser,
      accessToken,
      refreshToken,
      organization: org,
      availableOrganizations: memberships.map((m) => ({
        id: m.org_id,
        name: m.org_name,
        slug: m.org_slug,
        role: m.role
      }))
    };
  }

  /**
   * Dedicated Admin/Owner Portal Login
   * Strictly enforces administrative roles (OWNER, ADMIN, HR_MANAGER)
   */
  public static async loginAdmin(
    email: string,
    password: string,
    orgSlug?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const result = await this.login(email, password, orgSlug, ipAddress, userAgent);
    const adminRoles: UserRole[] = ['OWNER', 'ADMIN', 'HR_MANAGER'];
    if (!adminRoles.includes(result.user.role)) {
      throw new Error('Access denied. This account does not have administrator privileges. Please sign in via the Employee Portal at /employee/login.');
    }
    return result;
  }

  /**
   * Dedicated Employee Portal Login
   * Authenticates active employee personnel
   */
  public static async loginEmployee(
    email: string,
    password: string,
    orgSlug?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const result = await this.login(email, password, orgSlug, ipAddress, userAgent);
    return result;
  }

  /**
   * Refresh JWT Access Token
   */
  public static async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; user: AuthenticatedRequestUser }> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string; orgId: string };
      const user = db.queryOne<User>('SELECT * FROM users WHERE id = ? AND is_active = 1', [decoded.userId]);
      if (!user) throw new Error('User not found or inactive');

      const membership = db.queryOne<{ role: UserRole; assigned_building_ids: string }>(`
        SELECT role, assigned_building_ids FROM organization_users
        WHERE organization_id = ? AND user_id = ? AND is_active = 1
      `, [decoded.orgId, decoded.userId]);
      if (!membership) throw new Error('No active membership for organization');

      const org = db.queryOne<Organization>('SELECT * FROM organizations WHERE id = ?', [decoded.orgId])!;
      const employee = db.queryOne<Employee>(
        'SELECT * FROM employees WHERE organization_id = ? AND user_id = ?',
        [decoded.orgId, decoded.userId]
      );

      const permissions = this.getPermissionsForRole(membership.role);
      let assignedBuildings: string[] = [];
      try {
        assignedBuildings = JSON.parse(membership.assigned_building_ids || '[]');
      } catch {
        assignedBuildings = [];
      }

      const payload: AuthTokenPayload = {
        userId: user.id,
        email: user.email,
        orgId: org.id,
        orgSlug: org.slug,
        role: membership.role,
        permissions,
        assignedBuildingIds: assignedBuildings,
        employeeId: employee?.id
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      return {
        accessToken,
        user: { ...payload, firstName: user.first_name, lastName: user.last_name }
      };
    } catch {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Administrator invites an employee or manager to an organization
   */
  public static async inviteUser(params: {
    organizationId: string;
    actorUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    assignedBuildingIds?: string[];
    employeeId?: string;
  }): Promise<{ user: User; invitationToken: string }> {
    const normalizedEmail = params.email.toLowerCase().trim();
    const now = new Date().toISOString();

    let user = db.queryOne<User>('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    const temporaryPassword = uuidv4();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    if (!user) {
      const newUserId = uuidv4();
      db.execute(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `, [newUserId, normalizedEmail, passwordHash, params.firstName, params.lastName, now, now]);
      user = db.queryOne<User>('SELECT * FROM users WHERE id = ?', [newUserId])!;
    }

    // Check if membership already exists
    const existingMembership = db.queryOne<OrganizationUser>(`
      SELECT * FROM organization_users WHERE organization_id = ? AND user_id = ?
    `, [params.organizationId, user.id]);

    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    const orgUserId = uuidv4();
    db.execute(`
      INSERT INTO organization_users (
        id, organization_id, user_id, role, assigned_building_ids, is_active, invited_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [
      orgUserId,
      params.organizationId,
      user.id,
      params.role,
      JSON.stringify(params.assignedBuildingIds || []),
      now, now, now
    ]);

    // Link employee record if provided
    if (params.employeeId) {
      db.execute(`
        UPDATE employees SET user_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?
      `, [user.id, now, params.employeeId, params.organizationId]);
    }

    // Generate activation token signed for 7 days
    const invitationToken = jwt.sign(
      { userId: user.id, orgId: params.organizationId, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    AuditService.log({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'USER.INVITE',
      entityType: 'users',
      entityId: user.id,
      afterState: { email: user.email, role: params.role }
    });

    const org = db.queryOne<{ name: string }>('SELECT name FROM organizations WHERE id = ?', [params.organizationId]);
    await EmailService.sendInvitationEmail({
      to: user.email,
      firstName: user.first_name,
      companyName: org?.name || 'NYC Cleaning and Maintenance',
      role: params.role,
      invitationToken,
      organizationId: params.organizationId,
      userId: user.id
    });

    return { user, invitationToken };
  }

  /**
   * User activates account and sets permanent password
   */
  public static async activateAccount(invitationToken: string, newPassword: string): Promise<boolean> {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(invitationToken, JWT_SECRET);
    } catch {
      throw new Error('Invalid or expired invitation token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();

    db.execute(`
      UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?
    `, [passwordHash, now, decoded.userId]);

    db.execute(`
      UPDATE organization_users SET activated_at = ?, updated_at = ? WHERE organization_id = ? AND user_id = ?
    `, [now, now, decoded.orgId, decoded.userId]);

    AuditService.log({
      organizationId: decoded.orgId,
      actorUserId: decoded.userId,
      action: 'USER.ACTIVATE',
      entityType: 'users',
      entityId: decoded.userId
    });

    return true;
  }

  /**
   * Suspend user membership in organization
   */
  public static suspendUser(orgId: string, actorUserId: string, targetUserId: string): void {
    const now = new Date().toISOString();
    db.execute(`
      UPDATE organization_users SET is_active = 0, updated_at = ? WHERE organization_id = ? AND user_id = ?
    `, [now, orgId, targetUserId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'USER.SUSPEND',
      entityType: 'users',
      entityId: targetUserId
    });
  }

  /**
   * Reactivate suspended user membership
   */
  public static reactivateUser(orgId: string, actorUserId: string, targetUserId: string): void {
    const now = new Date().toISOString();
    db.execute(`
      UPDATE organization_users SET is_active = 1, updated_at = ? WHERE organization_id = ? AND user_id = ?
    `, [now, orgId, targetUserId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'USER.REACTIVATE',
      entityType: 'users',
      entityId: targetUserId
    });
  }

  /**
   * Verify JWT Token helper
   */
  public static verifyAccessToken(token: string): AuthTokenPayload {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  }
}
