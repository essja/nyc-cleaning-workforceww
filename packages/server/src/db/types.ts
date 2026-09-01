export type UserRole = 'OWNER' | 'ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'SUPERVISOR' | 'EMPLOYEE';

export type EmploymentType = 'HOURLY' | 'SALARIED' | 'CONTRACTOR';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export type AttendanceEventType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'ADMIN_ADJUSTMENT';
export type AttendanceSource = 'MOBILE_APP' | 'BIOMETRIC_TERMINAL' | 'WEB_PORTAL' | 'ADMIN_MANUAL';
export type AuthMethod = 'PHONE_BIOMETRIC' | 'DEVICE_FINGERPRINT' | 'PIN_PASSCODE' | 'ADMIN_OVERRIDE';
export type SyncStatus = 'SYNCED' | 'PENDING_OFFLINE' | 'CONFLICT';
export type AttendanceSessionStatus = 'OPEN' | 'COMPLETED' | 'AUTO_CLOSED' | 'FLAGGED_ANOMALY' | 'ADJUSTED';

export type ScheduleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ScheduleAssignmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'SWAPPED';

export type PayrollPeriodStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'EXPORTED' | 'PAID';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type BiometricManufacturer = 'ZKTECO' | 'ANVIZ' | 'GENERIC_PULL' | 'MOCK';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  work_week_start: number; // 0 = Sunday, 1 = Monday
  timezone: string;
  currency: string;
  settings: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  is_active: number;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUser {
  id: string;
  organization_id: string;
  user_id: string;
  role: UserRole;
  assigned_building_ids: string;
  is_active: number;
  invited_at?: string;
  activated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  organization_id: string;
  name: string;
  code?: string;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  organization_id: string;
  department_id?: string;
  title: string;
  code?: string;
  created_at: string;
  updated_at: string;
}

export interface Break {
  id: string;
  organization_id: string;
  attendance_session_id: string;
  break_start_event_id: string;
  break_end_event_id?: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  is_paid: number;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  organization_id: string;
  name: string;
  code?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state_province?: string;
  postal_code?: string;
  country: string;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  organization_id: string;
  user_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  position_id?: string;
  manager_id?: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  hire_date?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  organization_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  is_paid_break: number;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleAssignment {
  id: string;
  organization_id: string;
  schedule_id?: string;
  employee_id: string;
  building_id: string;
  shift_id?: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  status: ScheduleAssignmentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceEvent {
  id: string;
  organization_id: string;
  employee_id: string;
  event_type: AttendanceEventType;
  source: AttendanceSource;
  timestamp: string;
  received_at: string;
  building_id?: string;
  device_id?: string;
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number;
  distance_to_building_meters?: number;
  is_within_geofence?: number;
  biometric_verified: number;
  auth_method: AuthMethod;
  sync_status: SyncStatus;
  client_event_id?: string;
  raw_payload?: string;
  created_at: string;
}

export interface AttendanceSession {
  id: string;
  organization_id: string;
  employee_id: string;
  building_id: string;
  schedule_assignment_id?: string;
  session_date: string;
  check_in_event_id: string;
  check_out_event_id?: string;
  check_in_time: string;
  check_out_time?: string;
  total_work_minutes: number;
  total_break_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  status: AttendanceSessionStatus;
  anomaly_flags: string;
  created_at: string;
  updated_at: string;
}

export interface OvertimeRule {
  id: string;
  organization_id: string;
  daily_threshold_hours: number;
  weekly_threshold_hours: number;
  overtime_multiplier: number;
  double_time_threshold_hours?: number;
  double_time_multiplier?: number;
  weekend_multiplier?: number;
  holiday_multiplier?: number;
  created_at: string;
  updated_at: string;
}

export interface PayRate {
  id: string;
  organization_id: string;
  employee_id: string;
  hourly_rate: number;
  effective_from: string;
  effective_to?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollPeriod {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PayrollPeriodStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollRecord {
  id: string;
  organization_id: string;
  payroll_period_id: string;
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  double_time_hours: number;
  hourly_rate: number;
  regular_pay: number;
  overtime_pay: number;
  double_time_pay: number;
  gross_pay: number;
  breakdown_json: string;
  status: 'PENDING' | 'APPROVED';
  created_at: string;
  updated_at: string;
}

export interface LeaveType {
  id: string;
  organization_id: string;
  name: string;
  code?: string;
  is_paid: number;
  days_allowed_per_year: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: LeaveStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BiometricDevice {
  id: string;
  organization_id: string;
  building_id: string;
  device_identifier: string;
  name: string;
  manufacturer: BiometricManufacturer;
  model?: string;
  ip_address?: string;
  port?: number;
  status: DeviceStatus;
  last_heartbeat_at?: string;
  settings?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  actor_user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state?: string;
  after_state?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
