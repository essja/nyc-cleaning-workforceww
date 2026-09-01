import { Router, Request, Response } from 'express';
import { SchedulingService } from './scheduling.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createShiftSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  break_duration_minutes: z.number().min(0).optional(),
  is_paid_break: z.boolean().optional(),
  color: z.string().optional()
});

const createAssignmentSchema = z.object({
  schedule_id: z.string().optional(),
  employee_id: z.string().min(1),
  building_id: z.string().min(1),
  shift_id: z.string().optional(),
  shift_date: z.string().min(10), // "YYYY-MM-DD"
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  break_duration_minutes: z.number().optional(),
  notes: z.string().optional(),
  force: z.boolean().optional()
});

// List Shifts
router.get('/shifts', authenticateToken, (req: Request, res: Response) => {
  try {
    const shifts = SchedulingService.listShifts(req.user!.orgId);
    res.json({ shifts });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch shifts' });
  }
});

// Create Shift
router.post('/shifts', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const input = createShiftSchema.parse(req.body);
    const shift = SchedulingService.createShift(req.user!.orgId, req.user!.userId, input);
    res.status(201).json(shift);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create shift' });
  }
});

// Get Work Week Range
router.get('/week-range', authenticateToken, (req: Request, res: Response) => {
  try {
    const refDate = req.query.date ? new Date(req.query.date as string) : new Date();
    const range = SchedulingService.getWorkWeekRange(req.user!.orgId, refDate);
    res.json(range);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate work week' });
  }
});

// Get Weekly Schedule Grid
router.get('/grid', authenticateToken, (req: Request, res: Response) => {
  try {
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;
    const buildingId = req.query.buildingId as string | undefined;
    const employeeId = req.query.employeeId as string | undefined;

    const assignments = SchedulingService.getScheduleGrid(req.user!.orgId, {
      startDate,
      endDate,
      buildingId,
      employeeId
    });

    res.json({ assignments });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch schedule grid' });
  }
});

// Check Conflict
router.post('/check-conflict', authenticateToken, (req: Request, res: Response) => {
  try {
    const input = createAssignmentSchema.parse(req.body);
    const result = SchedulingService.checkConflicts(req.user!.orgId, input);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to evaluate conflicts' });
  }
});

// Create Schedule Assignment
router.post('/assignments', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const input = createAssignmentSchema.parse(req.body);
    const assignment = SchedulingService.createAssignment(
      req.user!.orgId,
      req.user!.userId,
      input,
      Boolean(input.force)
    );
    res.status(201).json(assignment);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to save assignment' });
  }
});

// Delete Schedule Assignment
router.delete('/assignments/:id', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    SchedulingService.deleteAssignment(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Assignment deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete assignment' });
  }
});

export default router;
