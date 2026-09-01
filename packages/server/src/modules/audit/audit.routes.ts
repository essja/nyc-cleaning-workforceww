import { Router, Request, Response } from 'express';
import { AuditService } from './audit.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';

const router = Router();

// Query Audit Logs with Search, Action filter, and Pagination
router.get('/', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string || '20', 10);
    const page = parseInt(req.query.page as string || '1', 10);
    const search = req.query.search as string | undefined;
    const action = req.query.action as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const result = AuditService.getLogsByOrg(req.user!.orgId, {
      limit,
      page,
      search,
      action,
      startDate,
      endDate
    });

    res.json({
      auditLogs: result.logs,
      totalCount: result.totalCount,
      page,
      limit,
      totalPages: Math.ceil(result.totalCount / limit)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

// Purge Routine Login Audit Records (Owner only)
router.post('/purge-routine-logins', authenticateToken, requireRoles('OWNER'), (req: Request, res: Response) => {
  try {
    const olderThanDays = parseInt(req.body.olderThanDays || '30', 10);
    const purgedCount = AuditService.purgeRoutineLoginLogs(req.user!.orgId, olderThanDays);
    res.json({
      success: true,
      purgedCount,
      message: `Successfully purged ${purgedCount} routine login records older than ${olderThanDays} days.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to purge audit records' });
  }
});

export default router;
