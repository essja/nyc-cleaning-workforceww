import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { Shift, ScheduleAssignment, Organization, LeaveRequest, Employee, Building } from '../../db/types.js';
import { AuditService } from '../audit/audit.service.js';

export interface CreateShiftInput {
  name: string;
  start_time: string; // "08:00"
  end_time: string;   // "16:30"
  break_duration_minutes?: number;
  is_paid_break?: boolean;
  color?: string;
}

export interface CreateAssignmentInput {
  schedule_id?: string;
  employee_id: string;
  building_id: string;
  shift_id?: string;
  shift_date: string; // "YYYY-MM-DD"
  start_time: string; // UTC ISO
  end_time: string;   // UTC ISO
  break_duration_minutes?: number;
  notes?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  errors: string[];
  warnings: string[];
}

export class SchedulingService {
  /**
   * Calculates the exact week start date for an organization based on its work_week_start setting (0=Sunday, 1=Monday)
   */
  public static getWorkWeekRange(orgId: string, referenceDate: Date = new Date()): { startDate: string; endDate: string } {
    const org = db.queryOne<Organization>('SELECT work_week_start FROM organizations WHERE id = ?', [orgId]);
    const weekStartDay = org ? org.work_week_start : 0; // default Sunday

    const currentDay = referenceDate.getUTCDay(); // 0 is Sunday, 1 is Monday
    const diff = (currentDay < weekStartDay ? 7 : 0) + currentDay - weekStartDay;

    const start = new Date(referenceDate);
    start.setUTCDate(start.getUTCDate() - diff);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  }

  public static listShifts(orgId: string): Shift[] {
    return db.query<Shift>('SELECT * FROM shifts WHERE organization_id = ? ORDER BY start_time ASC', [orgId]);
  }

  public static createShift(orgId: string, actorUserId: string, data: CreateShiftInput): Shift {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.execute(`
      INSERT INTO shifts (id, organization_id, name, start_time, end_time, break_duration_minutes, is_paid_break, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, orgId, data.name, data.start_time, data.end_time,
      data.break_duration_minutes ?? 30, data.is_paid_break ? 1 : 0,
      data.color || '#3b82f6', now, now
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'SHIFT.CREATE',
      entityType: 'shifts',
      entityId: id,
      afterState: data
    });

    return db.queryOne<Shift>('SELECT * FROM shifts WHERE id = ?', [id])!;
  }

  public static updateShift(orgId: string, actorUserId: string, shiftId: string, data: Partial<CreateShiftInput>): Shift {
    const existing = db.queryOne<Shift>('SELECT * FROM shifts WHERE id = ? AND organization_id = ?', [shiftId, orgId]);
    if (!existing) throw new Error('Shift template not found');

    const now = new Date().toISOString();
    db.execute(`
      UPDATE shifts SET
        name = COALESCE(?, name),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        break_duration_minutes = COALESCE(?, break_duration_minutes),
        is_paid_break = COALESCE(?, is_paid_break),
        color = COALESCE(?, color),
        updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [
      data.name ?? null, data.start_time ?? null, data.end_time ?? null,
      data.break_duration_minutes !== undefined ? data.break_duration_minutes : null,
      data.is_paid_break !== undefined ? (data.is_paid_break ? 1 : 0) : null,
      data.color ?? null, now, shiftId, orgId
    ]);

    return db.queryOne<Shift>('SELECT * FROM shifts WHERE id = ?', [shiftId])!;
  }

