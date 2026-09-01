import { Router, Request, Response } from 'express';
import { BuildingsService } from './buildings.service.js';
import { authenticateToken, requireRoles, requireBuildingScope } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createBuildingSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().min(1),
  state_province: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  geofence_radius_meters: z.number().min(10).max(5000).optional()
});

const verifyGeofenceSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
});

// List all buildings for the organization
router.get('/', authenticateToken, (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const buildings = BuildingsService.listBuildings(req.user!.orgId, search);

    // If manager / supervisor with scoped buildings, filter list
    if (['MANAGER', 'SUPERVISOR'].includes(req.user!.role) && req.user!.assignedBuildingIds.length > 0) {
      const filtered = buildings.filter((b) => req.user!.assignedBuildingIds.includes(b.id));
      res.json({ buildings: filtered });
      return;
    }

    res.json({ buildings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch buildings' });
  }
});

// Get specific building details
router.get('/:id', authenticateToken, requireBuildingScope('id'), (req: Request, res: Response) => {
  try {
    const building = BuildingsService.getBuildingDetails(req.user!.orgId, req.params.id as string);
    res.json(building);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Building not found' });
  }
});

// Create new building (Admin/Owner)
router.post('/', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const input = createBuildingSchema.parse(req.body);
    const building = BuildingsService.createBuilding(req.user!.orgId, req.user!.userId, input);
    res.status(201).json(building);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create building' });
  }
});

// Update building (Admin/Owner)
router.put('/:id', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const input = createBuildingSchema.partial().parse(req.body);
    const building = BuildingsService.updateBuilding(req.user!.orgId, req.user!.userId, req.params.id as string, input);
    res.json(building);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update building' });
  }
});

// Archive building (Admin/Owner)
router.delete('/:id', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    BuildingsService.archiveBuilding(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Building successfully archived' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to archive building' });
  }
});

// List all organization biometric devices
router.get('/devices/all', authenticateToken, (req: Request, res: Response) => {
  try {
    const devices = db.query(`
      SELECT d.*, b.name as building_name
      FROM biometric_devices d
      JOIN buildings b ON b.id = d.building_id
      WHERE d.organization_id = ?
      ORDER BY d.name ASC
    `, [req.user!.orgId]);
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list devices' });
  }
});

// Register new biometric device for a building
router.post('/:id/devices', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const { name, deviceIdentifier, manufacturer, ipAddress, port } = req.body;
    if (!name || !deviceIdentifier) {
      res.status(400).json({ error: 'Device name and identifier are required' });
      return;
    }
    const devId = uuidv4();
    const now = new Date().toISOString();
    db.execute(`
      INSERT INTO biometric_devices (id, organization_id, building_id, device_identifier, name, manufacturer, ip_address, port, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ONLINE', ?, ?)
    `, [
      devId, req.user!.orgId, req.params.id, deviceIdentifier, name,
      manufacturer || 'ZKTECO', ipAddress || '192.168.1.100', port || 4370, now, now
    ]);

    // Also auto-enroll existing active employees with PINs if not enrolled
    const activeEmps = db.query<{ id: string; employee_code: string }>(
      'SELECT id, employee_code FROM employees WHERE organization_id = ? AND status = "ACTIVE"',
      [req.user!.orgId]
    );
    for (const emp of activeEmps) {
      const pinCode = `PIN-${emp.employee_code.replace(/[^0-9]/g, '') || '1001'}`;
      db.execute(`
        INSERT OR IGNORE INTO employee_device_enrollments (id, organization_id, employee_id, device_id, biometric_pin_or_card, is_synced, enrolled_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [uuidv4(), req.user!.orgId, emp.id, devId, pinCode, now]);
    }

    const created = db.queryOne('SELECT * FROM biometric_devices WHERE id = ?', [devId]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to register device' });
  }
});

// Verify Geofence API
router.post('/:id/verify-geofence', authenticateToken, (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = verifyGeofenceSchema.parse(req.body);
    const result = BuildingsService.verifyGeofence(req.user!.orgId, req.params.id as string, latitude, longitude);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to verify geofence' });
  }
});

export default router;
