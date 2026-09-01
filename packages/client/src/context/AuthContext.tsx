import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';

export interface UserContextData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'SUPERVISOR' | 'EMPLOYEE';
  permissions: string[];
  assignedBuildingIds: string[];
  employeeId?: string;
  orgId: string;
  orgSlug: string;
}

export interface OrganizationContextData {
  id: string;
  name: string;
  slug: string;
  work_week_start: number;
  timezone: string;
  currency: string;
}

interface AuthContextType {
  // Admin Portal State
  adminUser: UserContextData | null;
  adminOrg: OrganizationContextData | null;
  loginAdmin: (email: string, password: string) => Promise<void>;
  logoutAdmin: () => void;

  // Employee Portal State
  employeeUser: UserContextData | null;
  employeeOrg: OrganizationContextData | null;
  loginEmployee: (email: string, password: string) => Promise<void>;
  logoutEmployee: () => void;

  // Active Context (Scope-aware fallback for compatibility)
  user: UserContextData | null;
  organization: OrganizationContextData | null;
  availableOrganizations: { id: string; name: string; slug: string; role: string }[];
  isLoading: boolean;
  isOnline: boolean;
  offlineQueueCount: number;
  login: (email: string, password: string, orgSlug?: string) => Promise<void>;
  logout: () => void;
  refreshOfflineCount: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminUser, setAdminUser] = useState<UserContextData | null>(null);
  const [adminOrg, setAdminOrg] = useState<OrganizationContextData | null>(null);

  const [employeeUser, setEmployeeUser] = useState<UserContextData | null>(null);
  const [employeeOrg, setEmployeeOrg] = useState<OrganizationContextData | null>(null);

  const [availableOrganizations, setAvailableOrganizations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);

  const refreshOfflineCount = () => {
    setOfflineQueueCount(api.getOfflineQueue().length);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      api.syncOfflinePunches().then(() => refreshOfflineCount());
    };
    const handleOffline = () => setIsOnline(false);

    const handleUnauthorized = (e: any) => {
      const scope = e?.detail?.scope;
      if (scope === 'employee') {
        setEmployeeUser(null);
        setEmployeeOrg(null);
      } else {
        setAdminUser(null);
        setAdminOrg(null);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    const initAuth = async () => {
      // 1. Verify Admin Session if admin token exists
      const adminToken = api.getToken('admin');
      if (adminToken) {
        try {
          const res = await api.request('/auth/me', {
            headers: { Authorization: `Bearer ${adminToken}` }
          });
          const adminRoles = ['OWNER', 'ADMIN', 'HR_MANAGER'];
          if (adminRoles.includes(res.user.role)) {
            setAdminUser(res.user);
            setAdminOrg({
              id: res.user.orgId,
              name: 'NYC Cleaning and Maintenance',
              slug: res.user.orgSlug || 'nyc-cleaning-and-maintenance',
              work_week_start: 0,
              timezone: 'America/New_York',
              currency: 'USD'
            });
          } else {
            api.setToken(null, 'admin');
          }
        } catch {
          api.setToken(null, 'admin');
        }
      }

      // 2. Verify Employee Session if employee token exists
      const employeeToken = api.getToken('employee');
      if (employeeToken) {
        try {
          const res = await api.request('/auth/me', {
            headers: { Authorization: `Bearer ${employeeToken}` }
          });
          setEmployeeUser(res.user);
          setEmployeeOrg({
            id: res.user.orgId,
            name: 'NYC Cleaning and Maintenance',
            slug: res.user.orgSlug || 'nyc-cleaning-and-maintenance',
            work_week_start: 0,
            timezone: 'America/New_York',
            currency: 'USD'
          });
        } catch {
          api.setToken(null, 'employee');
        }
      }

      setIsLoading(false);
      refreshOfflineCount();
    };

    initAuth();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // Dedicated Admin Login
  const loginAdmin = async (email: string, password: string) => {
    const res = await api.post('/auth/login/admin', {
      email: email.trim().toLowerCase(),
      password: password.trim()
    });
    api.setToken(res.accessToken, 'admin');
    api.setOrganizationId(res.organization.id, 'admin');
    setAdminUser(res.user);
    setAdminOrg(res.organization);
    setAvailableOrganizations(res.availableOrganizations || []);
  };

  // Dedicated Admin Logout
  const logoutAdmin = () => {
    api.post('/auth/logout').catch(() => {});
    api.setToken(null, 'admin');
    api.setOrganizationId(null, 'admin');
    setAdminUser(null);
    setAdminOrg(null);
  };

  // Dedicated Employee Login
  const loginEmployee = async (email: string, password: string) => {
    const res = await api.post('/auth/login/employee', {
      email: email.trim().toLowerCase(),
      password: password.trim()
    });
    api.setToken(res.accessToken, 'employee');
    api.setOrganizationId(res.organization.id, 'employee');
    setEmployeeUser(res.user);
    setEmployeeOrg(res.organization);
  };

  // Dedicated Employee Logout
  const logoutEmployee = () => {
    api.post('/auth/logout').catch(() => {});
    api.setToken(null, 'employee');
    api.setOrganizationId(null, 'employee');
    setEmployeeUser(null);
    setEmployeeOrg(null);
  };

  // Generic fallback methods
  const isEmployeeScope = typeof window !== 'undefined' && window.location.pathname.startsWith('/employee');
  const activeUser = isEmployeeScope ? (employeeUser || adminUser) : (adminUser || employeeUser);
  const activeOrg = isEmployeeScope ? (employeeOrg || adminOrg) : (adminOrg || employeeOrg);

  const login = async (email: string, password: string, orgSlug?: string) => {
    if (isEmployeeScope) {
      await loginEmployee(email, password);
    } else {
      await loginAdmin(email, password);
    }
  };

  const logout = () => {
    if (isEmployeeScope) {
      logoutEmployee();
    } else {
      logoutAdmin();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        adminUser,
        adminOrg,
        loginAdmin,
        logoutAdmin,

        employeeUser,
        employeeOrg,
        loginEmployee,
        logoutEmployee,

        user: activeUser,
        organization: activeOrg,
        availableOrganizations,
        isLoading,
        isOnline,
        offlineQueueCount,
        login,
        logout,
        refreshOfflineCount
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
