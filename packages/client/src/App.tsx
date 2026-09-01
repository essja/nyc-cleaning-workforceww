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
import { Lock, Mail, Building2, ShieldCheck, UserCheck, ArrowRight, Eye, EyeOff, Sparkles, User, Briefcase } from 'lucide-react';

export const App: React.FC = () => {
  const { user, organization, login, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileView, setIsMobileView] = useState(false);

  // Portal selection: 'OWNER' vs 'WORKER'
  const [portalMode, setPortalMode] = useState<'OWNER' | 'WORKER'>('OWNER');

  // Login form state (Completely blank by default)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

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
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      await login(cleanEmail, cleanPassword);
    } catch (err: any) {
      setLoginError(err.message || 'Invalid email or password');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // If unauthenticated: Render Portal Screen with Owner vs Cleaner selection
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 text-slate-100">
        <div className="max-w-md w-full space-y-5">
          {/* Logo & Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-2xl mx-auto shadow-xl shadow-blue-500/25">
              NYC
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">NYC Cleaning & Maintenance</h1>
            <p className="text-xs text-slate-400">Enterprise Workforce Management, Scheduling & Biometric Attendance</p>
          </div>

          {/* Portal Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setPortalMode('OWNER');
                setLoginError(null);
              }}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                portalMode === 'OWNER'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Owner & Admin</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalMode('WORKER');
                setLoginError(null);
              }}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                portalMode === 'WORKER'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Staff & Cleaner</span>
            </button>
          </div>

          {/* Login Card */}
          <div className="bg-slate-950/90 backdrop-blur border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {portalMode === 'OWNER' ? (
                  <>
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    <span>Owner & Management Portal</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 text-emerald-400" />
                    <span>Staff Attendance & Mobile Portal</span>
                  </>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {portalMode === 'OWNER'
                  ? 'Sign in to access live operations, employee roster, reports & settings.'
                  : 'Sign in to clock in/out, view your work schedule, and submit time off.'}
              </p>
            </div>

            {loginError && (
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  {portalMode === 'OWNER' ? 'Owner Email Address' : 'Staff Login Email'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder={portalMode === 'OWNER' ? 'admin@nyccleaning.com' : 'cleaner@nyccleaning.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3 py-3 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-semibold">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPassword ? 'Hide Password' : 'Show Password'}</span>
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="current-password"
                    spellCheck={false}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className={`w-full py-3.5 text-white font-bold rounded-xl shadow-lg transition disabled:opacity-50 mt-2 text-sm flex items-center justify-center gap-2 ${
                  portalMode === 'OWNER'
                    ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-500/25'
                    : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-emerald-500/25'
                }`}
              >
                {isLoggingIn
                  ? 'Authenticating...'
                  : portalMode === 'OWNER'
                    ? 'Sign In to Management Workspace'
                    : 'Sign In to Cleaner App'}
              </button>
            </form>
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
