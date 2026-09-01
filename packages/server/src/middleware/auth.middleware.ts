import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../modules/auth/auth.service.js';
import { UserRole } from '../db/types.js';
import { db } from '../db/index.js';
import { User } from '../db/types.js';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.accessToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  try {
    const payload = AuthService.verifyAccessToken(token);
    const userRecord = db.queryOne<User>('SELECT first_name, last_name, is_active FROM users WHERE id = ?', [payload.userId]);

    if (!userRecord || !userRecord.is_active) {
      res.status(401).json({ error: 'User account is inactive or not found.' });
      return;
    }

    req.user = {
      ...payload,
      firstName: userRecord.first_name,
      lastName: userRecord.last_name
    };
    req.organizationId = payload.orgId;

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.organizationId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // Check if tenant ID was explicitly passed in params or headers
  const paramOrgId = req.params.orgId || req.headers['x-organization-id'];
  if (paramOrgId && paramOrgId !== req.organizationId) {
    res.status(403).json({
      error: 'Cross-tenant access forbidden. You cannot access data outside your organization.'
    });
    return;
  }

  next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Permission denied. Required role: [${allowedRoles.join(', ')}]. Your role: ${req.user.role}`
      });
      return;
    }

    next();
  };
}

export function requirePermissions(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // Owner and Admin have all permissions by default
    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      return next();
    }

    const hasAll = requiredPermissions.every((p) => req.user!.permissions.includes(p));
    if (!hasAll) {
      res.status(403).json({
        error: `Permission denied. Required permissions: [${requiredPermissions.join(', ')}]`
      });
      return;
    }

    next();
  };
}

export function requireBuildingScope(paramName: string = 'buildingId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // Owner, Admin, and HR_Manager have global building scope
    if (['OWNER', 'ADMIN', 'HR_MANAGER'].includes(req.user.role)) {
      return next();
    }

    const buildingId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (buildingId && req.user.assignedBuildingIds.length > 0) {
      if (!req.user.assignedBuildingIds.includes(buildingId)) {
        res.status(403).json({
          error: 'Access denied. You are not assigned to manage or view this building.'
        });
        return;
      }
    }

    next();
  };
}
