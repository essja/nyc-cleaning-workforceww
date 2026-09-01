import * as XLSX from 'xlsx';
import { db } from '../../db/index.js';
import { AttendanceSession, Employee, Building, LeaveRequest } from '../../db/types.js';

export interface DashboardMetrics {
  totalEmployees: number;
  presentToday: number;
  currentlyWorking: number;
  lateToday: number;
  absentToday: number;
  onLeaveToday: number;
  presentStaffList: {
    sessionId: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    buildingName: string;
    checkInTime: string;
    checkOutTime?: string;
    status: string;
    sessionDate: string;
    isWithinGeofence: boolean;
    biometricVerified: boolean;
  }[];
  lateArrivalsList: {
    sessionId: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    buildingName: string;
    scheduledStart: string;
    checkInTime: string;
    minutesLate: number;
    sessionDate: string;
  }[];
  pendingLeaveList: {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    createdAt: string;
  }[];
  buildingsSummary: {
    id: string;
    name: string;
    scheduledCount: number;
    presentCount: number;
    staffingRate: number; // percentage
  }[];
  recentEvents: {
    id: string;
    employeeName: string;
    eventType: string;
    buildingName: string;
    timestamp: string;
    source: string;
    isWithinGeofence: boolean;
    biometricVerified: boolean;
  }[];
  anomalies: {
    id: string;
    employeeName: string;
    buildingName: string;
    sessionDate: string;
    flags: string[];
    checkInTime: string;
    checkOutTime?: string;
  }[];
}

