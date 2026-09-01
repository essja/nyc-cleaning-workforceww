import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { Employee, Department, Position, PayRate, Building } from '../../db/types.js';
import { AuditService } from '../audit/audit.service.js';

export interface CreateEmployeeInput {
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  password?: string;
  department_id?: string;
  position_id?: string;
  manager_id?: string;
  employment_type?: 'HOURLY' | 'SALARIED' | 'CONTRACTOR';
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';
  hire_date?: string;
  hourly_rate?: number;
  building_ids?: string[];
}

export interface EmployeeDetailView extends Employee {
  department?: Department | null;
  position?: Position | null;
  current_pay_rate?: number;
  assigned_buildings: { id: string; name: string; is_primary: boolean }[];
  primary_building_name?: string;
  recent_sessions_count: number;
}

export interface FullEmployeeProfile {
  employee: EmployeeDetailView;
  attendanceStats: {
    totalSessions: number;
    presentDays: number;
    lateArrivals: number;
    recentSessions: any[];
  };
  leaveStats: {
    totalRequests: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    requests: any[];
  };
  account: {
    hasLogin: boolean;
    loginEmail: string | null;
    role: string;
    isActive: boolean;
  };
}

export class EmployeesService {
  public static listEmployees(
    orgId: string,
    filters?: { departmentId?: string; status?: string; search?: string; buildingId?: string }
  ): EmployeeDetailView[] {
    let sql = `
      SELECT DISTINCT e.*
      FROM employees e
      LEFT JOIN employee_buildings eb ON eb.employee_id = e.id
      LEFT JOIN organization_users ou ON ou.user_id = e.user_id AND ou.organization_id = e.organization_id
      WHERE e.organization_id = ?
        AND (ou.role IS NULL OR ou.role != 'OWNER')
    `;
    const params: any[] = [orgId];

    if (filters?.status) {
      sql += ' AND e.status = ?';
      params.push(filters.status);
    }

    if (filters?.departmentId) {
      sql += ' AND e.department_id = ?';
      params.push(filters.departmentId);
    }

    if (filters?.buildingId) {
      sql += ' AND eb.building_id = ?';
      params.push(filters.buildingId);
    }

    if (filters?.search) {
      sql += ' AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY e.last_name ASC, e.first_name ASC';
    const rows = db.query<Employee>(sql, params);

    return rows.map((e) => {
      const payRate = db.queryOne<PayRate>(`
        SELECT hourly_rate FROM pay_rates
        WHERE organization_id = ? AND employee_id = ?
        ORDER BY effective_from DESC LIMIT 1
      `, [orgId, e.id]);

      const assignedBuildings = db.query<{ id: string; name: string; is_primary: number }>(`
        SELECT b.id, b.name, eb.is_primary
        FROM buildings b
        JOIN employee_buildings eb ON eb.building_id = b.id
        WHERE eb.employee_id = ? AND b.organization_id = ?
      `, [e.id, orgId]).map((b) => ({
        id: b.id,
        name: b.name,
        is_primary: Boolean(b.is_primary)
      }));

      const primary = assignedBuildings.find((b) => b.is_primary)?.name || assignedBuildings[0]?.name || 'Unassigned';

      const department = e.department_id
        ? db.queryOne<Department>('SELECT * FROM departments WHERE id = ?', [e.department_id])
        : null;

      const position = e.position_id
        ? db.queryOne<Position>('SELECT * FROM positions WHERE id = ?', [e.position_id])
        : null;

      return {
        ...e,
        department,
        position,
        current_pay_rate: payRate?.hourly_rate ?? 0,
        assigned_buildings: assignedBuildings,
        primary_building_name: primary,
        recent_sessions_count: 0
      };
    });
  }

  public static getEmployeeDetails(orgId: string, employeeId: string): EmployeeDetailView {
    const employee = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );

    if (!employee) throw new Error('Employee not found');

    const department = employee.department_id
      ? db.queryOne<Department>('SELECT * FROM departments WHERE id = ?', [employee.department_id])
      : null;

    const position = employee.position_id
      ? db.queryOne<Position>('SELECT * FROM positions WHERE id = ?', [employee.position_id])
      : null;

    const payRate = db.queryOne<PayRate>(`
      SELECT hourly_rate FROM pay_rates
      WHERE organization_id = ? AND employee_id = ?
      ORDER BY effective_from DESC LIMIT 1
    `, [orgId, employeeId]);

    const assignedBuildings = db.query<{ id: string; name: string; is_primary: number }>(`
      SELECT b.id, b.name, eb.is_primary
      FROM buildings b
      JOIN employee_buildings eb ON eb.building_id = b.id
      WHERE eb.employee_id = ? AND b.organization_id = ?
    `, [employeeId, orgId]).map((b) => ({
      id: b.id,
      name: b.name,
      is_primary: Boolean(b.is_primary)
    }));

    const primary = assignedBuildings.find((b) => b.is_primary)?.name || assignedBuildings[0]?.name || 'Unassigned';

    const sessionCount = db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM attendance_sessions
      WHERE organization_id = ? AND employee_id = ?
    `, [orgId, employeeId])?.count || 0;

    return {
      ...employee,
      department,
      position,
      current_pay_rate: payRate?.hourly_rate ?? 0,
      assigned_buildings: assignedBuildings,
      primary_building_name: primary,
      recent_sessions_count: sessionCount
    };
  }

  public static getFullEmployeeProfile(orgId: string, employeeId: string): FullEmployeeProfile {
    const detail = this.getEmployeeDetails(orgId, employeeId);

    // Attendance stats
    const totalSessionsRow = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM attendance_sessions WHERE organization_id = ? AND employee_id = ?',
      [orgId, employeeId]
    );
    const totalSessions = totalSessionsRow?.count || 0;

    const presentDaysRow = db.queryOne<{ count: number }>(
      'SELECT COUNT(DISTINCT session_date) as count FROM attendance_sessions WHERE organization_id = ? AND employee_id = ? AND status != "CANCELLED"',
      [orgId, employeeId]
    );
    const presentDays = presentDaysRow?.count || 0;

    const lateArrivalsRow = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM attendance_sessions WHERE organization_id = ? AND employee_id = ? AND is_late = 1',
      [orgId, employeeId]
    );
    const lateArrivals = lateArrivalsRow?.count || 0;

    const recentSessions = db.query(`
      SELECT s.*, b.name as building_name
      FROM attendance_sessions s
      LEFT JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ? AND s.employee_id = ?
      ORDER BY s.session_date DESC, s.check_in_time DESC
      LIMIT 15
    `, [orgId, employeeId]);

    // Leave stats
    const leaveRequests = db.query(`
      SELECT r.*, lt.name as leave_type_name, lt.is_paid
      FROM leave_requests r
      LEFT JOIN leave_types lt ON lt.id = r.leave_type_id
      WHERE r.organization_id = ? AND r.employee_id = ?
      ORDER BY r.created_at DESC
    `, [orgId, employeeId]);

    const approvedCount = leaveRequests.filter((r: any) => r.status === 'APPROVED').length;
    const pendingCount = leaveRequests.filter((r: any) => r.status === 'PENDING').length;
    const rejectedCount = leaveRequests.filter((r: any) => r.status === 'REJECTED').length;

    // Account info
    let hasLogin = false;
    let loginEmail: string | null = null;
    let role = 'EMPLOYEE';
    let isActive = detail.status === 'ACTIVE';

    if (detail.user_id) {
      const userRow = db.queryOne<{ email: string; is_active: number }>('SELECT email, is_active FROM users WHERE id = ?', [detail.user_id]);
      if (userRow) {
        hasLogin = true;
        loginEmail = userRow.email;
        isActive = Boolean(userRow.is_active);
      }
      const orgUser = db.queryOne<{ role: string }>('SELECT role FROM organization_users WHERE organization_id = ? AND user_id = ?', [orgId, detail.user_id]);
      if (orgUser) {
        role = orgUser.role;
      }
    }

    return {
      employee: detail,
      attendanceStats: {
        totalSessions,
        presentDays,
        lateArrivals,
        recentSessions
      },
      leaveStats: {
        totalRequests: leaveRequests.length,
        approvedCount,
        pendingCount,
        rejectedCount,
        requests: leaveRequests
      },
      account: {
        hasLogin,
        loginEmail: loginEmail || detail.email || null,
        role,
        isActive
      }
    };
  }

  public static createEmployee(orgId: string, actorUserId: string, data: CreateEmployeeInput): EmployeeDetailView {
    let employeeCode = data.employee_code?.trim();

    if (employeeCode) {
      const existing = db.queryOne<Employee>(
        'SELECT id FROM employees WHERE organization_id = ? AND employee_code = ?',
        [orgId, employeeCode]
      );
      if (existing) {
        throw new Error(`Employee with ID / Code '${employeeCode}' already exists in this organization`);
      }
    } else {
      // Auto-generate a guaranteed unique code
      employeeCode = `NYC-${Math.floor(10000 + Math.random() * 90000)}`;
      let existing = db.queryOne<Employee>(
        'SELECT id FROM employees WHERE organization_id = ? AND employee_code = ?',
        [orgId, employeeCode]
      );
      let attempts = 0;
      while (existing && attempts < 50) {
        employeeCode = `NYC-${Math.floor(10000 + Math.random() * 90000)}`;
        existing = db.queryOne<Employee>(
          'SELECT id FROM employees WHERE organization_id = ? AND employee_code = ?',
          [orgId, employeeCode]
        );
        attempts++;
      }
    }

    const employeeId = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.execute(`
        INSERT INTO employees (
          id, organization_id, employee_code, first_name, last_name,
          email, phone, department_id, position_id, manager_id,
          employment_type, status, hire_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        employeeId, orgId, employeeCode, data.first_name.trim(), data.last_name.trim(),
        data.email?.toLowerCase().trim() || null, data.phone || null, data.department_id || null,
        data.position_id || null, data.manager_id || null, data.employment_type || 'HOURLY',
        data.status || 'ACTIVE', data.hire_date || now.split('T')[0], now, now
      ]);

