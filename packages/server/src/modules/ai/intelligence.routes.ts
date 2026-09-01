import { Router, Request, Response } from 'express';
import { WorkforceIntelligenceService } from './intelligence.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const querySchema = z.object({
  question: z.string().min(2)
});

// Anomaly insights
router.get('/insights', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const understaffing = WorkforceIntelligenceService.getUnderstaffingAnalysis(req.user!.orgId);
    const patterns = WorkforceIntelligenceService.getAttendancePatternAnomalies(req.user!.orgId);
    const overtime = WorkforceIntelligenceService.getOvertimeHotspots(req.user!.orgId);

    res.json({
      insights: [...understaffing, ...patterns, ...overtime]
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate workforce insights' });
  }
});

// Management Q&A Assistant
router.post('/ask', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'), (req: Request, res: Response) => {
  try {
    const { question } = querySchema.parse(req.body);
    const result = WorkforceIntelligenceService.answerQuery(req.user!.orgId, question);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process inquiry' });
  }
});

export default router;