export class ReportsService {
  /**
   * Executive Management Dashboard Metrics
   */
  public static getDashboardMetrics(orgId: string, buildingId?: string): DashboardMetrics {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Total active staff (exclude pure administrative OWNER accounts)
    const totalEmpRow = db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT e.id) as count
      FROM employees e
      LEFT JOIN organization_users ou ON ou.user_id = e.user_id AND ou.organization_id = e.organization_id
      WHERE e.organization_id = ? AND e.status = 'ACTIVE' AND (ou.role IS NULL OR ou.role != 'OWNER')
    `, [orgId]);
    const totalEmployees = totalEmpRow?.count || 0;

    // 2. Scheduled today
    let schedQuery = `
      SELECT COUNT(DISTINCT employee_id) as count
      FROM schedule_assignments
      WHERE organization_id = ? AND shift_date = ? AND status != 'CANCELLED'
    `;
    const schedParams: any[] = [orgId, todayStr];
    if (buildingId) {
      schedQuery += ' AND building_id = ?';
      schedParams.push(buildingId);
    }
    const scheduledToday = db.queryOne<{ count: number }>(schedQuery, schedParams)?.count || 0;

    // 3. Attendance sessions today
    let sessionQuery = `
      SELECT s.*, e.first_name, e.last_name, e.employee_code, b.name as building_name
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ? AND s.session_date = ?
    `;
    const sessionParams: any[] = [orgId, todayStr];
    if (buildingId) {
      sessionQuery += ' AND s.building_id = ?';
      sessionParams.push(buildingId);
    }
    const todaySessions = db.query<any>(sessionQuery, sessionParams);

    const presentEmployeeIds = new Set(todaySessions.map((s) => s.employee_id));
    const presentToday = presentEmployeeIds.size;
    const currentlyWorking = todaySessions.filter((s) => s.status === 'OPEN').length;

    let lateCount = 0;
    const anomalies: any[] = [];
    const lateArrivalsList: any[] = [];

    const presentStaffList = todaySessions.map((s) => ({
      sessionId: s.id,
      employeeId: s.employee_id,
      employeeName: `${s.first_name} ${s.last_name}`,
      employeeCode: s.employee_code,
      buildingName: s.building_name,
      checkInTime: s.check_in_time,
      checkOutTime: s.check_out_time || undefined,
      status: s.status,
      sessionDate: s.session_date,
      isWithinGeofence: Boolean(s.is_within_geofence),
      biometricVerified: Boolean(s.biometric_verified)
    }));

    for (const s of todaySessions) {
      let flags: string[] = [];
      try {
        flags = JSON.parse(s.anomaly_flags || '[]');
      } catch {
        flags = [];
      }

      if (flags.includes('LATE_ARRIVAL') || s.is_late) {
        lateCount++;
        const checkInDate = new Date(s.check_in_time);
        const schedTime = s.scheduled_start_time || '08:00 AM';
        lateArrivalsList.push({
          sessionId: s.id,
          employeeId: s.employee_id,
          employeeName: `${s.first_name} ${s.last_name}`,
          employeeCode: s.employee_code,
          buildingName: s.building_name,
          scheduledStart: schedTime,
          checkInTime: s.check_in_time,
          minutesLate: s.minutes_late || 15,
          sessionDate: s.session_date
        });
      }

      if (flags.length > 0) {
        anomalies.push({
          id: s.id,
          employeeName: `${s.first_name} ${s.last_name}`,
          buildingName: s.building_name,
          sessionDate: s.session_date,
          flags,
          checkInTime: s.check_in_time,
          checkOutTime: s.check_out_time || undefined
        });
      }
    }

    // 4. Leave today & Pending Leave requests
    const leaveRow = db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT employee_id) as count
      FROM leave_requests
      WHERE organization_id = ? AND status = 'APPROVED'
        AND start_date <= ? AND end_date >= ?
    `, [orgId, todayStr, todayStr]);
    const onLeaveToday = leaveRow?.count || 0;

    const pendingLeaveList = db.query<any>(`
      SELECT r.*, e.first_name, e.last_name, e.employee_code, lt.name as leave_type_name
      FROM leave_requests r
      JOIN employees e ON e.id = r.employee_id
      JOIN leave_types lt ON lt.id = r.leave_type_id
      WHERE r.organization_id = ? AND r.status = 'PENDING'
      ORDER BY r.created_at DESC
    `, [orgId]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: `${r.first_name} ${r.last_name}`,
      employeeCode: r.employee_code,
      leaveTypeName: r.leave_type_name,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days_requested || 1,
      reason: r.reason || 'Personal Time Off',
      createdAt: r.created_at
    }));

    // 5. Absent today (scheduled but not present and not on approved leave)
    const absentToday = Math.max(0, scheduledToday - presentToday - onLeaveToday);

    // 6. Buildings staffing summary
    const buildings = db.query<Building>('SELECT * FROM buildings WHERE organization_id = ? AND is_active = 1', [orgId]);
    const buildingsSummary = buildings.map((b) => {
      const scheduledAtBld = db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT employee_id) as count
        FROM schedule_assignments
        WHERE building_id = ? AND organization_id = ? AND shift_date = ? AND status != 'CANCELLED'
      `, [b.id, orgId, todayStr])?.count || 0;

      const presentAtBld = db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT employee_id) as count
        FROM attendance_sessions
        WHERE building_id = ? AND organization_id = ? AND session_date = ?
      `, [b.id, orgId, todayStr])?.count || 0;

      const staffingRate = scheduledAtBld > 0 ? Math.round((presentAtBld / scheduledAtBld) * 100) : (presentAtBld > 0 ? 100 : 0);

      return {
        id: b.id,
        name: b.name,
        scheduledCount: scheduledAtBld,
        presentCount: presentAtBld,
        staffingRate
      };
    });

    // 7. Recent events
    const recentEvents = db.query<any>(`
      SELECT ae.id, ae.timestamp, ae.event_type, ae.source, ae.is_within_geofence, ae.biometric_verified,
             e.first_name, e.last_name, b.name as building_name
      FROM attendance_events ae
      JOIN employees e ON e.id = ae.employee_id
      LEFT JOIN buildings b ON b.id = ae.building_id
      WHERE ae.organization_id = ?
      ORDER BY ae.timestamp DESC
      LIMIT 10
    `, [orgId]).map((e) => ({
      id: e.id,
      employeeName: `${e.first_name} ${e.last_name}`,
      eventType: e.event_type,
      buildingName: e.building_name || 'Downtown Headquarters',
      timestamp: e.timestamp,
      source: e.source,
      isWithinGeofence: Boolean(e.is_within_geofence),
      biometricVerified: Boolean(e.biometric_verified)
    }));

    return {
      totalEmployees,
      presentToday,
      currentlyWorking,
      lateToday: lateCount,
      absentToday,
      onLeaveToday,
      presentStaffList,
      lateArrivalsList,
      pendingLeaveList,
      buildingsSummary,
      recentEvents,
      anomalies
    };
  }

  /**
   * Timesheet Summary & Payroll Export Service
   */
  public static getTimesheetReport(orgId: string, startDate: string, endDate: string, employeeId?: string): any[] {
    let sql = `
      SELECT s.*, e.employee_code, e.first_name, e.last_name, e.hourly_rate as base_rate,
             b.name as building_name
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ? AND s.session_date >= ? AND s.session_date <= ?
    `;
    const params: any[] = [orgId, startDate, endDate];
    if (employeeId) {
      sql += ' AND s.employee_id = ?';
      params.push(employeeId);
    }
    sql += ' ORDER BY s.session_date DESC, e.last_name ASC';
    return db.query(sql, params);
  }

  /**
   * Export Timesheets to Excel Buffer
   */
  public static exportTimesheetsExcel(orgId: string, startDate: string, endDate: string): Buffer {
    const records = this.getTimesheetReport(orgId, startDate, endDate);
    const data = records.map((r) => ({
      'Date': r.session_date,
      'Employee Code': r.employee_code,
      'Employee Name': `${r.first_name} ${r.last_name}`,
      'Facility / Building': r.building_name,
      'Clock In': r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : 'N/A',
      'Clock Out': r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : 'N/A',
      'Total Hours': (r.total_work_minutes / 60).toFixed(2),
      'Regular Hours': (r.regular_minutes / 60).toFixed(2),
      'Overtime Hours': (r.overtime_minutes / 60).toFixed(2),
      'Status': r.status,
      'Verified': r.biometric_verified ? 'YES' : 'NO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet Report');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