      if (data.hourly_rate !== undefined && data.hourly_rate > 0) {
        db.execute(`
          INSERT INTO pay_rates (id, organization_id, employee_id, hourly_rate, effective_from)
          VALUES (?, ?, ?, ?, ?)
        `, [uuidv4(), orgId, employeeId, data.hourly_rate, data.hire_date || now.split('T')[0]]);
      }

      if (data.building_ids && data.building_ids.length > 0) {
        for (let i = 0; i < data.building_ids.length; i++) {
          const bId = data.building_ids[i];
          db.execute(`
            INSERT INTO employee_buildings (employee_id, building_id, is_primary)
            VALUES (?, ?, ?)
          `, [employeeId, bId, i === 0 ? 1 : 0]);
        }
      }

      // Auto-create permanent user login if email provided
      if (data.email && data.email.trim()) {
        const normalizedEmail = data.email.toLowerCase().trim();
        let existingUser = db.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        let userId = existingUser?.id;

        if (!userId) {
          // Create brand-new user account
          userId = uuidv4();
          const rawPass = data.password && data.password.length >= 6 ? data.password : 'Password123!';
          const hash = bcrypt.hashSync(rawPass, 10);
          db.execute(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          `, [userId, normalizedEmail, hash, data.first_name.trim(), data.last_name.trim(), data.phone || null, now, now]);
        } else {
          // User already exists — update their password if a specific one was provided
          if (data.password && data.password.length >= 6) {
            const hash = bcrypt.hashSync(data.password, 10);
            db.execute('UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?', [hash, now, userId]);
          } else {
            // At minimum ensure the account is active
            db.execute('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?', [now, userId]);
          }
        }

        // Upsert organization_users — always ensure EMPLOYEE is active and linked
        const existingOrgUser = db.queryOne<{ id: string; is_active: number }>(
          'SELECT id, is_active FROM organization_users WHERE organization_id = ? AND user_id = ?',
          [orgId, userId]
        );

        if (existingOrgUser) {
          db.execute(
            'UPDATE organization_users SET role = ?, is_active = 1, updated_at = ? WHERE id = ?',
            ['EMPLOYEE', now, existingOrgUser.id]
          );
        } else {
          db.execute(`
            INSERT INTO organization_users (id, organization_id, user_id, role, assigned_building_ids, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'EMPLOYEE', ?, 1, ?, ?)
          `, [uuidv4(), orgId, userId, JSON.stringify(data.building_ids || []), now, now]);
        }

        // Link employee record to user
        db.execute('UPDATE employees SET user_id = ? WHERE id = ?', [userId, employeeId]);
      }

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'EMPLOYEE.CREATE',
        entityType: 'employees',
        entityId: employeeId,
        afterState: data
      });
    });

    return this.getEmployeeDetails(orgId, employeeId);
  }

  public static updateEmployee(
    orgId: string,
    actorUserId: string,
    employeeId: string,
    data: Partial<CreateEmployeeInput>
  ): EmployeeDetailView {
    const existing = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );

    if (!existing) throw new Error('Employee not found');

    const now = new Date().toISOString();

    db.transaction(() => {
      // 1. Update employees table
      const updatedCode = data.employee_code?.trim() || existing.employee_code;
      const updatedFirst = data.first_name?.trim() || existing.first_name;
      const updatedLast = data.last_name?.trim() || existing.last_name;
      const updatedEmail = data.email !== undefined ? (data.email?.toLowerCase().trim() || null) : existing.email;
      const updatedPhone = data.phone !== undefined ? (data.phone || null) : existing.phone;
      const updatedDept = data.department_id !== undefined ? (data.department_id || null) : existing.department_id;
      const updatedPos = data.position_id !== undefined ? (data.position_id || null) : existing.position_id;
      const updatedType = data.employment_type || existing.employment_type;
      const updatedStatus = data.status || existing.status;
      const updatedHireDate = data.hire_date || existing.hire_date;

      db.execute(`
        UPDATE employees SET
          employee_code = ?,
          first_name = ?,
          last_name = ?,
          email = ?,
          phone = ?,
          department_id = ?,
          position_id = ?,
          employment_type = ?,
          status = ?,
          hire_date = ?,
          updated_at = ?
        WHERE id = ? AND organization_id = ?
      `, [
        updatedCode, updatedFirst, updatedLast, updatedEmail, updatedPhone,
        updatedDept, updatedPos, updatedType, updatedStatus, updatedHireDate,
        now, employeeId, orgId
      ]);

      // 2. Synchronize with users table if employee has user_id
      if (existing.user_id) {
        db.execute(`
          UPDATE users SET
            email = COALESCE(?, email),
            first_name = ?,
            last_name = ?,
            phone = ?,
            updated_at = ?
          WHERE id = ?
        `, [updatedEmail, updatedFirst, updatedLast, updatedPhone, now, existing.user_id]);
      } else if (updatedEmail) {
        // Create user login if email was added during edit
        let existingUser = db.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [updatedEmail]);
        let userId = existingUser?.id;
        if (!userId) {
          userId = uuidv4();
          const hash = bcrypt.hashSync('Password123!', 10);
          db.execute(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          `, [userId, updatedEmail, hash, updatedFirst, updatedLast, updatedPhone, now, now]);
        }
        db.execute(`
          INSERT OR IGNORE INTO organization_users (id, organization_id, user_id, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'EMPLOYEE', 1, ?, ?)
        `, [uuidv4(), orgId, userId, now, now]);
        db.execute('UPDATE employees SET user_id = ? WHERE id = ?', [userId, employeeId]);
      }

