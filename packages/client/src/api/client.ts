/**
 * Production API Client & Offline Storage Engine
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

class ApiClient {
  private baseUrl = '/api/v1';
  private token: string | null = null;
  private organizationId: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.organizationId = localStorage.getItem('active_org_id');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  public setOrganizationId(orgId: string | null) {
    this.organizationId = orgId;
    if (orgId) {
      localStorage.setItem('active_org_id', orgId);
    } else {
      localStorage.removeItem('active_org_id');
    }
  }

  public getToken() {
    return this.token;
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.organizationId) {
      headers['X-Organization-Id'] = this.organizationId;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        // Clear session on 401
        this.setToken(null);
        window.dispatchEvent(new Event('auth:unauthorized'));
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
