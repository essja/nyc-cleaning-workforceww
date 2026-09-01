import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Users, UserCheck, AlertTriangle, Clock,
  Building2, ArrowUpRight, CheckCircle2, XCircle,
  CalendarCheck, ShieldAlert
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { organization } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/reports/dashboard');
      setMetrics(res.metrics);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [organization?.id]);

  if (isLoading && !metrics) {
    return <div className="p-8 text-center text-slate-400">Loading live operational dashboard...</div>;
  }

  const statCards = [
    { label: 'Total Active Staff', value: metrics?.totalEmployees || 0, icon: Users, color: 'from-blue-600 to-indigo-600' },
    { label: 'Present Today', value: metrics?.presentToday || 0, icon: UserCheck, color: 'from-emerald-600 to-teal-600' },
    { label: 'Currently Clocked In', value: metrics?.currentlyWorking || 0, icon: Clock, color: 'from-cyan-600 to-blue-600' },
    { label: 'Late Arrivals', value: metrics?.lateToday || 0, icon: AlertTriangle, color: 'from-amber-600 to-orange-600' },
    { label: 'On Approved Leave', value: metrics?.onLeaveToday || 0, icon: CalendarCheck, color: 'from-purple-600 to-indigo-600' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Operations Command Center</h1>
          <p className="text-sm text-slate-400">Live multi-building staffing, real-time geofence attendance, and anomaly tracking.</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-2 self-start sm:self-auto transition"
        >
          <span>Refresh Live Status</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${card.color} flex items-center justify-center text-white shadow-md`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-white mt-2">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Buildings Staffing Utilization Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Site Staffing Status ({organization?.name})
            </h3>
            <span className="text-xs text-slate-400">Target vs Actual Headcount</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics?.buildingsSummary?.map((b: any) => (
              <div key={b.id} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white truncate">{b.name}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    b.staffingRate >= 100
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : (b.staffingRate >= 70 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30')
                  }`}>
                    {b.presentCount} / {b.scheduledCount} ({b.staffingRate}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      b.staffingRate >= 100 ? 'bg-emerald-500' : (b.staffingRate >= 70 ? 'bg-amber-500' : 'bg-red-500')
                    }`}
                    style={{ width: `${Math.min(100, b.staffingRate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Anomalies Panel */}
        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Flagged Anomalies ({metrics?.anomalies?.length || 0})
            </h3>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-64 pr-1">
            {metrics?.anomalies?.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="text-xs">Zero anomalies detected today. All employees on schedule and within geofence.</p>
              </div>
            ) : (
              metrics?.anomalies?.map((a: any) => (
                <div key={a.id} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{a.employeeName}</span>
                    <span className="text-slate-400 text-[10px]">{a.buildingName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {a.flags?.map((f: string, i: number) => (
                      <span key={i} className="text-[10px] bg-amber-500/30 text-amber-300 font-semibold px-1.5 py-0.5 rounded">
                        {f.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live Recent Attendance Activity Feed */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-4">Live Verification Stream (Last 15 Punches)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Employee</th>
                <th className="pb-3">Event Type</th>
                <th className="pb-3">Building Location</th>
                <th className="pb-3">Timestamp (UTC)</th>
                <th className="pb-3">Geofence</th>
                <th className="pb-3">Biometrics</th>
                <th className="pb-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {metrics?.recentEvents?.map((evt: any) => (
                <tr key={evt.id} className="hover:bg-slate-900/50">
                  <td className="py-3 font-semibold text-white">{evt.employeeName}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      evt.eventType === 'CHECK_IN'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : (evt.eventType === 'CHECK_OUT' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')
                    }`}>
                      {evt.eventType}
                    </span>
                  </td>
                  <td className="py-3 text-slate-300">{evt.buildingName}</td>
                  <td className="py-3 text-slate-400">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                  <td className="py-3">
                    {evt.isWithinGeofence ? (
                      <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Inside</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /> Outside</span>
                    )}
                  </td>
                  <td className="py-3">
                    {evt.biometricVerified ? (
                      <span className="text-emerald-400 font-medium">Verified</span>
                    ) : (
                      <span className="text-slate-500">PIN / Pass</span>
                    )}
                  </td>
                  <td className="py-3 text-slate-400">{evt.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
