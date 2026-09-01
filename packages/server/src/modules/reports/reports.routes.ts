import { Router, Request, Response } from 'express';
import { ReportsService } from './reports.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';

const router = Router();

// Dashboard Overview Metrics
router.get('/dashboard', authenticateToken, (req: Request, res: Response) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    const metrics = ReportsService.getDashboardMetrics(req.user!.orgId, buildingId);
    res.json({ metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard metrics' });
  }
});

// Timesheet Report Query
router.get('/timesheets', authenticateToken, (req: Request, res: Response) => {
  try {
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;
    const buildingId = req.query.buildingId as string | undefined;
    const employeeId = (req.query.employeeId as string) || (req.user!.role === 'EMPLOYEE' ? req.user!.employeeId : undefined);

    const report = ReportsService.getTimesheetReport(req.user!.orgId, {
      startDate,
      endDate,
      buildingId,
      employeeId
    });

    res.json({ timesheet: report });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate timesheet report' });
  }
});

// Timesheet Excel Export
router.get('/timesheets/export', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;
    const buildingId = req.query.buildingId as string | undefined;
    const employeeId = req.query.employeeId as string | undefined;

    const buffer = ReportsService.exportTimesheetExcel(req.user!.orgId, {
      startDate,
      endDate,
      buildingId,
      employeeId
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet_report_${startDate}_${endDate}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to export timesheet spreadsheet' });
  }
});

export default router;
