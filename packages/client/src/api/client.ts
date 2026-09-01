/**
 * Production API Client & Portal-Scoped Offline Storage Engine
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

class ApiClient {
  private baseUrl = (import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : '/api/v1');

  public getPortalScope(): 'admin' | 'employee' {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/employee')) {
      return 'employee';
    }
    return 'admin';
  }

  public getToken(scope?: 'admin' | 'employee'): string | null {
    const s = scope || this.getPortalScope();
    if (s === 'employee') {
      return localStorage.getItem('employee_auth_token');
    }
    return localStorage.getItem('admin_auth_token') || localStorage.getItem('auth_token');
  }

  public setToken(token: string | null, scope?: 'admin' | 'employee') {
    const s = scope || this.getPortalScope();
    if (s === 'employee') {
      if (token) {
        localStorage.setItem('employee_auth_token', token);
      } else {
        localStorage.removeItem('employee_auth_token');
      }
    } else {
      if (token) {
        localStorage.setItem('admin_auth_token', token);
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('admin_auth_token');
        localStorage.removeItem('auth_token');
      }
    }
  }

  public getOrganizationId(scope?: 'admin' | 'employee'): string | null {
    const s = scope || this.getPortalScope();
    if (s === 'employee') {
      return localStorage.getItem('employee_active_org_id');
    }
    return localStorage.getItem('admin_active_org_id') || localStorage.getItem('active_org_id');
  }

  public setOrganizationId(orgId: string | null, scope?: 'admin' | 'employee') {
    const s = scope || this.getPortalScope();
    if (s === 'employee') {
      if (orgId) {
        localStorage.setItem('employee_active_org_id', orgId);
      } else {
        localStorage.removeItem('employee_active_org_id');
      }
    } else {
      if (orgId) {
        localStorage.setItem('admin_active_org_id', orgId);
        localStorage.setItem('active_org_id', orgId);
      } else {
        localStorage.removeItem('admin_active_org_id');
        localStorage.removeItem('active_org_id');
      }
    }
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    const token = this.getToken();
    const orgId = this.getOrganizationId();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (orgId) {
      headers['X-Organization-Id'] = orgId;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        const scope = this.getPortalScope();
        this.setToken(null, scope);
        window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { scope } }));
      }

      if (options.headers && (options.headers as any)['Accept'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        return response.blob() as any;
      }

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || `HTTP error ${response.status}`);
      }

      return json;
    } catch (err: any) {
      throw err;
    }
  }

  public get<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  public post<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  public put<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  public delete<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // --- Offline Storage Queue for Mobile Attendance ---
  public getOfflineQueue(): any[] {
    try {
      const stored = localStorage.getItem('offline_punch_queue');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public queueOfflinePunch(punch: any) {
    const queue = this.getOfflineQueue();
    queue.push({
      ...punch,
      queuedAt: new Date().toISOString()
    });
    localStorage.setItem('offline_punch_queue', JSON.stringify(queue));
  }

  public clearOfflineQueue() {
    localStorage.removeItem('offline_punch_queue');
  }

  public async syncOfflinePunches(): Promise<{ synced: number; failed: number }> {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    try {
      const res = await this.post('/sync/batch', {
        clientId: `BROWSER-${navigator.userAgent.substring(0, 30)}`,
        sourceType: 'MOBILE_APP',
        events: queue
      });

      this.clearOfflineQueue();
      return {
        synced: res.successfullyProcessed || 0,
        failed: res.failedCount || 0
      };
    } catch (err) {
      return { synced: 0, failed: queue.length };
    }
  }
}

export const api = new ApiClient();
