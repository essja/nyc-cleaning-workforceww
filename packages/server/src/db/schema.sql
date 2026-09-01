-- ============================================================================
-- ENTERPRISE WORKFORCE MANAGEMENT PLATFORM: PRODUCTION DDL SCHEMA
-- ============================================================================

-- 1. ORGANIZATIONS (Multi-tenant root)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    work_week_start INTEGER NOT NULL DEFAULT 0, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    timezone TEXT NOT NULL DEFAULT 'UTC',
    currency TEXT NOT NULL DEFAULT 'USD',
    settings TEXT DEFAULT '{}', -- JSON configuration
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- 2. USERS (Global identity / credentials)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. ORGANIZATION USERS (Tenant Membership & Scoped RBAC)
CREATE TABLE IF NOT EXISTS organization_users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR', 'EMPLOYEE')),
    assigned_building_ids TEXT DEFAULT '[]', -- JSON array of building IDs for scoped managers
    is_active INTEGER NOT NULL DEFAULT 1,
    invited_at TEXT,
    activated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_users_tenant ON organization_users(organization_id, user_id);

-- 5. DEPARTMENTS & POSITIONS
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    department_id TEXT,
    title TEXT NOT NULL,
    code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    UNIQUE (organization_id, title)
);

-- 6. BUILDINGS & SITES (Locations)
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state_province TEXT,
    postal_code TEXT,
    country TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 100,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(organization_id, is_active);

-- 7. GEOFENCES (Custom polygon / multi-zone extensions)
CREATE TABLE IF NOT EXISTS geofences (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    name TEXT NOT NULL,
    shape_type TEXT NOT NULL DEFAULT 'CIRCLE', -- 'CIRCLE' or 'POLYGON'
    radius_meters INTEGER NOT NULL DEFAULT 100,
    polygon_coordinates TEXT, -- JSON Array of [lat, lng] points
    is_strict INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- 8. EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT,
    employee_code TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department_id TEXT,
    position_id TEXT,
    manager_id TEXT,
    employment_type TEXT NOT NULL DEFAULT 'HOURLY' CHECK(employment_type IN ('HOURLY', 'SALARIED', 'CONTRACTOR')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE')),
    hire_date TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    UNIQUE (organization_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(organization_id, employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

-- 9. EMPLOYEE SITE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS employee_buildings (
    employee_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, building_id),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
);

-- 10. SHIFTS & TEMPLATES
CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL, -- e.g. "08:00"
    end_time TEXT NOT NULL,   -- e.g. "16:30"
    break_duration_minutes INTEGER NOT NULL DEFAULT 30,
    is_paid_break INTEGER NOT NULL DEFAULT 0,
    color TEXT DEFAULT '#3b82f6',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- 11. SCHEDULES & SCHEDULE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_assignments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    schedule_id TEXT,
    employee_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    shift_id TEXT,
    shift_date TEXT NOT NULL, -- "YYYY-MM-DD"
    start_time TEXT NOT NULL, -- "YYYY-MM-DDTHH:MM:SSZ" (UTC ISO)
    end_time TEXT NOT NULL,   -- "YYYY-MM-DDTHH:MM:SSZ" (UTC ISO)
    break_duration_minutes INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'SWAPPED')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sched_assign_emp ON schedule_assignments(organization_id, employee_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_sched_assign_bld ON schedule_assignments(organization_id, building_id, shift_date);

-- 12. BIOMETRIC DEVICES & ENROLLMENTS
CREATE TABLE IF NOT EXISTS biometric_devices (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    device_identifier TEXT NOT NULL,
    name TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT 'MOCK' CHECK(manufacturer IN ('ZKTECO', 'ANVIZ', 'GENERIC_PULL', 'MOCK')),
    model TEXT,
    ip_address TEXT,
    port INTEGER DEFAULT 4370,
    status TEXT NOT NULL DEFAULT 'ONLINE' CHECK(status IN ('ONLINE', 'OFFLINE', 'SYNCING', 'ERROR')),
    last_heartbeat_at TEXT,
    settings TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
    UNIQUE (organization_id, device_identifier)
);

CREATE TABLE IF NOT EXISTS employee_device_enrollments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    biometric_pin_or_card TEXT NOT NULL,
    enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE,
    UNIQUE (device_id, biometric_pin_or_card)
);

CREATE TABLE IF NOT EXISTS biometric_device_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    raw_punch_id TEXT,
    employee_pin_or_card TEXT NOT NULL,
    event_time TEXT NOT NULL,
    event_type TEXT NOT NULL,
    is_processed INTEGER NOT NULL DEFAULT 0,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE
);

-- 13. ATTENDANCE EVENTS (Immutable Event Sourcing Log)
CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END', 'ADMIN_ADJUSTMENT')),
    source TEXT NOT NULL CHECK(source IN ('MOBILE_APP', 'BIOMETRIC_TERMINAL', 'WEB_PORTAL', 'ADMIN_MANUAL')),
    timestamp TEXT NOT NULL, -- UTC ISO String
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    building_id TEXT,
    device_id TEXT,
    latitude REAL,
    longitude REAL,
    accuracy_meters REAL,
    distance_to_building_meters REAL,
    is_within_geofence INTEGER,
    biometric_verified INTEGER NOT NULL DEFAULT 0,
    auth_method TEXT NOT NULL DEFAULT 'PHONE_BIOMETRIC' CHECK(auth_method IN ('PHONE_BIOMETRIC', 'DEVICE_FINGERPRINT', 'PIN_PASSCODE', 'ADMIN_OVERRIDE')),
    sync_status TEXT NOT NULL DEFAULT 'SYNCED' CHECK(sync_status IN ('SYNCED', 'PENDING_OFFLINE', 'CONFLICT')),
    client_event_id TEXT UNIQUE,
    raw_payload TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL,
    FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_att_events_tenant ON attendance_events(organization_id, employee_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_att_events_client_id ON attendance_events(client_event_id);

-- 14. ATTENDANCE SESSIONS (Consolidated Work Shifts)
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    building_id TEXT NOT NULL,
    schedule_assignment_id TEXT,
    session_date TEXT NOT NULL, -- "YYYY-MM-DD"
    check_in_event_id TEXT NOT NULL,
    check_out_event_id TEXT,
    check_in_time TEXT NOT NULL, -- UTC ISO
    check_out_time TEXT,        -- UTC ISO
    total_work_minutes INTEGER NOT NULL DEFAULT 0,
    total_break_minutes INTEGER NOT NULL DEFAULT 0,
    regular_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'COMPLETED', 'AUTO_CLOSED', 'FLAGGED_ANOMALY', 'ADJUSTED')),
    anomaly_flags TEXT DEFAULT '[]', -- JSON Array of string flags
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_assignment_id) REFERENCES schedule_assignments(id) ON DELETE SET NULL,
    FOREIGN KEY (check_in_event_id) REFERENCES attendance_events(id) ON DELETE RESTRICT,
    FOREIGN KEY (check_out_event_id) REFERENCES attendance_events(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_att_sessions_tenant ON attendance_sessions(organization_id, employee_id, session_date);
CREATE INDEX IF NOT EXISTS idx_att_sessions_bld ON attendance_sessions(organization_id, building_id, session_date);

-- 15. BREAKS
CREATE TABLE IF NOT EXISTS breaks (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    attendance_session_id TEXT NOT NULL,
    break_start_event_id TEXT NOT NULL,
    break_end_event_id TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    is_paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (break_start_event_id) REFERENCES attendance_events(id) ON DELETE RESTRICT,
    FOREIGN KEY (break_end_event_id) REFERENCES attendance_events(id) ON DELETE RESTRICT
);

-- 16. PAY RATES & OVERTIME RULES
CREATE TABLE IF NOT EXISTS pay_rates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    hourly_rate REAL NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS overtime_rules (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    daily_threshold_hours REAL NOT NULL DEFAULT 8.0,
    weekly_threshold_hours REAL NOT NULL DEFAULT 40.0,
    overtime_multiplier REAL NOT NULL DEFAULT 1.5,
    double_time_threshold_hours REAL DEFAULT 12.0,
    double_time_multiplier REAL DEFAULT 2.0,
    weekend_multiplier REAL DEFAULT 1.5,
    holiday_multiplier REAL DEFAULT 2.0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id)
);

