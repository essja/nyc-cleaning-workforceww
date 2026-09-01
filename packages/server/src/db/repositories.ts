import { db } from './index.js';
import {
  Organization, User, OrganizationUser, Building, Employee,
  Shift, ScheduleAssignment, AttendanceEvent, AttendanceSession,
  PayRate, OvertimeRule, PayrollPeriod, PayrollRecord, LeaveType,
  LeaveRequest, BiometricDevice, AuditLog
} from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class BaseRepository {
  protected db = db;
}

export class OrganizationRepository extends BaseRepository {
  findById(id: string): Organization | null {
    return this.db.queryOne<Organization>('SELECT * FROM organizations WHERE id = ?', [id]);
  }

  findBySlug(slug: string): Organization | null {
    return this.db.queryOne<Organization>('SELECT * FROM organizations WHERE slug = ?', [slug]);
  }

  create(data: Partial<Organization>): Organization {
    const id = data.id || uuidv4();
    const now = new Date().toISOString();
    this.db.execute(`
      INSERT INTO organizations (id, name, slug, work_week_start, timezone, currency, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, data.name, data.slug, data.work_week_start ?? 0,
      data.timezone || 'UTC', data.currency || 'USD',
      data.settings || '{}', now, now
    ]);
    return this.findById(id)!;
  }
}

export class BuildingRepository extends BaseRepository {
  findByOrg(orgId: string): Building[] {
    return this.db.query<Building>('SELECT * FROM buildings WHERE organization_id = ? AND is_active = 1', [orgId]);
  }

  findById(orgId: string, id: string): Building | null {
    return this.db.queryOne<Building>('SELECT * FROM buildings WHERE organization_id = ? AND id = ?', [orgId, id]);
  }

  create(orgId: string, data: Partial<Building>): Building {
    const id = data.id || uuidv4();
    const now = new Date().toISOString();
    this.db.execute(`
      INSERT INTO buildings (
        id, organization_id, name, code, address_line1, address_line2,
        city, state_province, postal_code, country, latitude, longitude,
        geofence_radius_meters, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [
      id, orgId, data.name, data.code || null, data.address_line1, data.address_line2 || null,
      data.city, data.state_province || null, data.postal_code || null, data.country,
      data.latitude, data.longitude, data.geofence_radius_meters ?? 100, now, now
    ]);
    return this.findById(orgId, id)!;
  }
}

export class EmployeeRepository extends BaseRepository {
  findByOrg(orgId: string): Employee[] {
    return this.db.query<Employee>('SELECT * FROM employees WHERE organization_id = ? ORDER BY last_name, first_name', [orgId]);
  }

  findById(orgId: string, id: string): Employee | null {
    return this.db.queryOne<Employee>('SELECT * FROM employees WHERE organization_id = ? AND id = ?', [orgId, id]);
  }

  findByUserId(userId: string): Employee | null {
    return this.db.queryOne<Employee>('SELECT * FROM employees WHERE user_id = ?', [userId]);
  }

  findByCode(orgId: string, code: string): Employee | null {
    return this.db.queryOne<Employee>('SELECT * FROM employees WHERE organization_id = ? AND employee_code = ?', [orgId, code]);
  }

  create(orgId: string, data: Partial<Employee>): Employee {
    const id = data.id || uuidv4();
    const now = new Date().toISOString();
    this.db.execute(`
      INSERT INTO employees (
        id, organization_id, user_id, employee_code, first_name, last_name,
        email, phone, department_id, position_id, manager_id, employment_type,
        status, hire_date, avatar_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, orgId, data.user_id || null, data.employee_code, data.first_name, data.last_name,
      data.email || null, data.phone || null, data.department_id || null, data.position_id || null,
      data.manager_id || null, data.employment_type || 'HOURLY', data.status || 'ACTIVE',
      data.hire_date || null, data.avatar_url || null, now, now
    ]);
    return this.findById(orgId, id)!;
  }
}

export class AttendanceRepository extends BaseRepository {
  recordEvent(event: Partial<AttendanceEvent>): AttendanceEvent {
    const id = event.id || uuidv4();
    const now = new Date().toISOString();
    this.db.execute(`
      INSERT INTO attendance_events (
        id, organization_id, employee_id, event_type, source, timestamp, received_at,
        building_id, device_id, latitude, longitude, accuracy_meters,
        distance_to_building_meters, is_within_geofence, biometric_verified,
        auth_method, sync_status, client_event_id, raw_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, event.organization_id, event.employee_id, event.event_type, event.source,
      event.timestamp || now, now, event.building_id || null, event.device_id || null,
      event.latitude || null, event.longitude || null, event.accuracy_meters || null,
      event.distance_to_building_meters || null, event.is_within_geofence ?? null,
      event.biometric_verified ? 1 : 0, event.auth_method || 'PHONE_BIOMETRIC',
      event.sync_status || 'SYNCED', event.client_event_id || null,
      event.raw_payload || '{}', now
    ]);

    return this.db.queryOne<AttendanceEvent>('SELECT * FROM attendance_events WHERE id = ?', [id])!;
  }

  findEventsByEmployee(orgId: string, employeeId: string, limit: number = 50): AttendanceEvent[] {
    return this.db.query<AttendanceEvent>(`
      SELECT * FROM attendance_events
      WHERE organization_id = ? AND employee_id = ?
      ORDER BY timestamp DESC LIMIT ?
    `, [orgId, employeeId, limit]);
  }

  findOpenSession(orgId: string, employeeId: string): AttendanceSession | null {
    return this.db.queryOne<AttendanceSession>(`
      SELECT * FROM attendance_sessions
      WHERE organization_id = ? AND employee_id = ? AND status = 'OPEN'
      ORDER BY check_in_time DESC LIMIT 1
    `, [orgId, employeeId]);
  }

  findSessionsByDate(orgId: string, date: string): AttendanceSession[] {
    return this.db.query<AttendanceSession>(`
      SELECT * FROM attendance_sessions
      WHERE organization_id = ? AND session_date = ?
      ORDER BY check_in_time DESC
    `, [orgId, date]);
  }
}

export const orgRepo = new OrganizationRepository();
export const buildingRepo = new BuildingRepository();
export const employeeRepo = new EmployeeRepository();
export const attendanceRepo = new AttendanceRepository();
