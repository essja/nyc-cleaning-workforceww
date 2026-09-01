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
  recent_sessions_count: number;
}

export class EmployeesService {
  public static listEmployees(
    orgId: string,
    filters?: { departmentId?: string; status?: string; search?: string; buildingId?: string }
  ): Employee[] {
    let sql = `
      SELECT DISTINCT e.*
      FROM employees e
      LEFT JOIN employee_buildings eb ON eb.employee_id = e.id
      WHERE e.organization_id = ?
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
    return db.query<Employee>(sql, params);
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
      recent_sessions_count: sessionCount
    };
  }

  public static createEmployee(orgId: string, actorUserId: string, data: CreateEmployeeInput): EmployeeDetailView {
    const existing = db.queryOne<Employee>(
      'SELECT id FROM employees WHERE organization_id = ? AND employee_code = ?',
      [orgId, data.employee_code.trim()]
    );

    if (existing) {
      throw new Error(`Employee with ID / Code '${data.employee_code}' already exists in this organization`);
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
        employeeId, orgId, data.employee_code.trim(), data.first_name.trim(), data.last_name.trim(),
        data.email?.toLowerCase().trim() || null, data.phone || null, data.department_id || null,
        data.position_id || null, data.manager_id || null, data.employment_type || 'HOURLY',
        data.status || 'ACTIVE', data.hire_date || null, now, now
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
          userId = uuidv4();
          const rawPass = data.password && data.password.length >= 6 ? data.password : 'Password123!';
          const hash = bcrypt.hashSync(rawPass, 10);
          db.execute(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `, [userId, normalizedEmail, hash, data.first_name.trim(), data.last_name.trim(), now, now]);
        }

        // Add to organization_users
        db.execute(`
          INSERT OR IGNORE INTO organization_users (id, organization_id, user_id, role, assigned_building_ids, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'EMPLOYEE', ?, 1, ?, ?)
        `, [uuidv4(), orgId, userId, JSON.stringify(data.building_ids || []), now, now]);

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
      db.execute(`
        UPDATE employees SET
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          department_id = COALESCE(?, department_id),
          position_id = COALESCE(?, position_id),
          manager_id = COALESCE(?, manager_id),
          employment_type = COALESCE(?, employment_type),
          status = COALESCE(?, status),
          hire_date = COALESCE(?, hire_date),
          updated_at = ?
        WHERE id = ? AND organization_id = ?
      `, [
        data.first_name?.trim() || null,
        data.last_name?.trim() || null,
        data.email?.toLowerCase().trim() || null,
        data.phone || null,
        data.department_id || null,
        data.position_id || null,
        data.manager_id || null,
        data.employment_type || null,
        data.status || null,
        data.hire_date || null,
        now, employeeId, orgId
      ]);

      if (data.hourly_rate !== undefined) {
        db.execute(`
          INSERT INTO pay_rates (id, organization_id, employee_id, hourly_rate, effective_from)
          VALUES (?, ?, ?, ?, ?)
        `, [uuidv4(), orgId, employeeId, data.hourly_rate, now.split('T')[0]]);
      }

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
