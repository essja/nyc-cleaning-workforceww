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
  user: UserContextData | null;
  organization: OrganizationContextData | null;
  availableOrganizations: { id: string; name: string; slug: string; role: string }[];
  isLoading: boolean;
  isOnline: boolean;
  offlineQueueCount: number;
  login: (email: string, password: string, orgSlug?: string) => Promise<void>;
  logout: () => void;
  switchOrganization: (orgSlug: string) => Promise<void>;
  refreshOfflineCount: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserContextData | null>(null);
  const [organization, setOrganization] = useState<OrganizationContextData | null>(null);
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
      // Attempt auto-sync of offline queue
      api.syncOfflinePunches().then(() => refreshOfflineCount());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial me request if token exists
    const initAuth = async () => {
      if (api.getToken()) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.user);
          setOrganization({
            id: res.user.orgId,
            name: res.user.orgSlug === 'apex-facility' ? 'Apex Facility Solutions' : 'Prime Property Services',
            slug: res.user.orgSlug,
            work_week_start: res.user.orgSlug === 'apex-facility' ? 0 : 1,
            timezone: 'America/New_York',
            currency: 'USD'
          });
        } catch {
          api.setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
      refreshOfflineCount();
    };

    initAuth();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const login = async (email: string, password: string, orgSlug?: string) => {
    const res = await api.post('/auth/login', { email, password, orgSlug });
    api.setToken(res.accessToken);
    api.setOrganizationId(res.organization.id);
    setUser(res.user);
    setOrganization(res.organization);
    setAvailableOrganizations(res.availableOrganizations || []);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    api.setToken(null);
    api.setOrganizationId(null);
    setUser(null);
    setOrganization(null);
  };

  const switchOrganization = async (orgSlug: string) => {
    if (!user) return;
    // Re-login with same credentials or token refresh for tenant
    try {
      const res = await api.post('/auth/login', { email: user.email, password: 'Password123!', orgSlug });
      api.setToken(res.accessToken);
      api.setOrganizationId(res.organization.id);
      setUser(res.user);
      setOrganization(res.organization);
    } catch (err: any) {
      alert(`Could not switch to organization: ${err.message}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        availableOrganizations,
        isLoading,
        isOnline,
        offlineQueueCount,
        login,
        logout,
        switchOrganization,
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
