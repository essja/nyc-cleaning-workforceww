import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { LeaveType, LeaveRequest, Employee, User } from '../../db/types.js';
import { AuditService } from '../audit/audit.service.js';

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  reason?: string;
}

export class LeaveService {
  public static listLeaveTypes(orgId: string): LeaveType[] {
    return db.query<LeaveType>('SELECT * FROM leave_types WHERE organization_id = ? ORDER BY name ASC', [orgId]);
  }

  public static createLeaveType(
    orgId: string,
    actorUserId: string,
    data: { name: string; code?: string; isPaid?: boolean; daysAllowedPerYear?: number }
  ): LeaveType {
    const id = uuidv4();
    const now = new Date().toISOString();
    db.execute(`
      INSERT INTO leave_types (id, organization_id, name, code, is_paid, days_allowed_per_year, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, orgId, data.name, data.code || null, data.isPaid ? 1 : 0, data.daysAllowedPerYear ?? 14.0, now, now]);

    return db.queryOne<LeaveType>('SELECT * FROM leave_types WHERE id = ?', [id])!;
  }

  public static listLeaveRequests(orgId: string, filters?: { employeeId?: string; status?: string }) {
    let sql = `
      SELECT 
        lr.*, lt.name as leave_type_name, lt.is_paid,
        e.employee_code, e.first_name, e.last_name,
        u.first_name as reviewer_first_name, u.last_name as reviewer_last_name
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN users u ON u.id = lr.reviewed_by
      WHERE lr.organization_id = ?
    `;
    const params: any[] = [orgId];

    if (filters?.employeeId) {
      sql += ' AND lr.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.status) {
      sql += ' AND lr.status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY lr.start_date DESC';
    return db.query(sql, params);
  }

  public static createLeaveRequest(
    orgId: string,
    actorUserId: string,
    input: CreateLeaveRequestInput
  ): LeaveRequest {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.execute(`
      INSERT INTO leave_requests (
        id, organization_id, employee_id, leave_type_id, start_date, end_date,
        reason, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `, [id, orgId, input.employeeId, input.leaveTypeId, input.startDate, input.endDate, input.reason || null, now, now]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'LEAVE.REQUEST',
      entityType: 'leave_requests',
      entityId: id,
      afterState: input
    });

    return db.queryOne<LeaveRequest>('SELECT * FROM leave_requests WHERE id = ?', [id])!;
  }

  public static reviewLeaveRequest(
    orgId: string,
    actorUserId: string,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string
  ): LeaveRequest {
    const existing = db.queryOne<LeaveRequest>(
      'SELECT * FROM leave_requests WHERE organization_id = ? AND id = ?',
      [orgId, requestId]
    );
    if (!existing) throw new Error('Leave request not found');

    const now = new Date().toISOString();

    db.transaction(() => {
      db.execute(`
        UPDATE leave_requests SET
          status = ?, reviewed_by = ?, reviewed_at = ?, reviewer_notes = ?, updated_at = ?
        WHERE id = ? AND organization_id = ?
      `, [decision, actorUserId, now, notes || null, now, requestId, orgId]);

      // If approved, notify or flag any existing schedules during that date window
      if (decision === 'APPROVED') {
        db.execute(`
          UPDATE schedule_assignments SET notes = COALESCE(notes || ' | ', '') || '[ALERT: Approved Leave on this date]'
          WHERE organization_id = ? AND employee_id = ? AND shift_date >= ? AND shift_date <= ?
        `, [orgId, existing.employee_id, existing.start_date, existing.end_date]);
      }

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: `LEAVE.${decision}`,
        entityType: 'leave_requests',
        entityId: requestId,
        beforeState: existing,
        afterState: { decision, notes }
      });
    });

    return db.queryOne<LeaveRequest>('SELECT * FROM leave_requests WHERE id = ?', [requestId])!;
  }
}
