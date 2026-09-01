import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Clock, Filter, Download, Edit3, ShieldAlert,
  CheckCircle2, XCircle, Search, Calendar
} from 'lucide-react';

export const AttendancePage: React.FC = () => {
  const { organization, user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Admin Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    regularMinutes: 480,
    overtimeMinutes: 0,
    reason: ''
  });

  const fetchTimesheets = async () => {
    try {
      const res = await api.get(
        `/reports/timesheets?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&buildingId=${selectedBuilding}`
      );
      setSessions(res.timesheet || []);
    } catch (err) {
      console.error('Failed to load timesheet:', err);
    }
  };

  const fetchBuildings = async () => {
    try {
      const res = await api.get('/buildings');
      setBuildings(res.buildings || []);
    } catch (err) {}
  };

  useEffect(() => {
    fetchTimesheets();
    fetchBuildings();
  }, [dateRange, selectedBuilding, organization?.id]);

  const handleOpenAdjustModal = (session: any) => {
    setSelectedSession(session);
    setAdjustmentForm({
      regularMinutes: session.regular_minutes,
      overtimeMinutes: session.overtime_minutes,
      reason: ''
    });
    setIsAdjustModalOpen(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    try {
      await api.post('/attendance/adjust', {
        sessionId: selectedSession.id,
        regularMinutes: Number(adjustmentForm.regularMinutes),
        overtimeMinutes: Number(adjustmentForm.overtimeMinutes),
        reason: adjustmentForm.reason
      });

      setIsAdjustModalOpen(false);
      fetchTimesheets();
    } catch (err: any) {
      alert(`Adjustment error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Attendance Timesheets & Auditing</h1>
          <p className="text-sm text-slate-400">Review verified work sessions, audit geofence flags, and make traceable administrative adjustments.</p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">From:</span>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">To:</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200"
            />
          </div>

          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200"
          >
            <option value="">All Job Sites</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timesheet Data Grid */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Date</th>
                <th className="pb-3">Employee</th>
                <th className="pb-3">Site Location</th>
                <th className="pb-3">Check In</th>
                <th className="pb-3">Check Out</th>
                <th className="pb-3">Regular Hrs</th>
                <th className="pb-3">OT Hrs</th>
                <th className="pb-3">Status</th>
                {['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role || '') && (
                  <th className="pb-3 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/50">
                  <td className="py-3 font-mono text-slate-300">{s.session_date}</td>
                  <td className="py-3 font-semibold text-white">
                    {s.first_name} {s.last_name}
                    <span className="block text-[10px] font-mono text-slate-500">{s.employee_code}</span>
                  </td>
                  <td className="py-3 text-slate-300">{s.building_name}</td>
                  <td className="py-3 font-mono text-slate-400">
                    {new Date(s.check_in_time).toLocaleTimeString()}
                  </td>
                  <td className="py-3 font-mono text-slate-400">
                    {s.check_out_time ? new Date(s.check_out_time).toLocaleTimeString() : <span className="text-emerald-400 font-bold">Active</span>}
                  </td>
                  <td className="py-3 font-bold text-slate-200">
                    {(s.regular_minutes / 60).toFixed(2)}h
                  </td>
                  <td className="py-3 font-bold text-amber-400">
                    {(s.overtime_minutes / 60).toFixed(2)}h
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      s.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : (s.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30')
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  {['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role || '') && (
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleOpenAdjustModal(s)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
                      >
                        Adjust
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Attendance Adjustment Modal */}
      {isAdjustModalOpen && selectedSession && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-400" />
              Adjust Work Session
            </h3>
            <p className="text-xs text-slate-400">
              Adjusting record for <strong>{selectedSession.first_name} {selectedSession.last_name}</strong> on {selectedSession.session_date}. Original punches remain permanently preserved in immutable audit logs.
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Regular Minutes</label>
                  <input
                    type="number"
                    step="15"
                    required
                    value={adjustmentForm.regularMinutes}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, regularMinutes: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{(adjustmentForm.regularMinutes / 60).toFixed(2)} hours</span>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Overtime Minutes</label>
                  <input
                    type="number"
                    step="15"
                    required
                    value={adjustmentForm.overtimeMinutes}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, overtimeMinutes: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{(adjustmentForm.overtimeMinutes / 60).toFixed(2)} hours</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Mandatory Audit Reason</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Employee forgot to clock out at job site; supervisor verified departure at 17:00."
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
