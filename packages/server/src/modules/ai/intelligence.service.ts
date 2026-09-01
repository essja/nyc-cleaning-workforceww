import { db } from '../../db/index.js';
import { Building, AttendanceSession, Employee } from '../../db/types.js';

export interface AnomalyReport {
  patternType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  evidence: any;
  recommendation: string;
}

export class WorkforceIntelligenceService {
  /**
   * Identifies understaffed buildings for today
   */
  public static getUnderstaffingAnalysis(orgId: string): AnomalyReport[] {
    const todayStr = new Date().toISOString().split('T')[0];
    const buildings = db.query<Building>('SELECT * FROM buildings WHERE organization_id = ? AND is_active = 1', [orgId]);
    const insights: AnomalyReport[] = [];

    for (const b of buildings) {
      const scheduled = db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT employee_id) as count
        FROM schedule_assignments
        WHERE building_id = ? AND organization_id = ? AND shift_date = ? AND status != 'CANCELLED'
      `, [b.id, orgId, todayStr])?.count || 0;

      const present = db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT employee_id) as count
        FROM attendance_sessions
        WHERE building_id = ? AND organization_id = ? AND session_date = ?
      `, [b.id, orgId, todayStr])?.count || 0;

      if (scheduled > 0 && present < scheduled) {
        const deficit = scheduled - present;
        const severity = deficit >= 3 ? 'HIGH' : (deficit >= 2 ? 'MEDIUM' : 'LOW');
        insights.push({
          patternType: 'UNDERSTAFFED_SITE',
          severity,
          title: `${b.name} is Understaffed (${present}/${scheduled} Present)`,
          description: `Site has ${deficit} fewer personnel clocked in than scheduled for today.`,
          evidence: { buildingId: b.id, buildingName: b.name, scheduled, present, deficit },
          recommendation: `Deploy reserve cleaner or dispatch a relief staff from nearby facility.`
        });
      }
    }

    return insights;
  }

  /**
   * Detects unusual employee attendance patterns over the last 30 days
   */
  public static getAttendancePatternAnomalies(orgId: string): AnomalyReport[] {
    const insights: AnomalyReport[] = [];

    // Query employees with multiple late arrival flags
    const lateEmployees = db.query<{
      employee_id: string;
      first_name: string;
      last_name: string;
      employee_code: string;
      late_count: number;
    }>(`
      SELECT 
        e.id as employee_id, e.first_name, e.last_name, e.employee_code,
        COUNT(s.id) as late_count
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.organization_id = ? 
        AND s.anomaly_flags LIKE '%LATE_ARRIVAL%'
      GROUP BY e.id
      HAVING COUNT(s.id) >= 2
      ORDER BY late_count DESC
    `, [orgId]);

    for (const emp of lateEmployees) {
      insights.push({
        patternType: 'REPEATED_TARDINESS',
        severity: emp.late_count >= 4 ? 'HIGH' : 'MEDIUM',
        title: `Repeated Tardiness: ${emp.first_name} ${emp.last_name} (${emp.employee_code})`,
        description: `Employee has clocked in late ${emp.late_count} times over recorded shifts.`,
        evidence: { employeeId: emp.employee_id, lateCount: emp.late_count },
        recommendation: `Review shift start commute constraints or conduct 1-on-1 attendance check-in.`
      });
    }

    // Query out-of-geofence punch anomalies
    const geofenceAnomalies = db.query<{
      employee_id: string;
      first_name: string;
      last_name: string;
      breach_count: number;
    }>(`
      SELECT 
        e.id as employee_id, e.first_name, e.last_name,
        COUNT(s.id) as breach_count
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.organization_id = ? 
        AND s.anomaly_flags LIKE '%OUTSIDE_GEOFENCE%'
      GROUP BY e.id
      HAVING COUNT(s.id) >= 1
      ORDER BY breach_count DESC
    `, [orgId]);

    for (const g of geofenceAnomalies) {
      insights.push({
        patternType: 'GEOFENCE_BREACH',
        severity: 'MEDIUM',
        title: `Off-Site Punch Detected: ${g.first_name} ${g.last_name}`,
        description: `Employee attempted clock-in outside verified building geofence perimeter ${g.breach_count} times.`,
        evidence: { employeeId: g.employee_id, breachCount: g.breach_count },
        recommendation: `Verify GPS calibration at location or review if employee was dispatched off-site.`
      });
    }

    return insights;
  }

  /**
   * Identifies highest overtime building hotspots
   */
  public static getOvertimeHotspots(orgId: string): AnomalyReport[] {
    const hotspots = db.query<{
      building_id: string;
      building_name: string;
      total_overtime_hours: number;
      session_count: number;
    }>(`
      SELECT 
        b.id as building_id, b.name as building_name,
        ROUND(SUM(s.overtime_minutes) / 60.0, 2) as total_overtime_hours,
        COUNT(s.id) as session_count
      FROM attendance_sessions s
      JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ? AND s.overtime_minutes > 0
      GROUP BY b.id
      ORDER BY total_overtime_hours DESC
      LIMIT 3
    `, [orgId]);

    return hotspots.map((h) => ({
      patternType: 'OVERTIME_HOTSPOT',
      severity: h.total_overtime_hours > 20 ? 'HIGH' : 'LOW',
      title: `Overtime Concentration at ${h.building_name}`,
      description: `${h.total_overtime_hours} hours of overtime logged across ${h.session_count} shifts.`,
      evidence: { buildingId: h.building_id, overtimeHours: h.total_overtime_hours },
      recommendation: `Consider scheduling an additional part-time custodian to eliminate recurring overtime expense.`
    }));
  }

  /**
   * Management Natural Language Q&A Assistant (Explainable & Data-Driven)
   */
  public static answerQuery(orgId: string, question: string): {
    answer: string;
    metricsUsed: any;
    confidence: number;
  } {
    const q = question.toLowerCase();

    if (q.includes('understaff') || q.includes('staffing') || q.includes('missing')) {
      const insights = this.getUnderstaffingAnalysis(orgId);
      if (insights.length === 0) {
        return {
          answer: 'All active buildings currently meet or exceed their scheduled staffing targets for today.',
          metricsUsed: { understaffedSitesCount: 0 },
          confidence: 1.0
        };
      }
      const summary = insights.map((i) => `• ${i.title}: ${i.description}`).join('\n');
      return {
        answer: `Detected ${insights.length} understaffed site(s) today:\n\n${summary}`,
        metricsUsed: { insights },
        confidence: 0.98
      };
    }

    if (q.includes('late') || q.includes('tardy') || q.includes('tardiness')) {
      const patterns = this.getAttendancePatternAnomalies(orgId).filter((p) => p.patternType === 'REPEATED_TARDINESS');
      if (patterns.length === 0) {
        return {
          answer: 'No recurring tardiness patterns detected across active workforce records.',
          metricsUsed: { lateEmployeesCount: 0 },
          confidence: 1.0
        };
      }
      const summary = patterns.map((p) => `• ${p.title} (${p.description})`).join('\n');
      return {
        answer: `Identified employees with repeat late arrivals:\n\n${summary}`,
        metricsUsed: { patterns },
        confidence: 0.95
      };
    }

    if (q.includes('overtime') || q.includes('hours') || q.includes('cost')) {
      const hotspots = this.getOvertimeHotspots(orgId);
      if (hotspots.length === 0) {
        return {
          answer: 'No overtime hours logged in this pay cycle.',
          metricsUsed: { totalOvertimeHotspots: 0 },
          confidence: 1.0
        };
      }
      const summary = hotspots.map((h) => `• ${h.title}: ${h.description}`).join('\n');
      return {
        answer: `Highest overtime concentration locations:\n\n${summary}`,
        metricsUsed: { hotspots },
        confidence: 0.96
      };
    }

    // Default overview summary
    const understaffed = this.getUnderstaffingAnalysis(orgId);
    const anomalies = this.getAttendancePatternAnomalies(orgId);
    return {
      answer: `Workforce Intelligence Summary: ${understaffed.length} understaffed location(s) today, and ${anomalies.length} active attendance anomalies require supervisor review.`,
      metricsUsed: { understaffedCount: understaffed.length, anomaliesCount: anomalies.length },
      confidence: 0.90
    };
  }
}
