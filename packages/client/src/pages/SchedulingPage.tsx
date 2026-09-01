import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus,
  Clock, Building2, AlertTriangle, CheckCircle2, User
} from 'lucide-react';

export const SchedulingPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [currentWeekRange, setCurrentWeekRange] = useState({ startDate: '', endDate: '' });
  const [assignments, setAssignments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    building_id: '',
    shift_date: new Date().toISOString().split('T')[0],
    start_time: '08:00',
    end_time: '16:30'
  });

  const fetchWeekRange = async () => {
    try {
      const res = await api.get('/schedules/week-range');
      setCurrentWeekRange(res);
      fetchScheduleGrid(res.startDate, res.endDate);
    } catch (err) {}
  };

  const fetchScheduleGrid = async (start: string, end: string) => {
    try {
      const res = await api.get(`/schedules/grid?startDate=${start}&endDate=${end}`);
      setAssignments(res.assignments || []);
    } catch (err) {}
  };

  const fetchLookups = async () => {
    try {
      const [empRes, bldRes, shiftRes] = await Promise.all([
        api.get('/employees'),
        api.get('/buildings'),
        api.get('/schedules/shifts')
      ]);
      setEmployees(empRes.employees || []);
      setBuildings(bldRes.buildings || []);
      setShifts(shiftRes.shifts || []);
      if (empRes.employees?.length > 0) setFormData((f) => ({ ...f, employee_id: empRes.employees[0].id }));
      if (bldRes.buildings?.length > 0) setFormData((f) => ({ ...f, building_id: bldRes.buildings[0].id }));
    } catch (err) {}
  };

  useEffect(() => {
    fetchWeekRange();
    fetchLookups();
  }, [organization?.id]);

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictWarning(null);

    const startTimeUtc = `${formData.shift_date}T${formData.start_time}:00Z`;
    const endTimeUtc = `${formData.shift_date}T${formData.end_time}:00Z`;

    try {
      // 1. Pre-check conflicts
      const conflictRes = await api.post('/schedules/check-conflict', {
        employee_id: formData.employee_id,
        building_id: formData.building_id,
        shift_date: formData.shift_date,
        start_time: startTimeUtc,
        end_time: endTimeUtc
      });

      if (conflictRes.errors?.length > 0) {
        setConflictWarning(conflictRes.errors.join('; '));
        return;
      }

      // 2. Commit assignment
      await api.post('/schedules/assignments', {
        employee_id: formData.employee_id,
        building_id: formData.building_id,
        shift_date: formData.shift_date,
        start_time: startTimeUtc,
        end_time: endTimeUtc
      });

      setIsAssignModalOpen(false);
      fetchScheduleGrid(currentWeekRange.startDate, currentWeekRange.endDate);
    } catch (err: any) {
      alert(`Scheduling error: ${err.message}`);
    }
  };

  // Generate 7 days for the active work week
  const getDaysArray = () => {
    if (!currentWeekRange.startDate) return [];
    const days = [];
    const curr = new Date(currentWeekRange.startDate);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(curr).toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return days;
  };

  const daysOfWeek = getDaysArray();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Workforce Scheduling Matrix</h1>
          <p className="text-sm text-slate-400">
            {organization?.work_week_start === 0 ? 'Sunday → Saturday' : 'Monday → Sunday'} work week model with automatic conflict prevention.
          </p>
        </div>

        {['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role || '') && (
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create Shift Assignment</span>
          </button>
        )}
      </div>

      {/* Week Navigator */}
      <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-bold text-white">
            Week of {currentWeekRange.startDate} — {currentWeekRange.endDate}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={fetchWeekRange}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold"
          >
            Current Week
          </button>
        </div>
      </div>

      {/* Schedule Calendar Matrix */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
              <th className="p-3 w-48 font-bold">Employee</th>
              {daysOfWeek.map((day, idx) => {
                const dateObj = new Date(day + 'T00:00:00Z');
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                return (
                  <th key={idx} className="p-3 font-semibold text-center border-l border-slate-800/80">
                    <span className="block text-slate-300 font-bold">{dayName}</span>
                    <span className="text-[10px] text-slate-500">{day.slice(5)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-900/40">
                <td className="p-3 font-semibold text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 font-bold text-[10px] flex items-center justify-center">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div>
                      <p className="text-xs">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[10px] font-mono text-slate-400">{emp.employee_code}</p>
                    </div>
                  </div>
                </td>

                {daysOfWeek.map((day, dIdx) => {
                  const empShifts = assignments.filter((a) => a.employee_id === emp.id && a.shift_date === day);

                  return (
                    <td key={dIdx} className="p-2 border-l border-slate-800/80 align-top">
                      {empShifts.length === 0 ? (
                        <span className="text-slate-700 text-[10px] block text-center py-2">Off</span>
                      ) : (
                        <div className="space-y-1.5">
                          {empShifts.map((s) => (
                            <div
                              key={s.id}
                              className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[10px]"
                            >
                              <span className="font-bold text-white block truncate">{s.building_name}</span>
                              <span className="text-blue-300 block">
                                {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Shift Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Create Shift Assignment</h3>

            {conflictWarning && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{conflictWarning}</span>
              </div>
            )}

            <form onSubmit={handleSaveAssignment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Employee</label>
                <select
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Job Site / Facility</label>
                <select
                  value={formData.building_id}
                  onChange={(e) => setFormData({ ...formData, building_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Shift Date</label>
                <input
                  type="date"
                  required
                  value={formData.shift_date}
                  onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
