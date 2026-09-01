import { Router, Request, Response } from 'express';
import { OfflineSyncService, OfflineSyncPayload } from './sync.service.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const syncPayloadSchema = z.object({
  clientId: z.string().min(1),
  sourceType: z.enum(['MOBILE_APP', 'EDGE_CONNECTOR']),
  events: z.array(z.object({
    employeeId: z.string(),
    eventType: z.enum(['CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END']),
    timestamp: z.string(),
    buildingId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    accuracyMeters: z.number().optional(),
    biometricVerified: z.boolean().optional(),
    clientEventId: z.string()
  }))
});

// Synchronize offline batch
router.post('/batch', authenticateToken, (req: Request, res: Response) => {
  try {
    const data = syncPayloadSchema.parse(req.body);
    const result = OfflineSyncService.processSyncBatch(
      req.user!.orgId,
      req.user!.userId,
      data as OfflineSyncPayload
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Offline batch sync failed' });
  }
});

export default router;
