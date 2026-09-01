import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.js';
import { Layout } from './components/Layout.js';
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
import { Lock, Mail, Building2, ShieldCheck, UserCheck, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  const { user, organization, login, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileView, setIsMobileView] = useState(false);

  // Login form state
  const [email, setEmail] = useState('admin@nyccleaning.com');
  const [password, setPassword] = useState('Password123!');
  const [orgSlug, setOrgSlug] = useState('nyc-cleaning-and-maintenance');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Initializing Enterprise Platform...
      </div>
    );
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await login(email, password, orgSlug);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // If unauthenticated: Render Enterprise Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 text-slate-100">
        <div className="max-w-md w-full space-y-6">
          {/* Logo & Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-xl mx-auto shadow-xl shadow-blue-500/25">
              NYC
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">NYC Cleaning & Maintenance</h1>
            <p className="text-xs text-slate-400">Enterprise Workforce Management, Scheduling & Biometric Attendance</p>
          </div>

          {/* Login Card */}
          <div className="bg-slate-950/80 backdrop-blur border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            {loginError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@nyccleaning.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-slate-100 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-12 py-2.5 text-slate-100 focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 text-[10px] font-bold transition"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {showPassword && password && (
                  <p className="mt-1 text-[11px] font-mono text-blue-300 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20">
                    🔑 {password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition disabled:opacity-50 mt-3"
              >
                {isLoggingIn ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </form>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-slate-500">
                Powered by Enterprise Workforce Hub • Sunday–Saturday Pay Model
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If user role is EMPLOYEE or user explicitly toggled mobile view
  if (isMobileView || user.role === 'EMPLOYEE') {
    return (
      <div className="min-h-screen bg-slate-900 p-4 flex flex-col items-center justify-center">
        {user.role !== 'EMPLOYEE' && (
          <button
            onClick={() => setIsMobileView(false)}
            className="mb-4 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 self-center"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Return to Admin Web Dashboard</span>
          </button>
        )}
        <EmployeeMobileApp />
      </div>
    );
  }

  // Otherwise render Management Web Layout
  return (
    <Layout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      isMobileView={isMobileView}
      setIsMobileView={setIsMobileView}
    >
      {currentTab === 'dashboard' && <DashboardPage />}
      {currentTab === 'buildings' && <BuildingsPage />}
      {currentTab === 'employees' && <EmployeesPage />}
      {currentTab === 'scheduling' && <SchedulingPage />}
      {currentTab === 'attendance' && <AttendancePage />}
      {currentTab === 'payroll' && <PayrollPage />}
      {currentTab === 'leave' && <LeavePage />}
      {currentTab === 'devices' && <DevicesPage />}
      {currentTab === 'intelligence' && <IntelligencePage />}
      {currentTab === 'audit' && <AuditPage />}
    </Layout>
  );
};
