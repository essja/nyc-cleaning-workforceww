import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { AuditLog } from '../../db/types.js';

export interface CreateAuditLogParams {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  public static log(params: CreateAuditLogParams): void {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.execute(`
        INSERT INTO audit_logs (
          id, organization_id, actor_user_id, action, entity_type,
          entity_id, before_state, after_state, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        params.organizationId,
        params.actorUserId || null,
        params.action,
        params.entityType,
        params.entityId,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        params.ipAddress || '127.0.0.1',
        params.userAgent || 'API Client',
        now
      ]);
    } catch (err) {
      console.error('⚠️ Failed to write audit log:', err);
    }
  }

  public static getLogsByOrg(
    orgId: string,
    filters?: {
      limit?: number;
      page?: number;
      search?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    }
  ): { logs: AuditLog[]; totalCount: number } {
    const limit = filters?.limit || 25;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE organization_id = ?';
    const params: any[] = [orgId];

    if (filters?.action) {
      whereClause += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters?.search) {
      whereClause += ' AND (action LIKE ? OR entity_type LIKE ? OR ip_address LIKE ? OR entity_id LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }

    if (filters?.startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    const countRow = db.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`, params);
    const totalCount = countRow?.count || 0;

    const logs = db.query<AuditLog>(`
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return { logs, totalCount };
  }

  /**
   * Purge non-critical routine login logs older than N days to keep database lightweight
   */
  public static purgeRoutineLoginLogs(orgId: string, olderThanDays: number = 30): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db.execute(`
      DELETE FROM audit_logs
      WHERE organization_id = ? AND action = 'AUTH.LOGIN' AND created_at < ?
    `, [orgId, cutoff]);
    return result.changes;
  }
}