  public static deleteShift(orgId: string, actorUserId: string, shiftId: string): void {
    db.execute('DELETE FROM shifts WHERE id = ? AND organization_id = ?', [shiftId, orgId]);
    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'SHIFT.DELETE',
      entityType: 'shifts',
      entityId: shiftId
    });
  }

  /**
   * Conflict Detection Engine
   */
  public static checkConflicts(
    orgId: string,
    assignment: CreateAssignmentInput,
    ignoreAssignmentId?: string
  ): ConflictCheckResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const emp = db.queryOne<Employee>('SELECT first_name, last_name FROM employees WHERE id = ? AND organization_id = ?', [
      assignment.employee_id, orgId
    ]);
    const empName = emp ? `${emp.first_name} ${emp.last_name}` : 'Employee';

    // 1. Check for overlapping shifts on the same date/time
    let overlapQuery = `
      SELECT sa.*, b.name as building_name
      FROM schedule_assignments sa
      JOIN buildings b ON b.id = sa.building_id
      WHERE sa.organization_id = ? 
        AND sa.employee_id = ? 
        AND sa.shift_date = ? 
        AND sa.status != 'CANCELLED'
        AND (
          (sa.start_time < ? AND sa.end_time > ?) OR
          (sa.start_time >= ? AND sa.start_time < ?)
        )
    `;
    const params: any[] = [
      orgId, assignment.employee_id, assignment.shift_date,
      assignment.end_time, assignment.start_time,
      assignment.start_time, assignment.end_time
    ];

    if (ignoreAssignmentId) {
      overlapQuery += ' AND sa.id != ?';
      params.push(ignoreAssignmentId);
    }

    const overlapping = db.query(overlapQuery, params);
    if (overlapping.length > 0) {
      errors.push(`${empName} is already scheduled for an overlapping shift at ${overlapping[0].building_name} on ${assignment.shift_date}`);
    }

    // 2. Check for approved leave conflicts
    const leaveConflict = db.queryOne<LeaveRequest>(`
      SELECT lr.*, lt.name as leave_name
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.organization_id = ? 
        AND lr.employee_id = ? 
        AND lr.status = 'APPROVED'
        AND lr.start_date <= ? 
        AND lr.end_date >= ?
    `, [orgId, assignment.employee_id, assignment.shift_date, assignment.shift_date]);

    if (leaveConflict) {
      warnings.push(`${empName} has an approved leave (${(leaveConflict as any).leave_name}) on ${assignment.shift_date}`);
    }

    return {
      hasConflict: errors.length > 0 || warnings.length > 0,
      errors,
      warnings
    };
  }

  /**
   * Create Schedule Assignment
   */
  public static createAssignment(
    orgId: string,
    actorUserId: string,
    data: CreateAssignmentInput,
    force: boolean = false
  ): ScheduleAssignment {
    const conflict = this.checkConflicts(orgId, data);
    if (conflict.errors.length > 0 && !force) {
      throw new Error(`Schedule conflict: ${conflict.errors.join('; ')}`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.execute(`
      INSERT INTO schedule_assignments (
        id, organization_id, schedule_id, employee_id, building_id,
        shift_id, shift_date, start_time, end_time, break_duration_minutes,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)
    `, [
      id, orgId, data.schedule_id || null, data.employee_id, data.building_id,
      data.shift_id || null, data.shift_date, data.start_time, data.end_time,
      data.break_duration_minutes ?? 30, data.notes || null, now, now
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'SCHEDULE.ASSIGN',
      entityType: 'schedule_assignments',
      entityId: id,
      afterState: data
    });

    return db.queryOne<ScheduleAssignment>('SELECT * FROM schedule_assignments WHERE id = ?', [id])!;
  }

  /**
   * Fetch Weekly Schedule Matrix
   */
  public static getScheduleGrid(
    orgId: string,
    filters: { startDate: string; endDate: string; buildingId?: string; employeeId?: string }
  ) {
    let sql = `
      SELECT 
        sa.id, sa.shift_date, sa.start_time, sa.end_time, sa.status, sa.notes,
        sa.break_duration_minutes,
        e.id as employee_id, e.employee_code, e.first_name, e.last_name,
        b.id as building_id, b.name as building_name,
        s.id as shift_id, s.name as shift_name, s.color as shift_color
      FROM schedule_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      JOIN buildings b ON b.id = sa.building_id
      LEFT JOIN shifts s ON s.id = sa.shift_id
      WHERE sa.organization_id = ?
        AND sa.shift_date >= ?
        AND sa.shift_date <= ?
    `;
    const params: any[] = [orgId, filters.startDate, filters.endDate];

    if (filters.buildingId) {
      sql += ' AND sa.building_id = ?';
      params.push(filters.buildingId);
    }
    if (filters.employeeId) {
      sql += ' AND sa.employee_id = ?';
      params.push(filters.employeeId);
    }

    sql += ' ORDER BY sa.shift_date ASC, sa.start_time ASC';
    return db.query(sql, params);
  }

  public static deleteAssignment(orgId: string, actorUserId: string, assignmentId: string): void {
    db.execute('DELETE FROM schedule_assignments WHERE id = ? AND organization_id = ?', [assignmentId, orgId]);
    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'SCHEDULE.DELETE',
      entityType: 'schedule_assignments',
      entityId: assignmentId
    });
  }
}
