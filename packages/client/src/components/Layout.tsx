import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Building2, Users, Calendar, Clock, DollarSign,
  CalendarCheck, Cpu, Brain, Shield, LogOut,
  LayoutDashboard, RefreshCw, Wifi, WifiOff,
  ChevronDown, Menu, X, Bell
} from 'lucide-react';
import { api } from '../api/client.js';

interface LayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  currentTab,
  setCurrentTab,
  children
}) => {
  const { adminUser, adminOrg, availableOrganizations, logoutAdmin, isOnline, offlineQueueCount, refreshOfflineCount } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await api.syncOfflinePunches();
    refreshOfflineCount();
    setIsSyncing(false);
  };

  const navItems = [
    { id: 'dashboard', label: 'Management Dashboard', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR'] },
    { id: 'buildings', label: 'Buildings & Map', icon: Building2, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR'] },
    { id: 'employees', label: 'Employees & Roster', icon: Users, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'] },
    { id: 'scheduling', label: 'Sunday–Saturday Schedule', icon: Calendar, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR'] },
    { id: 'attendance', label: 'Live Attendance', icon: Clock, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'SUPERVISOR'] },
    { id: 'payroll', label: 'Deterministic Payroll', icon: DollarSign, roles: ['OWNER', 'ADMIN', 'HR_MANAGER'] },
    { id: 'leave', label: 'Leave Management', icon: CalendarCheck, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'] },
    { id: 'devices', label: 'Biometric Terminals', icon: Cpu, roles: ['OWNER', 'ADMIN'] },
    { id: 'intelligence', label: 'Workforce Intelligence', icon: Brain, roles: ['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'] },
    { id: 'audit', label: 'Security & Audit Logs', icon: Shield, roles: ['OWNER', 'ADMIN'] },
  ];

  const allowedNav = navItems.filter((item) => adminUser && item.roles.includes(adminUser.role));

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      {/* Top Global Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20">
              NYC
            </div>
            <div>
              <span className="font-bold tracking-tight text-white flex items-center gap-2">
                NYC Cleaning & Maintenance <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Owner Portal</span>
              </span>
              <span className="text-xs text-slate-400 block -mt-0.5">Operations & Workforce Management</span>
            </div>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-3">
          {/* Online/Offline Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ONLINE</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <WifiOff className="w-3.5 h-3.5" />
                <span>OFFLINE MODE</span>
              </span>
            )}

            {offlineQueueCount > 0 && (
              <button
                onClick={handleManualSync}
                disabled={!isOnline || isSyncing}
                className="flex items-center gap-1 text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 hover:bg-amber-500/30 transition"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{offlineQueueCount} queued</span>
              </button>
            )}
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white">{adminUser?.firstName} {adminUser?.lastName}</p>
              <p className="text-[10px] text-blue-400 font-mono font-bold uppercase tracking-wider">{adminUser?.role}</p>
            </div>
            <button
              onClick={logoutAdmin}
              title="Sign Out of Admin Portal"
              className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`w-72 lg:w-64 border-r border-slate-800 bg-slate-950 p-4 flex flex-col justify-between shrink-0 transition-transform duration-200 fixed lg:static top-0 bottom-0 left-0 z-50 lg:z-auto shadow-2xl lg:shadow-none ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800/80 mb-2 lg:border-none lg:mb-0">
              <span className="truncate">{adminOrg?.name || 'NYC Cleaning & Maintenance'}</span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 lg:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {allowedNav.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-400">Work-Week Policy</p>
            <p className="text-slate-500">Sunday → Saturday Pay Cycle</p>
            <p className="pt-2 text-[10px] text-slate-600">Enterprise Admin Portal v2.0</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-900 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
