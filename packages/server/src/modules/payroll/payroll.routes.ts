import { Router, Request, Response } from 'express';
import { PayrollService } from './payroll.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createPeriodSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(10),
  endDate: z.string().min(10)
});

const updateRulesSchema = z.object({
  daily_threshold_hours: z.number().min(1).max(24).optional(),
  weekly_threshold_hours: z.number().min(1).max(168).optional(),
  overtime_multiplier: z.number().min(1).max(5).optional(),
  double_time_threshold_hours: z.number().min(1).max(24).optional(),
  double_time_multiplier: z.number().min(1).max(5).optional()
});

// Get Overtime Rules
router.get('/rules', authenticateToken, (req: Request, res: Response) => {
  try {
    const rules = PayrollService.getOvertimeRules(req.user!.orgId);
    res.json({ rules });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch overtime rules' });
  }
});

// Update Overtime Rules
router.put('/rules', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const data = updateRulesSchema.parse(req.body);
    const updated = PayrollService.updateOvertimeRules(req.user!.orgId, req.user!.userId, data);
    res.json({ rules: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update overtime rules' });
  }
});

// List Payroll Periods
router.get('/periods', authenticateToken, (req: Request, res: Response) => {
  try {
    const periods = PayrollService.listPayrollPeriods(req.user!.orgId);
    res.json({ periods });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payroll periods' });
  }
});

// Create Payroll Period
router.post('/periods', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const input = createPeriodSchema.parse(req.body);
    const period = PayrollService.createPayrollPeriod(req.user!.orgId, req.user!.userId, input);
    res.status(201).json({ period });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create payroll period' });
  }
});

// Get Period Details
router.get('/periods/:id', authenticateToken, (req: Request, res: Response) => {
  try {
    const details = PayrollService.getPeriodDetails(req.user!.orgId, req.params.id as string);
    res.json(details);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Payroll period not found' });
  }
});

// Calculate Period
router.post('/periods/:id/calculate', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const result = PayrollService.calculatePeriod(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Payroll calculation failed' });
  }
});

// Approve Period
router.post('/periods/:id/approve', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const result = PayrollService.approvePeriod(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Payroll approval failed' });
  }
});

// Export Excel Register
router.get('/periods/:id/export', authenticateToken, (req: Request, res: Response) => {
  try {
    const buffer = PayrollService.exportToExcel(req.user!.orgId, req.params.id as string);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll_period_${req.params.id}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to export payroll' });
  }
});

export default router;
