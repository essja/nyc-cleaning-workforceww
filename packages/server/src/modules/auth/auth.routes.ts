import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  orgSlug: z.string().optional()
});

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR', 'EMPLOYEE']),
  assignedBuildingIds: z.array(z.string()).optional(),
  employeeId: z.string().optional()
});

const activateSchema = z.object({
  invitationToken: z.string().min(1),
  password: z.string().min(8)
});

// Dedicated Admin/Owner Login Route
router.post('/login/admin', async (req: Request, res: Response) => {
  try {
    const { email, password, orgSlug } = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.loginAdmin(email, password, orgSlug, ip, userAgent);

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Administrator login failed' });
  }
});

// Dedicated Employee Portal Login Route
router.post('/login/employee', async (req: Request, res: Response) => {
  try {
    const { email, password, orgSlug } = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.loginEmployee(email, password, orgSlug, ip, userAgent);

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Employee login failed' });
  }
});

// General Fallback Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, orgSlug } = loginSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.login(email, password, orgSlug, ip, userAgent);

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Login failed' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Refresh Token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }

    const result = await AuthService.refreshAccessToken(refreshToken);

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Token refresh failed' });
  }
});

// Get Current User (Me)
router.get('/me', authenticateToken, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Invite User (Admin/Owner/HR)
router.post('/invite', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), async (req: Request, res: Response) => {
  try {
    const data = inviteSchema.parse(req.body);
    const result = await AuthService.inviteUser({
      organizationId: req.user!.orgId,
      actorUserId: req.user!.userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      assignedBuildingIds: data.assignedBuildingIds,
      employeeId: data.employeeId
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to invite user' });
  }
});

// Activate Account
router.post('/activate', async (req: Request, res: Response) => {
  try {
    const { invitationToken, password } = activateSchema.parse(req.body);
    await AuthService.activateAccount(invitationToken, password);
    res.json({ success: true, message: 'Account successfully activated. You can now log in.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Account activation failed' });
  }
});

// Suspend User
router.post('/users/:userId/suspend', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    AuthService.suspendUser(req.user!.orgId, req.user!.userId, req.params.userId as string);
    res.json({ success: true, message: 'User membership successfully suspended' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to suspend user' });
  }
});

// Reactivate User
router.post('/users/:userId/reactivate', authenticateToken, requireRoles('OWNER', 'ADMIN'), (req: Request, res: Response) => {
  try {
    AuthService.reactivateUser(req.user!.orgId, req.user!.userId, req.params.userId as string);
    res.json({ success: true, message: 'User membership successfully reactivated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reactivate user' });
  }
});

export default router;