      // 3. Update pay rate
      if (data.hourly_rate !== undefined && data.hourly_rate > 0) {
        db.execute(`
          INSERT INTO pay_rates (id, organization_id, employee_id, hourly_rate, effective_from)
          VALUES (?, ?, ?, ?, ?)
        `, [uuidv4(), orgId, employeeId, data.hourly_rate, now.split('T')[0]]);
      }

      // 4. Update assigned buildings
      if (data.building_ids !== undefined) {
        db.execute('DELETE FROM employee_buildings WHERE employee_id = ?', [employeeId]);
        for (let i = 0; i < data.building_ids.length; i++) {
          db.execute(`
            INSERT INTO employee_buildings (employee_id, building_id, is_primary)
            VALUES (?, ?, ?)
          `, [employeeId, data.building_ids[i], i === 0 ? 1 : 0]);
        }
      }

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'EMPLOYEE.UPDATE',
        entityType: 'employees',
        entityId: employeeId,
        beforeState: existing,
        afterState: data
      });
    });

    return this.getEmployeeDetails(orgId, employeeId);
  }

  public static resetEmployeePassword(
    orgId: string,
    actorUserId: string,
    employeeId: string,
    newPassword?: string
  ): { success: boolean; newPassword?: string; message: string } {
    const employee = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );
    if (!employee) throw new Error('Employee not found');

    const passToSet = newPassword && newPassword.length >= 6
      ? newPassword
      : `NYC-${Math.random().toString(36).substring(2, 8)}!`;

    const hash = bcrypt.hashSync(passToSet, 10);
    const now = new Date().toISOString();

    db.transaction(() => {
      let userId = employee.user_id;

      if (!userId && employee.email) {
        const normalizedEmail = employee.email.toLowerCase().trim();
        let existingUser = db.queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
        userId = existingUser?.id;
        if (!userId) {
          userId = uuidv4();
          db.execute(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `, [userId, normalizedEmail, hash, employee.first_name, employee.last_name, now, now]);
        }
        db.execute(`
          INSERT OR IGNORE INTO organization_users (id, organization_id, user_id, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'EMPLOYEE', 1, ?, ?)
        `, [uuidv4(), orgId, userId, now, now]);
        db.execute('UPDATE employees SET user_id = ? WHERE id = ?', [userId, employeeId]);
      } else if (userId) {
        db.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now, userId]);
      } else {
        throw new Error('Employee does not have an email address assigned. Please set an email first.');
      }

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'EMPLOYEE.RESET_PASSWORD',
        entityType: 'employees',
        entityId: employeeId,
        afterState: { email: employee.email }
      });
    });

    return {
      success: true,
      newPassword: passToSet,
      message: `Password for ${employee.first_name} ${employee.last_name} has been successfully reset.`
    };
  }

  public static deleteEmployee(orgId: string, actorUserId: string, employeeId: string): void {
    const existing = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );
    if (!existing) throw new Error('Employee not found');

    db.transaction(() => {
      // Clean up relations
      db.execute('DELETE FROM employee_buildings WHERE employee_id = ?', [employeeId]);
      db.execute('DELETE FROM pay_rates WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);
      db.execute('DELETE FROM schedule_assignments WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);
      db.execute('DELETE FROM attendance_events WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);
      db.execute('DELETE FROM attendance_sessions WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);
      db.execute('DELETE FROM leave_requests WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);
      db.execute('DELETE FROM employee_device_enrollments WHERE employee_id = ? AND organization_id = ?', [employeeId, orgId]);

      if (existing.user_id) {
        db.execute('DELETE FROM organization_users WHERE user_id = ? AND organization_id = ?', [existing.user_id, orgId]);
        const otherOrgs = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM organization_users WHERE user_id = ?', [existing.user_id]);
        if (!otherOrgs || otherOrgs.count === 0) {
          db.execute('DELETE FROM users WHERE id = ?', [existing.user_id]);
        }
      }

      db.execute('DELETE FROM employees WHERE id = ? AND organization_id = ?', [employeeId, orgId]);

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'EMPLOYEE.DELETE',
        entityType: 'employees',
        entityId: employeeId,
        beforeState: existing
      });
    });
  }

  public static archiveEmployee(orgId: string, actorUserId: string, employeeId: string): void {
    const existing = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );
    if (!existing) throw new Error('Employee not found');

    const now = new Date().toISOString();
    db.execute(`
      UPDATE employees SET status = 'INACTIVE', updated_at = ? WHERE id = ? AND organization_id = ?
    `, [now, employeeId, orgId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'EMPLOYEE.ARCHIVE',
      entityType: 'employees',
      entityId: employeeId,
      beforeState: existing
    });
  }

  public static reactivateEmployee(orgId: string, actorUserId: string, employeeId: string): void {
    const existing = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ?',
      [orgId, employeeId]
    );
    if (!existing) throw new Error('Employee not found');

    const now = new Date().toISOString();
    db.execute(`
      UPDATE employees SET status = 'ACTIVE', updated_at = ? WHERE id = ? AND organization_id = ?
    `, [now, employeeId, orgId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'EMPLOYEE.REACTIVATE',
      entityType: 'employees',
      entityId: employeeId,
      beforeState: existing
    });
  }
}
