import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Users, UserCheck, AlertTriangle, Clock,
  Building2, CheckCircle2, XCircle,
  CalendarCheck, ShieldAlert, ArrowUpRight,
  X, MapPin, Timer, UserX, ThumbsUp, ThumbsDown,
  Loader2, ClipboardList, Fingerprint
} from 'lucide-react';

type DrilldownType = 'staff' | 'present' | 'clockin' | 'late' | 'leave' | null;

export const DashboardPage: React.FC = () => {
  const { organization } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);

  // Clock-in quick punch state
  const [employees, setEmployees] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [clockinEmployeeId, setClockinEmployeeId] = useState('');
  const [clockinBuildingId, setClockinBuildingId] = useState('');
  const [clockinLoading, setClockinLoading] = useState(false);
  const [clockinResult, setClockinResult] = useState<any>(null);

  // Leave approval state
  const [approvingId, setApprovingId] = useState<string | null>(null);

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

  const fetchQuickData = async () => {
    try {
      const [empRes, bldRes] = await Promise.all([
        api.get('/employees?status=ACTIVE'),
        api.get('/buildings')
      ]);
      setEmployees(empRes.employees || []);
      setBuildings(bldRes.buildings || []);
    } catch (err) {}
  };

  useEffect(() => {
    fetchDashboard();
    fetchQuickData();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [organization?.id]);

  const openDrilldown = (type: DrilldownType) => {
    setDrilldown(type);
    setClockinResult(null);
  };

  const closeDrilldown = () => {
    setDrilldown(null);
    setClockinResult(null);
    setClockinEmployeeId('');
    setClockinBuildingId('');
  };

  const handleQuickClockIn = async () => {
    if (!clockinEmployeeId || !clockinBuildingId) return;
    setClockinLoading(true);
    try {
      const result = await api.post('/attendance/punch', {
        employeeId: clockinEmployeeId,
        buildingId: clockinBuildingId,
        eventType: 'CHECK_IN',
        biometricVerified: false
      });
      setClockinResult({ success: true, session: result });
      fetchDashboard();
    } catch (err: any) {
      setClockinResult({ success: false, error: err.message });
    } finally {
      setClockinLoading(false);
    }
  };

  const handleLeaveDecision = async (leaveId: string, decision: 'APPROVED' | 'REJECTED') => {
    setApprovingId(leaveId);
    try {
      await api.post(`/leave/requests/${leaveId}/review`, { decision });
      fetchDashboard();
    } catch (err: any) {
      alert(`Failed to ${decision.toLowerCase()} request: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  if (isLoading && !metrics) {
    return (
      <div className="p-8 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span>Loading live operations dashboard...</span>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Active Staff',
      value: metrics?.totalEmployees || 0,
      icon: Users,
      color: 'from-blue-600 to-indigo-600',
      drilldownType: 'staff' as DrilldownType,
      hint: 'Click to view full staff roster'
    },
    {
      label: 'Present Today',
      value: metrics?.presentToday || 0,
      icon: UserCheck,
      color: 'from-emerald-600 to-teal-600',
      drilldownType: 'present' as DrilldownType,
      hint: 'Click to see who is on site'
    },
    {
      label: 'Clocked In Now',
      value: metrics?.currentlyWorking || 0,
      icon: Clock,
      color: 'from-cyan-600 to-blue-600',
      drilldownType: 'clockin' as DrilldownType,
      hint: 'Click to punch in a staff member'
    },
    {
      label: 'Late Arrivals',
      value: metrics?.lateToday || 0,
      icon: AlertTriangle,
      color: 'from-amber-600 to-orange-600',
      drilldownType: 'late' as DrilldownType,
      hint: 'Click to review late clock-ins'
    },
    {
      label: 'Pending Leave',
      value: metrics?.pendingLeaveList?.length || 0,
      icon: CalendarCheck,
      color: 'from-purple-600 to-indigo-600',
      drilldownType: 'leave' as DrilldownType,
      hint: 'Click to approve or reject requests'
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Operations Command Center</h1>
          <p className="text-sm text-slate-400">Live multi-building staffing, real-time attendance tracking, and instant approvals.</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-2 self-start sm:self-auto transition"
        >
          <span>↻ Refresh Live Status</span>
        </button>
      </div>

      {/* Clickable Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button
              key={i}
              onClick={() => openDrilldown(card.drilldownType)}
              className="group p-4 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm relative overflow-hidden text-left hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer"
              title={card.hint}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300 transition">{card.label}</span>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${card.color} flex items-center justify-center text-white shadow-md`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-white mt-2">{card.value}</p>
              <span className="text-[10px] text-slate-600 group-hover:text-blue-400 flex items-center gap-0.5 mt-0.5 transition">
                <ArrowUpRight className="w-3 h-3" /> {card.hint}
              </span>
            </button>
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
            {metrics?.buildingsSummary?.length === 0 ? (
              <div className="col-span-2 text-center text-xs text-slate-500 py-6">No buildings configured yet. Add buildings in the Buildings & Sites page.</div>
            ) : metrics?.buildingsSummary?.map((b: any) => (
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
            {metrics?.anomalies?.length === 0 || !metrics?.anomalies ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="text-xs">Zero anomalies detected today.</p>
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
                        {f.replace(/_/g, ' ')}
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
        <h3 className="text-sm font-bold text-white mb-4">Live Verification Stream (Last 10 Punches)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Employee</th>
                <th className="pb-3">Event Type</th>
                <th className="pb-3">Building</th>
                <th className="pb-3">Time</th>
                <th className="pb-3">Geofence</th>
                <th className="pb-3">Biometrics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(!metrics?.recentEvents || metrics.recentEvents.length === 0) ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">No attendance events recorded yet today.</td>
                </tr>
              ) : (
                metrics?.recentEvents?.map((evt: any) => (
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
                        <span className="flex items-center gap-1 text-slate-500"><XCircle className="w-3.5 h-3.5" /> Outside</span>
                      )}
                    </td>
                    <td className="py-3">
                      {evt.biometricVerified ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Verified</span>
                      ) : (
                        <span className="text-slate-500">PIN</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======= DRILLDOWN MODALS ======= */}

      {drilldown && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeDrilldown(); }}
        >
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-3xl w-full shadow-2xl max-h-[88vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">
                {drilldown === 'staff' && '👥 Complete Staff Roster'}
                {drilldown === 'present' && '✅ Staff Present On Site Today'}
                {drilldown === 'clockin' && '⏱ Quick Clock-In — Record Attendance'}
                {drilldown === 'late' && '⚠️ Late Arrivals Today'}
                {drilldown === 'leave' && '🏖 Pending Leave Approval Requests'}
              </h2>
              <button
                onClick={closeDrilldown}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 text-xs space-y-4">
              {/* ---- Total Staff Roster ---- */}
              {drilldown === 'staff' && (
                <>
                  {employees.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                      No active cleaning staff found. Go to <strong>Employees</strong> and click <strong>+ Add Employee</strong> to add your first cleaner.
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="pb-3">Code</th>
                          <th className="pb-3">Name</th>
                          <th className="pb-3">Email</th>
                          <th className="pb-3">Phone</th>
                          <th className="pb-3">Facility</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {employees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-900/50">
                            <td className="py-3 font-mono font-bold text-blue-400">{emp.employee_code}</td>
                            <td className="py-3 font-semibold text-white">{emp.first_name} {emp.last_name}</td>
                            <td className="py-3 text-slate-400">{emp.email || '—'}</td>
                            <td className="py-3 text-slate-400">{emp.phone || '—'}</td>
                            <td className="py-3 text-slate-300">{emp.primary_building_name || 'Unassigned'}</td>
                            <td className="py-3">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                emp.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                              }`}>{emp.status}</span>
                            </td>
                            <td className="py-3 text-emerald-400 font-mono">${(emp.current_pay_rate || 20).toFixed(2)}/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="text-slate-500 text-center text-[11px]">
                    To edit, reset passwords, or view attendance — go to the <strong>Employees</strong> page and click any cleaner's name.
                  </p>
                </>
              )}

              {/* ---- Present Today ---- */}
              {drilldown === 'present' && (
                <>
                  {(!metrics?.presentStaffList || metrics.presentStaffList.length === 0) ? (
                    <div className="text-center py-10 text-slate-500">
                      <UserX className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                      <p>No staff have clocked in yet today.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="pb-3">Name</th>
                          <th className="pb-3">Code</th>
                          <th className="pb-3">Facility</th>
                          <th className="pb-3">Clock In</th>
                          <th className="pb-3">Clock Out</th>
                          <th className="pb-3">GPS</th>
                          <th className="pb-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {metrics.presentStaffList.map((s: any) => (
                          <tr key={s.sessionId} className="hover:bg-slate-900/50">
                            <td className="py-3 font-semibold text-white">{s.employeeName}</td>
                            <td className="py-3 font-mono text-blue-400">{s.employeeCode}</td>
                            <td className="py-3 text-slate-300">{s.buildingName}</td>
                            <td className="py-3 text-emerald-400 font-mono">
                              {s.checkInTime ? new Date(s.checkInTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                            </td>
                            <td className="py-3 text-slate-400 font-mono">
                              {s.checkOutTime ? new Date(s.checkOutTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <span className="text-blue-400">Still working</span>}
                            </td>
                            <td className="py-3">
                              {s.isWithinGeofence
                                ? <span className="text-emerald-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> In Zone</span>
                                : <span className="text-slate-500">Outside</span>
                              }
                            </td>
                            <td className="py-3">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                s.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'
                              }`}>{s.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* ---- Quick Clock-In ---- */}
              {drilldown === 'clockin' && (
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-slate-400">Select a cleaner and their assigned facility, then punch them in. This records attendance directly to the database.</p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Select Cleaner</label>
                      <select
                        value={clockinEmployeeId}
                        onChange={(e) => setClockinEmployeeId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100"
                      >
                        <option value="">— Choose a staff member —</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name} ({emp.employee_code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Assigned Facility / Building</label>
                      <select
                        value={clockinBuildingId}
                        onChange={(e) => setClockinBuildingId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100"
                      >
                        <option value="">— Choose building —</option>
                        {buildings.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleQuickClockIn}
                      disabled={!clockinEmployeeId || !clockinBuildingId || clockinLoading}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                    >
                      {clockinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
                      <span>{clockinLoading ? 'Recording Punch...' : 'Record Clock-In Now'}</span>
                    </button>
                  </div>

                  {clockinResult && (
                    <div className={`p-4 rounded-2xl border text-center space-y-1 ${
                      clockinResult.success
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/15 border-red-500/30 text-red-300'
                    }`}>
                      <p className="font-bold">{clockinResult.success ? '✅ Clock-In Successfully Recorded!' : '❌ Clock-In Failed'}</p>
                      {clockinResult.error && <p className="text-[11px]">{clockinResult.error}</p>}
                      {clockinResult.success && <p className="text-[11px]">Session saved to database. Dashboard will auto-refresh.</p>}
                    </div>
                  )}
                </div>
              )}

              {/* ---- Late Arrivals ---- */}
              {drilldown === 'late' && (
                <>
                  {(!metrics?.lateArrivalsList || metrics.lateArrivalsList.length === 0) ? (
                    <div className="text-center py-10 text-slate-500">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-600" />
                      <p>No late arrivals today! All cleaners arrived on time.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="pb-3">Cleaner</th>
                          <th className="pb-3">Code</th>
                          <th className="pb-3">Facility</th>
                          <th className="pb-3">Scheduled Start</th>
                          <th className="pb-3">Actual Clock-In</th>
                          <th className="pb-3">Minutes Late</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {metrics.lateArrivalsList.map((l: any) => (
                          <tr key={l.sessionId} className="hover:bg-slate-900/50">
                            <td className="py-3 font-semibold text-white">{l.employeeName}</td>
                            <td className="py-3 font-mono text-blue-400">{l.employeeCode}</td>
                            <td className="py-3 text-slate-300">{l.buildingName}</td>
                            <td className="py-3 text-slate-400">{l.scheduledStart}</td>
                            <td className="py-3 text-amber-400 font-mono">
                              {l.checkInTime ? new Date(l.checkInTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                            </td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/20">
                                +{l.minutesLate} min
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* ---- Leave Approval ---- */}
              {drilldown === 'leave' && (
                <>
                  {(!metrics?.pendingLeaveList || metrics.pendingLeaveList.length === 0) ? (
                    <div className="text-center py-10 text-slate-500">
                      <CalendarCheck className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                      <p>No pending leave requests. All caught up!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {metrics.pendingLeaveList.map((req: any) => (
                        <div key={req.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{req.employeeName}</span>
                              <span className="font-mono text-blue-400 text-[10px]">{req.employeeCode}</span>
                            </div>
                            <span className="text-slate-300 font-semibold">{req.leaveTypeName} — {req.days} day{req.days !== 1 ? 's' : ''}</span>
                            <span className="block text-slate-500">{req.startDate} → {req.endDate}</span>
                            {req.reason && <span className="block text-slate-400 italic text-[11px]">"{req.reason}"</span>}
                          </div>

                          <div className="flex items-center gap-2 sm:flex-shrink-0">
                            <button
                              onClick={() => handleLeaveDecision(req.id, 'APPROVED')}
                              disabled={approvingId === req.id}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition text-[11px] shadow-sm shadow-emerald-500/20 disabled:opacity-50"
                            >
                              {approvingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleLeaveDecision(req.id, 'REJECTED')}
                              disabled={approvingId === req.id}
                              className="px-3 py-2 bg-slate-800 hover:bg-red-600/30 text-red-400 font-bold rounded-xl flex items-center gap-1.5 transition text-[11px] border border-slate-700 disabled:opacity-50"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