-- 17. PAYROLL PERIODS & RECORDS
CREATE TABLE IF NOT EXISTS payroll_periods (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'CALCULATED', 'APPROVED', 'EXPORTED', 'PAID')),
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payroll_records (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    payroll_period_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    regular_hours REAL NOT NULL DEFAULT 0.0,
    overtime_hours REAL NOT NULL DEFAULT 0.0,
    double_time_hours REAL NOT NULL DEFAULT 0.0,
    hourly_rate REAL NOT NULL,
    regular_pay REAL NOT NULL DEFAULT 0.0,
    overtime_pay REAL NOT NULL DEFAULT 0.0,
    double_time_pay REAL NOT NULL DEFAULT 0.0,
    gross_pay REAL NOT NULL DEFAULT 0.0,
    breakdown_json TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE (payroll_period_id, employee_id)
);

-- 18. LEAVE TYPES & LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS leave_types (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    is_paid INTEGER NOT NULL DEFAULT 1,
    days_allowed_per_year REAL DEFAULT 14.0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    leave_type_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    reviewer_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON leave_requests(organization_id, employee_id, status);

-- 19. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'INFO' CHECK(type IN ('INFO', 'WARNING', 'ALERT', 'SUCCESS')),
    link TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 20. AUDIT LOGS (Immutable Security & Administrative Ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state TEXT, -- JSON snapshot
    after_state TEXT,  -- JSON snapshot
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_action ON audit_logs(organization_id, action, created_at);

-- 21. BULK IMPORTS & IMPORT ERRORS
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('EMPLOYEES', 'SCHEDULES', 'BUILDINGS')),
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'VALIDATED', 'COMPLETED', 'FAILED')),
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_errors (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    field_name TEXT,
    rejected_value TEXT,
    error_message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
);

-- 22. SYNCHRONIZATION EVENTS (Edge & Offline Event Queue Monitoring)
CREATE TABLE IF NOT EXISTS synchronization_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    device_or_client_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('MOBILE_APP', 'EDGE_CONNECTOR')),
    events_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS', 'PARTIAL_FAILURE', 'FAILED')),
    details TEXT DEFAULT '{}',
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
