import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { Layout } from './components/Layout.js';
import { AdminLoginPage } from './pages/AdminLoginPage.js';
import { EmployeeLoginPage } from './pages/EmployeeLoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { BuildingsPage } from './pages/BuildingsPage.js';
import { EmployeesPage } from './pages/EmployeesPage.js';
import { SchedulingPage } from './pages/SchedulingPage.js';
import { AttendancePage } from './pages/AttendancePage.js';
import { PayrollPage } from './pages/PayrollPage.js';
import { LeavePage } from './pages/LeavePage.js';
import { DevicesPage } from './pages/DevicesPage.js';
import { IntelligencePage } from './pages/IntelligencePage.js';
import { AuditPage } from './pages/AuditPage.js';
import { EmployeeMobileApp } from './mobile/EmployeeMobileApp.js';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { adminUser, employeeUser, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo(0, 0);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span>Verifying secure workspace session...</span>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 1. OWNER & ADMIN PORTAL (/admin/*)
  // -------------------------------------------------------------
  if (currentPath.startsWith('/admin')) {
    // A. Admin Login Page
    if (currentPath === '/admin/login' || currentPath === '/admin/login/') {
      if (adminUser) {
        navigate('/admin/dashboard');
        return null;
      }
      return <AdminLoginPage onSuccess={() => navigate('/admin/dashboard')} />;
    }

    // B. Protected Admin Routes (/admin/dashboard, /admin/employees, etc.)
    if (!adminUser) {
      navigate('/admin/login');
      return <AdminLoginPage onSuccess={() => navigate(currentPath)} />;
    }

    // Determine current active admin tab from URL
    const tabFromPath = currentPath.replace(/^\/admin\/?/, '') || 'dashboard';
    const activeTab = ['dashboard', 'buildings', 'employees', 'scheduling', 'attendance', 'payroll', 'leave', 'devices', 'intelligence', 'audit'].includes(tabFromPath)
      ? tabFromPath
      : 'dashboard';

    return (
      <Layout
        currentTab={activeTab}
        setCurrentTab={(tabId) => navigate(`/admin/${tabId}`)}
      >
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'buildings' && <BuildingsPage />}
        {activeTab === 'employees' && <EmployeesPage />}
        {activeTab === 'scheduling' && <SchedulingPage />}
        {activeTab === 'attendance' && <AttendancePage />}
        {activeTab === 'payroll' && <PayrollPage />}
        {activeTab === 'leave' && <LeavePage />}
        {activeTab === 'devices' && <DevicesPage />}
        {activeTab === 'intelligence' && <IntelligencePage />}
        {activeTab === 'audit' && <AuditPage />}
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // 2. EMPLOYEE & CLEANER PORTAL (/employee/*)
  // -------------------------------------------------------------
  if (currentPath.startsWith('/employee')) {
    // A. Employee Login Page
    if (currentPath === '/employee/login' || currentPath === '/employee/login/') {
      if (employeeUser) {
        navigate('/employee/dashboard');
        return null;
      }
      return <EmployeeLoginPage onSuccess={() => navigate('/employee/dashboard')} />;
    }

    // B. Protected Employee Routes (/employee/dashboard)
    if (!employeeUser) {
      navigate('/employee/login');
      return <EmployeeLoginPage onSuccess={() => navigate('/employee/dashboard')} />;
    }

    return (
      <div className="min-h-screen bg-slate-900 p-3 sm:p-4 flex flex-col items-center justify-center">
        <EmployeeMobileApp />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. ROOT & DEFAULT REDIRECT (/)
  // -------------------------------------------------------------
  if (adminUser) {
    navigate('/admin/dashboard');
    return null;
  }
  if (employeeUser) {
    navigate('/employee/dashboard');
    return null;
  }

  // If unauthenticated, redirect to employee login by default (or admin login if requested)
  navigate('/employee/login');
  return <EmployeeLoginPage onSuccess={() => navigate('/employee/dashboard')} />;
};
