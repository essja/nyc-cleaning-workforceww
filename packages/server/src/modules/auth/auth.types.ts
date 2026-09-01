import { UserRole } from '../../db/types.js';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  orgId: string;
  orgSlug: string;
  role: UserRole;
  permissions: string[];
  assignedBuildingIds: string[];
  employeeId?: string;
}

export interface AuthenticatedRequestUser extends AuthTokenPayload {
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
      organizationId?: string;
    }
  }
}
