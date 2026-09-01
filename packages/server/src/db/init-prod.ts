import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './index.js';
import { runMigrations } from './migrate.js';

export async function initProductionDatabase(options: {
  companyName?: string;
  companySlug?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminFirstName?: string;
  adminLastName?: string;
  workWeekStart?: number; // 0 = Sunday, 1 = Monday
  timezone?: string;
  currency?: string;
} = {}) {
  const companyName = options.companyName || process.env.COMPANY_NAME || 'NYC Cleaning and Maintenance';
  const companySlug = options.companySlug || 'nyc-cleaning-and-maintenance';
  const adminEmail = options.adminEmail || process.env.ADMIN_EMAIL || 'admin@nyccleaning.com';
  const adminPassword = options.adminPassword || process.env.ADMIN_PASSWORD || 'Password123!';
  const adminFirst = options.adminFirstName || 'Ibrihim';
  const adminLast = options.adminLastName || 'Jalloh';
  const workWeekStart = options.workWeekStart !== undefined ? options.workWeekStart : 0; // Sunday start
  const timezone = options.timezone || 'America/New_York';
  const currency = options.currency || 'USD';

  console.log(`\n🚀 Initializing clean production database for: ${companyName}...`);

  runMigrations();

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const now = new Date().toISOString();

  db.transaction(() => {
    // 1. Wipe all existing tables
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

    // 2. Permissions
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

    const permStmt = db.getDb().prepare(`INSERT INTO permissions (id, code, name, category, description) VALUES (?, ?, ?, ?, ?)`);
    const permMap = new Map<string, string>();
    for (const p of permissionDefs) {
      const id = uuidv4();
      permStmt.run(id, p.code, p.name, p.category, `${p.name} description`);
      permMap.set(p.code, id);
    }

    // 3. Roles
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

    // 4. Clean Company Organization
    const orgId = uuidv4();
    db.execute(`
      INSERT INTO organizations (id, name, slug, work_week_start, timezone, currency, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orgId,
      companyName,
      companySlug,
      workWeekStart,
      timezone,
      currency,
      JSON.stringify({
        geofence_strict: true,
        auto_checkout_hours: 12,
        allow_offline_punch: true,
        require_phone_biometrics: true
      }),
      now, now
    ]);

    // 5. Default Departments
    const deptCleaningId = uuidv4();
    const deptMaintenanceId = uuidv4();
    const deptSupervisionId = uuidv4();

    db.execute(`
      INSERT INTO departments (id, organization_id, name, code)
      VALUES 
      (?, ?, 'Commercial Cleaning', 'CLEAN'),
      (?, ?, 'Facility Maintenance', 'MAINT'),
      (?, ?, 'Operations Supervision', 'SUPV')
    `, [deptCleaningId, orgId, deptMaintenanceId, orgId, deptSupervisionId, orgId]);

    // 6. Default Positions
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
      posCustodianId, orgId, deptCleaningId,
      posFloorTechId, orgId, deptCleaningId,
      posHvacTechId, orgId, deptMaintenanceId,
      posLeadSupervisorId, orgId, deptSupervisionId
    ]);

    // 7. Master Admin User Account
    const adminUserId = uuidv4();
    db.execute(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active)
      VALUES (?, ?, ?, ?, ?, '+1-555-0100', 1)
    `, [adminUserId, adminEmail, passwordHash, adminFirst, adminLast]);

    db.execute(`
      INSERT INTO organization_users (id, organization_id, user_id, role, is_active, activated_at)
      VALUES (?, ?, ?, 'OWNER', 1, ?)
    `, [uuidv4(), orgId, adminUserId, now]);

    // Admin Employee Profile
    const adminEmpId = uuidv4();
    db.execute(`
      INSERT INTO employees (id, organization_id, user_id, employee_code, first_name, last_name, email, department_id, position_id, employment_type, status, hire_date)
      VALUES (?, ?, ?, 'EMP-001', ?, ?, ?, ?, ?, 'SALARIED', 'ACTIVE', date('now'))
    `, [adminEmpId, orgId, adminUserId, adminFirst, adminLast, adminEmail, deptSupervisionId, posLeadSupervisorId]);

    // 8. Overtime Rules
    db.execute(`
      INSERT INTO overtime_rules (
        id, organization_id, daily_threshold_hours, weekly_threshold_hours,
        overtime_multiplier, double_time_threshold_hours, double_time_multiplier
      ) VALUES (?, ?, 8.0, 40.0, 1.5, 12.0, 2.0)
    `, [uuidv4(), orgId]);

    // 9. Leave Types
    db.execute(`
      INSERT INTO leave_types (id, organization_id, name, code, is_paid, days_allowed_per_year)
      VALUES
      (?, ?, 'Paid Time Off', 'PTO', 1, 14.0),
      (?, ?, 'Sick Leave', 'SICK', 1, 7.0),
      (?, ?, 'Unpaid Absence', 'UNPAID', 0, 0.0)
    `, [uuidv4(), orgId, uuidv4(), orgId, uuidv4(), orgId]);

    // 10. Default Shift Templates
    db.execute(`
      INSERT INTO shifts (id, organization_id, name, start_time, end_time, break_duration_minutes, is_paid_break, color)
      VALUES
      (?, ?, 'Morning Custodial Shift', '06:00', '14:30', 30, 0, '#3b82f6'),
      (?, ?, 'Evening Commercial Shift', '15:00', '23:30', 30, 0, '#8b5cf6'),
      (?, ?, 'Night Deep Clean Shift', '22:00', '06:30', 30, 0, '#10b981')
    `, [uuidv4(), orgId, uuidv4(), orgId, uuidv4(), orgId]);
  });

  console.log(`✅ Production database initialized successfully!`);
  console.log(`\n🔑 Master Admin Credentials:`);
  console.log(`   Organization: ${companyName} (${companySlug})`);
  console.log(`   Email:        ${adminEmail}`);
  console.log(`   Password:     ${adminPassword}`);
  console.log(`   Work Week:    ${workWeekStart === 0 ? 'Sunday → Saturday' : 'Monday → Sunday'}\n`);
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('init-prod.ts')) {
  initProductionDatabase().catch(console.error);
}
