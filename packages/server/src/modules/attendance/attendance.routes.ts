import { Router, Request, Response } from 'express';
import { AttendanceEngine } from './attendance.engine.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { db } from '../../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const router = Router();

const punchSchema = z.object({
  employeeId: z.string().optional(), // Inferred from req.user if employee
  eventType: z.enum(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END']),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyMeters: z.number().optional(),
  buildingId: z.string().optional(),
  biometricVerified: z.boolean().optional(),
  clientEventId: z.string().optional(),
  timestamp: z.string().optional()
});

const adjustSchema = z.object({
  sessionId: z.string().min(1),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  regularMinutes: z.number().optional(),
  overtimeMinutes: z.number().optional(),
  reason: z.string().min(3)
});

// Mobile / Web Attendance Punch
router.post('/punch', authenticateToken, (req: Request, res: Response) => {
  try {
    const data = punchSchema.parse(req.body);
    let employeeId = data.employeeId || req.user!.employeeId;

    if (!employeeId) {
      // Fallback query to find linked employee record for this user
      const emp = db.queryOne<{ id: string }>(
        'SELECT id FROM employees WHERE organization_id = ? AND (user_id = ? OR LOWER(email) = LOWER(?))',
        [req.user!.orgId, req.user!.userId, req.user!.email]
      );
      if (emp) {
        employeeId = emp.id;
      } else {
        // Auto-provision employee profile for user
        const newEmpId = uuidv4();
        const codeNum = Math.floor(1000 + Math.random() * 9000);
        db.execute(`
          INSERT INTO employees (id, organization_id, user_id, employee_code, first_name, last_name, email, employment_type, status, hire_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'SALARIED', 'ACTIVE', date('now'))
        `, [newEmpId, req.user!.orgId, req.user!.userId, `EMP-${codeNum}`, req.user!.firstName || 'Staff', req.user!.lastName || 'Member', req.user!.email]);
        employeeId = newEmpId;
      }
    }

    const result = AttendanceEngine.processMobilePunch({
      organizationId: req.user!.orgId,
      employeeId,
      eventType: data.eventType,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyMeters: data.accuracyMeters,
      buildingId: data.buildingId,
      biometricVerified: data.biometricVerified,
      clientEventId: data.clientEventId,
      timestamp: data.timestamp
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Attendance punch failed' });
  }
});

// Get Current User Active Attendance Session
router.get('/my-session', authenticateToken, (req: Request, res: Response) => {
  try {
    let employeeId = req.user!.employeeId;
    if (!employeeId) {
      const emp = db.queryOne<{ id: string }>(
        'SELECT id FROM employees WHERE organization_id = ? AND (user_id = ? OR LOWER(email) = LOWER(?))',
        [req.user!.orgId, req.user!.userId, req.user!.email]
      );
      if (emp) employeeId = emp.id;
    }

    if (!employeeId) {
      res.json({ activeSession: null });
      return;
    }

    const session = db.queryOne(
      `SELECT s.*, b.name as building_name 
       FROM attendance_sessions s
       JOIN buildings b ON b.id = s.building_id
       WHERE s.organization_id = ? AND s.employee_id = ? AND s.status = 'OPEN'
       ORDER BY s.check_in_time DESC LIMIT 1`,
      [req.user!.orgId, employeeId]
    );

    res.json({ activeSession: session || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch current session' });
  }
});

// Live Attendance Monitoring
router.get('/live', authenticateToken, (req: Request, res: Response) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    const records = AttendanceEngine.getLiveAttendanceOverview(req.user!.orgId, buildingId);
    res.json({ liveAttendance: records });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch live attendance' });
  }
});

// Admin Adjust Session
router.post('/adjust', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const data = adjustSchema.parse(req.body);
    const updated = AttendanceEngine.adjustSession(req.user!.orgId, req.user!.userId, data);
    res.json({ success: true, session: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to adjust attendance session' });
  }
});

// Ingest Terminal Punch (Mock / Hardware Gateway)
router.post('/device-punch', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const { deviceIdentifier, biometricPinOrCard, punchType, punchTime, rawPunchId } = req.body;
    const event = AttendanceEngine.processDevicePunch(req.user!.orgId, {
      rawPunchId: rawPunchId || `PUNCH-${Date.now()}`,
      deviceIdentifier,
      biometricPinOrCard,
      punchType: punchType || 'CHECK_IN',
      punchTime: punchTime || new Date().toISOString(),
      verificationType: 'FINGERPRINT'
    });

    res.json({ success: true, event });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Device punch ingestion failed' });
  }
});

export default router;
