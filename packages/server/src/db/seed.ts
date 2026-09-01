import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { db } from './index.js';
import { runMigrations } from './migrate.js';

export async function seedDatabase() {
  console.log('🌱 Seeding database with initial enterprise multi-tenant data...');
  runMigrations();

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const now = new Date().toISOString();

  db.transaction(() => {
    // Clear existing data in reverse dependency order
    const tables = [
      'synchronization_events', 'import_errors', 'imports', 'audit_logs',
      'notifications', 'leave_requests', 'leave_types', 'payroll_records',
      'payroll_periods', 'overtime_rules', 'pay_rates', 'breaks',
      'attendance_sessions', 'attendance_events', 'biometric_device_events',
      'employee_device_enrollments', 'biometric_devices', 'schedule_assignments',
      'schedules', 'shifts', 'employee_buildings', 'employees', 'geofences',
      'buildings', 'positions', 'departments', 'organization_users',
      'role_permissions', 'roles', 'permissions', 'users', 'organizations'
    ];
    for (const t of tables) {
      db.execute(`DELETE FROM ${t};`);
    }

    // 1. Permissions
    const permissionDefs = [
      { code: 'org:read', name: 'View Organization', category: 'Organization' },
      { code: 'org:write', name: 'Manage Organization', category: 'Organization' },
      { code: 'employee:read', name: 'View Employees', category: 'Employees' },
      { code: 'employee:write', name: 'Manage Employees', category: 'Employees' },
      { code: 'building:read', name: 'View Buildings', category: 'Buildings' },
      { code: 'building:write', name: 'Manage Buildings', category: 'Buildings' },
      { code: 'schedule:read', name: 'View Schedules', category: 'Scheduling' },
      { code: 'schedule:write', name: 'Manage Schedules', category: 'Scheduling' },
      { code: 'attendance:punch', name: 'Clock In / Out', category: 'Attendance' },
      { code: 'attendance:review', name: 'Review Attendance', category: 'Attendance' },
      { code: 'attendance:adjust', name: 'Adjust Attendance', category: 'Attendance' },
      { code: 'payroll:read', name: 'View Payroll', category: 'Payroll' },
      { code: 'payroll:approve', name: 'Approve Payroll', category: 'Payroll' },
      { code: 'leave:request', name: 'Request Leave', category: 'Leave' },
      { code: 'leave:approve', name: 'Approve Leave', category: 'Leave' },
      { code: 'reports:view', name: 'View Reports', category: 'Reports' },
      { code: 'audit:view', name: 'View Audit Logs', category: 'Audit' },
      { code: 'devices:manage', name: 'Manage Biometric Devices', category: 'Hardware' }
    ];

    const permStmt = db.getDb().prepare(`
      INSERT INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)
    `);
    const permMap = new Map<string, string>();
    for (const p of permissionDefs) {
      const id = uuidv4();
      permStmt.run(id, p.code, p.name, p.category, `${p.name} description`);
      permMap.set(p.code, id);
    }

    // 2. Roles
    const roleDefs = [
      { code: 'OWNER', name: 'Organization Owner', perms: Array.from(permMap.keys()) },
      { code: 'ADMIN', name: 'Administrator', perms: Array.from(permMap.keys()) },
      { code: 'HR_MANAGER', name: 'HR Manager', perms: ['employee:read', 'employee:write', 'schedule:read', 'schedule:write', 'attendance:review', 'leave:request', 'leave:approve', 'payroll:read', 'payroll:approve', 'reports:view'] },
      { code: 'MANAGER', name: 'Operations Manager', perms: ['employee:read', 'building:read', 'schedule:read', 'schedule:write', 'attendance:review', 'attendance:adjust', 'leave:request', 'leave:approve', 'reports:view'] },
      { code: 'SUPERVISOR', name: 'Site Supervisor', perms: ['employee:read', 'building:read', 'schedule:read', 'attendance:review', 'reports:view'] },
      { code: 'EMPLOYEE', name: 'Staff Employee', perms: ['schedule:read', 'attendance:punch', 'leave:request'] }
    ];

    const roleStmt = db.getDb().prepare(`INSERT INTO roles (id, code, name, description) VALUES (?, ?, ?, ?)`);
    const rolePermStmt = db.getDb().prepare(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);

    for (const r of roleDefs) {
      const roleId = uuidv4();
      roleStmt.run(roleId, r.code, r.name, `${r.name} role`);
      for (const pCode of r.perms) {
        const pId = permMap.get(pCode);
        if (pId) rolePermStmt.run(roleId, pId);
      }
    }

    // 3. Organization 1: Apex Facility Solutions (Primary demo customer)
    const org1Id = uuidv4();
    db.execute(`
      INSERT INTO organizations (id, name, slug, work_week_start, timezone, currency, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      org1Id,
      'Apex Facility Solutions',
      'apex-facility',
      0, // Sunday
      'America/New_York',
      'USD',
      JSON.stringify({
        geofence_strict: true,
        auto_checkout_hours: 12,
        allow_offline_punch: true,
        require_phone_biometrics: true
      }),
      now, now
    ]);

    // Organization 2: Prime Property Services (For Multi-Tenant Isolation verification)
    const org2Id = uuidv4();
    db.execute(`
      INSERT INTO organizations (id, name, slug, work_week_start, timezone, currency, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      org2Id,
      'Prime Property Services',
      'prime-services',
      1, // Monday
      'America/Chicago',
      'USD',
      JSON.stringify({ geofence_strict: true }),
      now, now
    ]);

    // 4. Overtime Rules for Org 1
    db.execute(`
      INSERT INTO overtime_rules (id, organization_id, daily_threshold_hours, weekly_threshold_hours, overtime_multiplier, double_time_threshold_hours, double_time_multiplier, weekend_multiplier, holiday_multiplier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [uuidv4(), org1Id, 8.0, 40.0, 1.5, 12.0, 2.0, 1.5, 2.0]);

    // Overtime Rules for Org 2
    db.execute(`
      INSERT INTO overtime_rules (id, organization_id, daily_threshold_hours, weekly_threshold_hours, overtime_multiplier)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), org2Id, 8.0, 40.0, 1.5]);

    // 5. Buildings for Apex Facility Solutions
    const bld1Id = uuidv4();
    const bld2Id = uuidv4();
    const bld3Id = uuidv4();

    db.execute(`
      INSERT INTO buildings (id, organization_id, name, code, address_line1, city, state_province, postal_code, country, latitude, longitude, geofence_radius_meters, is_active)
      VALUES 
      (?, ?, 'Downtown Medical Plaza', 'BLD-DMP', '100 Main Street', 'New York', 'NY', '10001', 'USA', 40.7128, -74.0060, 150, 1),
      (?, ?, 'Metro Financial Tower', 'BLD-MFT', '450 Lexington Ave', 'New York', 'NY', '10017', 'USA', 40.7527, -73.9772, 100, 1),
      (?, ?, 'Harbor Gateway Industrial', 'BLD-HGI', '1200 Bay Street', 'Staten Island', 'NY', '10305', 'USA', 40.6413, -74.0776, 200, 1)
    `, [bld1Id, org1Id, bld2Id, org1Id, bld3Id, org1Id]);

    // Building for Org 2
    const org2BldId = uuidv4();
    db.execute(`
      INSERT INTO buildings (id, organization_id, name, code, address_line1, city, state_province, postal_code, country, latitude, longitude, geofence_radius_meters, is_active)
      VALUES (?, ?, 'Midwest Logistics Hub', 'BLD-MLH', '500 Commerce Way', 'Chicago', 'IL', '60601', 'USA', 41.8781, -87.6298, 150, 1)
    `, [org2BldId, org2Id]);

    // 6. Departments & Positions
    const deptCleaningId = uuidv4();
    const deptMaintenanceId = uuidv4();
    const deptSupervisionId = uuidv4();

    db.execute(`
      INSERT INTO departments (id, organization_id, name, code)
      VALUES 
      (?, ?, 'Commercial Cleaning', 'CLEAN'),
      (?, ?, 'Facility Maintenance', 'MAINT'),
      (?, ?, 'Operations Supervision', 'SUPV')
    `, [deptCleaningId, org1Id, deptMaintenanceId, org1Id, deptSupervisionId, org1Id]);

    const posCustodianId = uuidv4();
    const posFloorTechId = uuidv4();
    const posHvacTechId = uuidv4();
    const posLeadSupervisorId = uuidv4();

    db.execute(`
      INSERT INTO positions (id, organization_id, department_id, title, code)
      VALUES
      (?, ?, ?, 'Commercial Custodian', 'POS-CUST'),
      (?, ?, ?, 'Floor Care Specialist', 'POS-FLR'),
      (?, ?, ?, 'HVAC & Maintenance Tech', 'POS-HVAC'),
      (?, ?, ?, 'Site Operations Supervisor', 'POS-SUPV')
    `, [
      posCustodianId, org1Id, deptCleaningId,
      posFloorTechId, org1Id, deptCleaningId,
      posHvacTechId, org1Id, deptMaintenanceId,
      posLeadSupervisorId, org1Id, deptSupervisionId
    ]);

    // 7. Users & Org Users
    const usersData = [
      { email: 'admin@apex.com', first: 'Marcus', last: 'Vance', role: 'ADMIN', phone: '+1-555-0100' },
      { email: 'hr@apex.com', first: 'Elena', last: 'Reyes', role: 'HR_MANAGER', phone: '+1-555-0101' },
      { email: 'manager@apex.com', first: 'Robert', last: 'Sterling', role: 'MANAGER', phone: '+1-555-0102' },
      { email: 'supervisor@apex.com', first: 'Carlos', last: 'Mendez', role: 'SUPERVISOR', phone: '+1-555-0103' },
      { email: 'john.doe@apex.com', first: 'John', last: 'Doe', role: 'EMPLOYEE', phone: '+1-555-0104' },
      { email: 'sarah.smith@apex.com', first: 'Sarah', last: 'Smith', role: 'EMPLOYEE', phone: '+1-555-0105' },
      { email: 'david.kim@apex.com', first: 'David', last: 'Kim', role: 'EMPLOYEE', phone: '+1-555-0106' },
      { email: 'amara.diallo@apex.com', first: 'Amara', last: 'Diallo', role: 'EMPLOYEE', phone: '+1-555-0107' }
    ];

    const userMap = new Map<string, string>();
    for (const u of usersData) {
      const uId = uuidv4();
      userMap.set(u.email, uId);
      db.execute(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `, [uId, u.email, passwordHash, u.first, u.last, u.phone]);

      db.execute(`
        INSERT INTO organization_users (id, organization_id, user_id, role, is_active, activated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `, [uuidv4(), org1Id, uId, u.role, now]);
    }

    // Org 2 Admin User
    const org2AdminId = uuidv4();
    db.execute(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active)
      VALUES (?, 'admin@primeservices.com', ?, 'Karen', 'O''Connor', '+1-555-0200', 1)
    `, [org2AdminId, passwordHash]);
    db.execute(`
      INSERT INTO organization_users (id, organization_id, user_id, role, is_active, activated_at)
      VALUES (?, ?, ?, 'OWNER', 1, ?)
    `, [uuidv4(), org2Id, org2AdminId, now]);

    // 8. Employees for Apex
    const empAdminId = uuidv4();
    const empHrId = uuidv4();
    const empMgrId = uuidv4();
    const empSupvId = uuidv4();
    const empJohnId = uuidv4();
    const empSarahId = uuidv4();
    const empDavidId = uuidv4();
    const empAmaraId = uuidv4();

    db.execute(`
      INSERT INTO employees (id, organization_id, user_id, employee_code, first_name, last_name, email, phone, department_id, position_id, employment_type, status, hire_date)
      VALUES
      (?, ?, ?, 'EMP-1000', 'Marcus', 'Vance', 'admin@apex.com', '+1-555-0100', ?, ?, 'SALARIED', 'ACTIVE', '2022-01-01'),
      (?, ?, ?, 'EMP-1008', 'Elena', 'Reyes', 'hr@apex.com', '+1-555-0101', ?, ?, 'SALARIED', 'ACTIVE', '2022-06-01'),
      (?, ?, ?, 'EMP-1009', 'Robert', 'Sterling', 'manager@apex.com', '+1-555-0102', ?, ?, 'SALARIED', 'ACTIVE', '2022-08-15'),
      (?, ?, ?, 'EMP-1010', 'Carlos', 'Mendez', 'supervisor@apex.com', '+1-555-0103', ?, ?, 'SALARIED', 'ACTIVE', '2023-01-10'),
      (?, ?, ?, 'EMP-1001', 'John', 'Doe', 'john.doe@apex.com', '+1-555-0104', ?, ?, 'HOURLY', 'ACTIVE', '2023-01-15'),
      (?, ?, ?, 'EMP-1002', 'Sarah', 'Smith', 'sarah.smith@apex.com', '+1-555-0105', ?, ?, 'HOURLY', 'ACTIVE', '2023-03-01'),
      (?, ?, ?, 'EMP-1003', 'David', 'Kim', 'david.kim@apex.com', '+1-555-0106', ?, ?, 'HOURLY', 'ACTIVE', '2023-06-10'),
      (?, ?, ?, 'EMP-1004', 'Amara', 'Diallo', 'amara.diallo@apex.com', '+1-555-0107', ?, ?, 'HOURLY', 'ACTIVE', '2024-02-01')
    `, [
      empAdminId, org1Id, userMap.get('admin@apex.com'), deptSupervisionId, posLeadSupervisorId,
      empHrId, org1Id, userMap.get('hr@apex.com'), deptSupervisionId, posLeadSupervisorId,
      empMgrId, org1Id, userMap.get('manager@apex.com'), deptSupervisionId, posLeadSupervisorId,
      empSupvId, org1Id, userMap.get('supervisor@apex.com'), deptSupervisionId, posLeadSupervisorId,
      empJohnId, org1Id, userMap.get('john.doe@apex.com'), deptCleaningId, posCustodianId,
      empSarahId, org1Id, userMap.get('sarah.smith@apex.com'), deptMaintenanceId, posHvacTechId,
      empDavidId, org1Id, userMap.get('david.kim@apex.com'), deptCleaningId, posFloorTechId,
      empAmaraId, org1Id, userMap.get('amara.diallo@apex.com'), deptCleaningId, posCustodianId
    ]);

    // Pay Rates
    db.execute(`
      INSERT INTO pay_rates (id, organization_id, employee_id, hourly_rate, effective_from)
      VALUES
      (?, ?, ?, 35.00, '2024-01-01'),
      (?, ?, ?, 30.00, '2024-01-01'),
      (?, ?, ?, 28.00, '2024-01-01'),
      (?, ?, ?, 26.00, '2024-01-01'),
      (?, ?, ?, 18.50, '2024-01-01'),
      (?, ?, ?, 24.00, '2024-01-01'),
      (?, ?, ?, 20.00, '2024-01-01'),
      (?, ?, ?, 18.50, '2024-01-01')
    `, [
      uuidv4(), org1Id, empAdminId,
      uuidv4(), org1Id, empHrId,
      uuidv4(), org1Id, empMgrId,
      uuidv4(), org1Id, empSupvId,
      uuidv4(), org1Id, empJohnId,
      uuidv4(), org1Id, empSarahId,
      uuidv4(), org1Id, empDavidId,
      uuidv4(), org1Id, empAmaraId
    ]);

    // Employee Building Assignments
    db.execute(`
      INSERT INTO employee_buildings (employee_id, building_id, is_primary)
      VALUES
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 1),
      (?, ?, 0),
      (?, ?, 1)
    `, [
      empAdminId, bld1Id,
      empHrId, bld1Id,
      empMgrId, bld1Id,
      empSupvId, bld1Id,
      empJohnId, bld1Id,
      empSarahId, bld2Id,
      empDavidId, bld1Id,
      empDavidId, bld2Id,
      empAmaraId, bld3Id
    ]);

    // 9. Shifts
    const shiftMorningId = uuidv4();
    const shiftEveningId = uuidv4();
    const shiftNightId = uuidv4();

    db.execute(`
      INSERT INTO shifts (id, organization_id, name, start_time, end_time, break_duration_minutes, is_paid_break, color)
      VALUES
      (?, ?, 'Morning Custodial Shift', '06:00', '14:30', 30, 0, '#3b82f6'),
      (?, ?, 'Evening Commercial Shift', '15:00', '23:30', 30, 0, '#8b5cf6'),
      (?, ?, 'Night Deep Clean Shift', '22:00', '06:30', 30, 0, '#10b981')
    `, [
      shiftMorningId, org1Id,
      shiftEveningId, org1Id,
      shiftNightId, org1Id
    ]);

    // 10. Biometric Devices
    const dev1Id = uuidv4();
    const dev2Id = uuidv4();

    db.execute(`
      INSERT INTO biometric_devices (id, organization_id, building_id, device_identifier, name, manufacturer, model, ip_address, port, status, last_heartbeat_at)
      VALUES
      (?, ?, ?, 'ZKT-DMP-01', 'Downtown Lobby Biometric Terminal', 'ZKTECO', 'SilkBio-101TC', '192.168.1.150', 4370, 'ONLINE', ?),
      (?, ?, ?, 'ANV-MFT-01', 'Metro Financial Staff Terminal', 'ANVIZ', 'FacePass 7 Pro', '192.168.1.151', 5005, 'ONLINE', ?)
    `, [dev1Id, org1Id, bld1Id, now, dev2Id, org1Id, bld2Id, now]);

    // Device enrollments
    db.execute(`
      INSERT INTO employee_device_enrollments (id, organization_id, employee_id, device_id, biometric_pin_or_card)
      VALUES
      (?, ?, ?, ?, 'PIN-1001'),
      (?, ?, ?, ?, 'PIN-1002')
    `, [uuidv4(), org1Id, empJohnId, dev1Id, uuidv4(), org1Id, empSarahId, dev2Id]);

    // 11. Leave Types
    const leaveAnnualId = uuidv4();
    const leaveSickId = uuidv4();

    db.execute(`
      INSERT INTO leave_types (id, organization_id, name, code, is_paid, days_allowed_per_year)
      VALUES
      (?, ?, 'Annual Paid Vacation', 'VAC', 1, 14.0),
      (?, ?, 'Sick Leave', 'SICK', 1, 10.0),
      (?, ?, 'Unpaid Personal Leave', 'UNPAID', 0, 5.0)
    `, [leaveAnnualId, org1Id, leaveSickId, org1Id, uuidv4(), org1Id]);

    // 12. Schedules & Shifts for current week
    const schedId = uuidv4();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    db.execute(`
      INSERT INTO schedules (id, organization_id, name, start_date, end_date, status)
      VALUES (?, ?, 'Weekly Operations Schedule - Week 35', ?, ?, 'PUBLISHED')
    `, [schedId, org1Id, todayStr, todayStr]);

    // Today's schedule assignment for John Doe at Downtown Medical Plaza
    const schedAssignJohnId = uuidv4();
    const shiftStartTime = `${todayStr}T06:00:00Z`;
    const shiftEndTime = `${todayStr}T14:30:00Z`;

    db.execute(`
      INSERT INTO schedule_assignments (id, organization_id, schedule_id, employee_id, building_id, shift_id, shift_date, start_time, end_time, break_duration_minutes, status)
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 30, 'SCHEDULED'),
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 30, 'SCHEDULED')
    `, [
      schedAssignJohnId, org1Id, schedId, empJohnId, bld1Id, shiftMorningId, todayStr, shiftStartTime, shiftEndTime,
      uuidv4(), org1Id, schedId, empDavidId, bld1Id, shiftMorningId, todayStr, shiftStartTime, shiftEndTime
    ]);

    // 13. Sample Completed Attendance Event & Session for John Doe
    const checkInEventId = uuidv4();
    const checkOutEventId = uuidv4();
    const sessionId = uuidv4();

    const actualCheckIn = `${todayStr}T06:02:15Z`;
    const actualCheckOut = `${todayStr}T14:32:00Z`;

    db.execute(`
      INSERT INTO attendance_events (
        id, organization_id, employee_id, event_type, source, timestamp, received_at,
        building_id, latitude, longitude, accuracy_meters, distance_to_building_meters,
        is_within_geofence, biometric_verified, auth_method, sync_status, client_event_id
      ) VALUES
      (?, ?, ?, 'CHECK_IN', 'MOBILE_APP', ?, ?, ?, 40.71282, -74.00595, 8.5, 12.4, 1, 1, 'PHONE_BIOMETRIC', 'SYNCED', ?),
      (?, ?, ?, 'CHECK_OUT', 'MOBILE_APP', ?, ?, ?, 40.71279, -74.00602, 7.2, 10.1, 1, 1, 'PHONE_BIOMETRIC', 'SYNCED', ?)
    `, [
      checkInEventId, org1Id, empJohnId, actualCheckIn, actualCheckIn, bld1Id, uuidv4(),
      checkOutEventId, org1Id, empJohnId, actualCheckOut, actualCheckOut, bld1Id, uuidv4()
    ]);

    // Consolidated attendance session
    db.execute(`
      INSERT INTO attendance_sessions (
        id, organization_id, employee_id, building_id, schedule_assignment_id, session_date,
        check_in_event_id, check_out_event_id, check_in_time, check_out_time,
        total_work_minutes, total_break_minutes, regular_minutes, overtime_minutes, status, anomaly_flags
      ) VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 510, 30, 480, 0, 'COMPLETED', '[]')
    `, [
      sessionId, org1Id, empJohnId, bld1Id, schedAssignJohnId, todayStr,
      checkInEventId, checkOutEventId, actualCheckIn, actualCheckOut
    ]);

    // 14. Payroll Period & Record for John Doe
    const periodId = uuidv4();
    db.execute(`
      INSERT INTO payroll_periods (id, organization_id, name, start_date, end_date, status)
      VALUES (?, ?, 'Bi-Weekly Pay Period #17', '2024-08-01', '2024-08-14', 'CALCULATED')
    `, [periodId, org1Id]);

    db.execute(`
      INSERT INTO payroll_records (
        id, organization_id, payroll_period_id, employee_id, regular_hours, overtime_hours,
        double_time_hours, hourly_rate, regular_pay, overtime_pay, double_time_pay, gross_pay, status
      ) VALUES
      (?, ?, ?, ?, 80.0, 4.5, 0.0, 18.50, 1480.00, 124.88, 0.0, 1604.88, 'PENDING')
    `, [uuidv4(), org1Id, periodId, empJohnId]);

    // 15. Audit Log Trail
    db.execute(`
      INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent, created_at)
      VALUES
      (?, ?, ?, 'ORGANIZATION.INITIALIZE', 'organizations', ?, '{}', '{"name":"Apex Facility Solutions"}', '127.0.0.1', 'System Seeder', ?),
      (?, ?, ?, 'BUILDING.CREATE', 'buildings', ?, '{}', '{"name":"Downtown Medical Plaza"}', '127.0.0.1', 'System Seeder', ?),
      (?, ?, ?, 'EMPLOYEE.CREATE', 'employees', ?, '{}', '{"employee_code":"EMP-1001"}', '127.0.0.1', 'System Seeder', ?)
    `, [
      uuidv4(), org1Id, userMap.get('admin@apex.com'), org1Id, now,
      uuidv4(), org1Id, userMap.get('admin@apex.com'), bld1Id, now,
      uuidv4(), org1Id, userMap.get('admin@apex.com'), empJohnId, now
    ]);

    console.log('✅ Production database successfully seeded with multi-tenant demo data.');
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase().catch((err) => {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  });
}
