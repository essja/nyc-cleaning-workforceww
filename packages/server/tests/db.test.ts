import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 2 — Production Database Architecture & Integrity', () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = DatabaseService.getInstance();
    await seedDatabase();
  });

  it('should verify all core tables exist in the database', () => {
    const expectedTables = [
      'organizations', 'users', 'organization_users', 'roles', 'permissions',
      'role_permissions', 'departments', 'positions', 'buildings', 'geofences',
      'employees', 'employee_buildings', 'shifts', 'schedules',
      'schedule_assignments', 'biometric_devices', 'employee_device_enrollments',
      'biometric_device_events', 'attendance_events', 'attendance_sessions',
      'breaks', 'pay_rates', 'overtime_rules', 'payroll_periods',
      'payroll_records', 'leave_types', 'leave_requests', 'notifications',
      'audit_logs', 'imports', 'import_errors', 'synchronization_events'
    ];

    const rows = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    );
    const existingTableNames = rows.map((r) => r.name);

    for (const table of expectedTables) {
      expect(existingTableNames).toContain(table);
    }
  });

  it('should enforce strict tenant isolation between organizations', () => {
    const org1 = db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE slug = ?', ['apex-facility']);
    const org2 = db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE slug = ?', ['prime-services']);

    expect(org1).toBeDefined();
    expect(org2).toBeDefined();

    // Query employees for Org 1
    const org1Employees = db.query('SELECT * FROM employees WHERE organization_id = ?', [org1!.id]);
    expect(org1Employees.length).toBeGreaterThan(0);

    // Query employees for Org 2
    const org2Employees = db.query('SELECT * FROM employees WHERE organization_id = ?', [org2!.id]);
    expect(org2Employees.length).toBe(0);

    // Query buildings for Org 1 vs Org 2
    const org1Buildings = db.query('SELECT * FROM buildings WHERE organization_id = ?', [org1!.id]);
    const org2Buildings = db.query('SELECT * FROM buildings WHERE organization_id = ?', [org2!.id]);

    expect(org1Buildings.length).toBe(3);
    expect(org2Buildings.length).toBe(1);
  });

  it('should enforce composite unique constraint for employee_code per organization', () => {
    const org1 = db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE slug = ?', ['apex-facility']);
    const org2 = db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE slug = ?', ['prime-services']);

    // Attempting to insert a duplicate employee code in Org 1 should fail
    expect(() => {
      db.execute(`
        INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, status)
        VALUES (?, ?, 'EMP-1001', 'Duplicate', 'Worker', 'ACTIVE')
      `, [uuidv4(), org1!.id]);
    }).toThrow();

    // The SAME employee code in Org 2 must succeed (tenant isolation)
    expect(() => {
      db.execute(`
        INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, status)
        VALUES (?, ?, 'EMP-1001', 'Other Company', 'Worker', 'ACTIVE')
      `, [uuidv4(), org2!.id]);
    }).not.toThrow();
  });

  it('should enforce foreign key constraints', () => {
    const fakeOrgId = uuidv4();

    // Inserting an employee with a non-existent org ID must throw a FK constraint error
    expect(() => {
      db.execute(`
        INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, status)
        VALUES (?, ?, 'EMP-9999', 'Ghost', 'User', 'ACTIVE')
      `, [uuidv4(), fakeOrgId]);
    }).toThrow();
  });

  it('should enforce idempotency and unique client_event_id on attendance_events', () => {
    const org = db.queryOne<{ id: string }>('SELECT id FROM organizations WHERE slug = ?', ['apex-facility']);
    const emp = db.queryOne<{ id: string }>('SELECT id FROM employees WHERE organization_id = ? LIMIT 1', [org!.id]);

    const clientEventId = uuidv4();
    const now = new Date().toISOString();

    // First insert succeeds
    db.execute(`
      INSERT INTO attendance_events (
        id, organization_id, employee_id, event_type, source, timestamp, received_at,
        auth_method, sync_status, client_event_id
      ) VALUES (?, ?, ?, 'CHECK_IN', 'MOBILE_APP', ?, ?, 'PHONE_BIOMETRIC', 'SYNCED', ?)
    `, [uuidv4(), org!.id, emp!.id, now, now, clientEventId]);

    // Duplicate client_event_id must fail
    expect(() => {
      db.execute(`
        INSERT INTO attendance_events (
          id, organization_id, employee_id, event_type, source, timestamp, received_at,
          auth_method, sync_status, client_event_id
        ) VALUES (?, ?, ?, 'CHECK_IN', 'MOBILE_APP', ?, ?, 'PHONE_BIOMETRIC', 'SYNCED', ?)
      `, [uuidv4(), org!.id, emp!.id, now, now, clientEventId]);
    }).toThrow();
  });

  it('should verify cascade deletions on organization removal', () => {
    const tempOrgId = uuidv4();
    db.execute(`
      INSERT INTO organizations (id, name, slug) VALUES (?, 'Temp Org', 'temp-org')
    `, [tempOrgId]);

    const tempBldId = uuidv4();
    db.execute(`
      INSERT INTO buildings (id, organization_id, name, address_line1, city, country, latitude, longitude)
      VALUES (?, ?, 'Temp Site', '123 Test Rd', 'City', 'Country', 0, 0)
    `, [tempBldId, tempOrgId]);

    // Delete organization
    db.execute('DELETE FROM organizations WHERE id = ?', [tempOrgId]);

    // Building should be automatically cascade-deleted
    const bld = db.queryOne('SELECT * FROM buildings WHERE id = ?', [tempBldId]);
    expect(bld).toBeNull();
  });
});
