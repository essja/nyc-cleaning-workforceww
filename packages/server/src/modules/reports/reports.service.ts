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

    // 1. Total active employees
    const totalEmpRow = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM employees WHERE organization_id = ? AND status = ?',
      [orgId, 'ACTIVE']
    );
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

    for (const s of todaySessions) {
      let flags: string[] = [];
      try {
        flags = JSON.parse(s.anomaly_flags || '[]');
      } catch {
        flags = [];
      }

      if (flags.includes('LATE_ARRIVAL')) {
        lateCount++;
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

    // 4. Leave today
    const leaveRow = db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT employee_id) as count
      FROM leave_requests
      WHERE organization_id = ? AND status = 'APPROVED'
        AND start_date <= ? AND end_date >= ?
    `, [orgId, todayStr, todayStr]);
    const onLeaveToday = leaveRow?.count || 0;

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

      const rate = scheduledAtBld > 0 ? Math.round((presentAtBld / scheduledAtBld) * 100) : (presentAtBld > 0 ? 100 : 0);

      return {
        id: b.id,
        name: b.name,
        scheduledCount: scheduledAtBld,
        presentCount: presentAtBld,
        staffingRate: rate
      };
    });

    // 7. Recent 15 attendance events
    const recentEventsRows = db.query<any>(`
      SELECT 
        ae.id, ae.event_type, ae.timestamp, ae.source, ae.is_within_geofence,
        ae.biometric_verified, e.first_name, e.last_name, b.name as building_name
      FROM attendance_events ae
      JOIN employees e ON e.id = ae.employee_id
      LEFT JOIN buildings b ON b.id = ae.building_id
      WHERE ae.organization_id = ?
      ORDER BY ae.timestamp DESC LIMIT 15
    `, [orgId]);

    const recentEvents = recentEventsRows.map((r) => ({
      id: r.id,
      employeeName: `${r.first_name} ${r.last_name}`,
      eventType: r.event_type,
      buildingName: r.building_name || 'Unassigned Site',
      timestamp: r.timestamp,
      source: r.source,
      isWithinGeofence: Boolean(r.is_within_geofence),
      biometricVerified: Boolean(r.biometric_verified)
    }));

    return {
      totalEmployees,
      presentToday,
      currentlyWorking,
      lateToday: lateCount,
      absentToday,
      onLeaveToday,
      buildingsSummary,
      recentEvents,
      anomalies
    };
  }

  /**
   * Detailed Attendance Timesheet Report Query
   */
  public static getTimesheetReport(
    orgId: string,
    filters: { startDate: string; endDate: string; buildingId?: string; employeeId?: string }
  ) {
    let sql = `
      SELECT 
        s.id, s.session_date, s.check_in_time, s.check_out_time,
        s.total_work_minutes, s.total_break_minutes, s.regular_minutes,
        s.overtime_minutes, s.status, s.anomaly_flags,
        e.employee_code, e.first_name, e.last_name, e.employment_type,
        b.name as building_name
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ?
        AND s.session_date >= ? AND s.session_date <= ?
    `;
    const params: any[] = [orgId, filters.startDate, filters.endDate];

    if (filters.buildingId) {
      sql += ' AND s.building_id = ?';
      params.push(filters.buildingId);
    }
    if (filters.employeeId) {
      sql += ' AND s.employee_id = ?';
      params.push(filters.employeeId);
    }

    sql += ' ORDER BY s.session_date DESC, e.last_name ASC';
    return db.query(sql, params);
  }

  /**
   * Export Timesheet to Excel Buffer
   */
  public static exportTimesheetExcel(
    orgId: string,
    filters: { startDate: string; endDate: string; buildingId?: string; employeeId?: string }
  ): Buffer {
    const records = this.getTimesheetReport(orgId, filters);
    const rows = records.map((r: any) => ({
      'Date': r.session_date,
      'Employee Code': r.employee_code,
      'Employee Name': `${r.first_name} ${r.last_name}`,
      'Building': r.building_name,
      'Check In': r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '',
      'Check Out': r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : 'Active',
      'Total Hours': Math.round((r.total_work_minutes / 60) * 100) / 100,
      'Regular Hours': Math.round((r.regular_minutes / 60) * 100) / 100,
      'Overtime Hours': Math.round((r.overtime_minutes / 60) * 100) / 100,
      'Break Minutes': r.total_break_minutes,
      'Status': r.status,
      'Anomalies': r.anomaly_flags || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet Report');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
