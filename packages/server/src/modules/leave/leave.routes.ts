import { Router, Request, Response } from 'express';
import { LeaveService } from './leave.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createRequestSchema = z.object({
  employeeId: z.string().optional(),
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  reason: z.string().optional()
});

const reviewRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional()
});

// List leave types
router.get('/types', authenticateToken, (req: Request, res: Response) => {
  try {
    const types = LeaveService.listLeaveTypes(req.user!.orgId);
    res.json({ leaveTypes: types });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave types' });
  }
});

// List leave requests
router.get('/requests', authenticateToken, (req: Request, res: Response) => {
  try {
    const employeeId = (req.query.employeeId as string) || (req.user!.role === 'EMPLOYEE' ? req.user!.employeeId : undefined);
    const status = req.query.status as string | undefined;

    const requests = LeaveService.listLeaveRequests(req.user!.orgId, { employeeId, status });
    res.json({ leaveRequests: requests });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave requests' });
  }
});

// Submit leave request (Employee or Manager)
router.post('/requests', authenticateToken, (req: Request, res: Response) => {
  try {
    const data = createRequestSchema.parse(req.body);
    const employeeId = data.employeeId || req.user!.employeeId;
    if (!employeeId) {
      res.status(400).json({ error: 'Employee ID required' });
      return;
    }

    const request = LeaveService.createLeaveRequest(req.user!.orgId, req.user!.userId, {
      ...data,
      employeeId
    });

    res.status(201).json({ leaveRequest: request });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit leave request' });
  }
});

// Review leave request (Approve / Reject)
router.post('/requests/:id/review', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const data = reviewRequestSchema.parse(req.body);
    const reviewed = LeaveService.reviewLeaveRequest(
      req.user!.orgId,
      req.user!.userId,
      req.params.id as string,
      data.decision,
      data.notes
    );

    res.json({ success: true, leaveRequest: reviewed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to review leave request' });
  }
});

export default router;
