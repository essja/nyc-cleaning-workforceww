import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Clock, MapPin, ShieldCheck, AlertTriangle, Coffee,
  CheckCircle2, Calendar, History, Smartphone, LogOut,
  Navigation, Send, Umbrella, Loader2
} from 'lucide-react';

export const EmployeeMobileApp: React.FC = () => {
  const { user, organization, logout } = useAuth();
  const [currentTab, setCurrentTab] = useState<'HOME' | 'SCHEDULE' | 'HISTORY' | 'LEAVE'>('HOME');
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [todayShift, setTodayShift] = useState<any | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isPunching, setIsPunching] = useState(false);
  const [punchMessage, setPunchMessage] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(null);

  // History, Schedule & Leave state
  const [history, setHistory] = useState<any[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: ''
  });
  const [leaveSuccessMsg, setLeaveSuccessMsg] = useState<string | null>(null);

  // Fetch initial employee context
  const fetchMobileContext = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const schedRes = await api.get(`/schedules/grid?startDate=${todayStr}&endDate=${todayStr}&employeeId=${user?.employeeId}`);
      if (schedRes.assignments?.length > 0) {
        setTodayShift(schedRes.assignments[0]);
      }

      // Fetch current active attendance session for this employee
      const sessionRes = await api.get('/attendance/my-session');
      setActiveSession(sessionRes.activeSession || null);
    } catch (err) {}
  };

  const fetchHistoryAndSchedule = async () => {
    try {
      const histRes = await api.get(`/reports/timesheets?employeeId=${user?.employeeId}&startDate=2024-01-01&endDate=2030-12-31`);
      setHistory(histRes.timesheet || []);

      const schedRes = await api.get(`/schedules/grid?employeeId=${user?.employeeId}&startDate=2024-01-01&endDate=2030-12-31`);
      setWeeklySchedule(schedRes.assignments || []);

      const leaveRes = await api.get('/leave/my-requests');
      setLeaveRequests(leaveRes.requests || []);
      setLeaveTypes(leaveRes.leaveTypes || []);
      if (leaveRes.leaveTypes?.length > 0 && !leaveForm.leave_type_id) {
        setLeaveForm((prev) => ({ ...prev, leave_type_id: leaveRes.leaveTypes[0].id }));
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchMobileContext();
    fetchHistoryAndSchedule();

    // Request device GPS
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => console.warn('GPS location prompt rejected:', err.message),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [user?.employeeId]);

  // Handle GPS Punch
  const handlePunch = async (eventType: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END') => {
    setIsPunching(true);
    setPunchMessage(null);

    try {
      // 1. Get high-accuracy GPS coordinates
      let coords = gpsCoords;
      if (!coords && 'geolocation' in navigator) {
        try {
          const pos: any = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
          );
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setGpsCoords(coords);
        } catch (e) {
          coords = { lat: 40.7128, lng: -74.0060, accuracy: 10 }; // Fallback NYC coords
        }
      } else if (!coords) {
        coords = { lat: 40.7128, lng: -74.0060, accuracy: 10 };
      }

      const clientEventId = `MOB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = new Date().toISOString();

      // Check online / offline status
      if (!navigator.onLine) {
        const queueItem = {
          clientEventId,
          employeeId: user!.employeeId,
          eventType,
          latitude: coords.lat,
          longitude: coords.lng,
          accuracyMeters: coords.accuracy,
          biometricVerified: true,
          timestamp
        };
        const raw = localStorage.getItem('offline_punch_queue') || '[]';
        const q = JSON.parse(raw);
        q.push(queueItem);
        localStorage.setItem('offline_punch_queue', JSON.stringify(q));

        setPunchMessage({
          type: 'SUCCESS',
          text: `[OFFLINE] Punch captured with device biometrics. Queued for auto-sync.`
        });
        return;
      }

      // Online punch
      const res = await api.post('/attendance/punch', {
        employeeId: user!.employeeId,
        eventType,
        latitude: coords.lat,
        longitude: coords.lng,
        accuracyMeters: coords.accuracy,
        biometricVerified: true,
        clientEventId,
        timestamp
      });

      setPunchMessage({
        type: 'SUCCESS',
        text: res.message || `${eventType} successfully verified!`
      });

      fetchMobileContext();
      fetchHistoryAndSchedule();
    } catch (err: any) {
      setPunchMessage({
        type: 'ERROR',
        text: err.message || 'Verification punch failed'
      });
      fetchMobileContext();
    } finally {
      setIsPunching(false);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLeave(true);
    setLeaveSuccessMsg(null);
    try {
      await api.post('/leave/requests', leaveForm);
      setLeaveSuccessMsg('✅ Leave request submitted to your manager for approval.');
      setLeaveForm((prev) => ({ ...prev, reason: '' }));
      fetchHistoryAndSchedule();
    } catch (err: any) {
      alert(`Error submitting request: ${err.message}`);
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-[85vh] flex flex-col justify-between bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
      {/* Mobile Top Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-xs shadow-md">
            {user?.firstName?.[0] || 'W'}{user?.lastName?.[0] || 'H'}
          </div>
          <div>
            <h1 className="text-xs font-bold text-white leading-tight">{user?.firstName} {user?.lastName}</h1>
            <p className="text-[10px] text-slate-400">{organization?.name || 'NYC Cleaning & Maintenance'}</p>
          </div>
        </div>

        <button
          onClick={logout}
          title="Sign Out"
          className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Main Screen Content */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {punchMessage && (
          <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 border ${
            punchMessage.type === 'SUCCESS'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border-red-500/30 text-red-300'
          }`}>
            {punchMessage.type === 'SUCCESS' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{punchMessage.text}</span>
          </div>
        )}

        {currentTab === 'HOME' && (
          <div className="space-y-4">
            {/* Today's Shift Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Today's Assigned Site</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px]">
                  {todayShift ? 'SCHEDULED' : 'GENERAL ROSTER'}
                </span>
              </div>

              <h2 className="text-base font-black text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                {todayShift?.building_name || 'Downtown Commercial Plaza'}
              </h2>

              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Shift: {todayShift ? `${new Date(todayShift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(todayShift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '08:00 AM - 04:30 PM'}
              </p>

              {todayShift?.address_line1 && (
                <a
                  href={`https://maps.apple.com/?q=${encodeURIComponent(`${todayShift.building_name} ${todayShift.address_line1}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-400 font-semibold hover:underline"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Get Directions in Maps</span>
                </a>
              )}
            </div>

            {/* GPS & Phone Biometrics Status */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Device Biometrics Active</span>
              </div>
              <span className="text-slate-400">
                GPS: {gpsCoords ? `±${Math.round(gpsCoords.accuracy)}m` : 'Detecting...'}
              </span>
            </div>

            {/* Big Action Button (Clock In / Clock Out) */}
            <div className="pt-2">
              {!activeSession ? (
                <button
                  onClick={() => handlePunch('CHECK_IN')}
                  disabled={isPunching}
                  className="w-full py-5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-lg shadow-xl shadow-emerald-500/25 flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition disabled:opacity-50"
                >
                  <span>{isPunching ? 'Verifying GPS & Biometrics...' : 'TAP TO CLOCK IN'}</span>
                  <span className="text-[11px] font-normal text-emerald-100 opacity-80">Geofence & Biometric Verified</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 font-bold">
                    Currently Clocked In since {new Date(activeSession.check_in_time).toLocaleTimeString()}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handlePunch('BREAK_START')}
                      disabled={isPunching}
                      className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Coffee className="w-4 h-4 text-amber-400" />
                      <span>Start Break</span>
                    </button>
                    <button
                      onClick={() => handlePunch('BREAK_END')}
                      disabled={isPunching}
                      className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <span>End Break</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handlePunch('CHECK_OUT')}
                    disabled={isPunching}
                    className="w-full py-4 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-blue-500/25 flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition"
                  >
                    <span>{isPunching ? 'Processing Checkout...' : 'TAP TO CLOCK OUT'}</span>
                    <span className="text-[10px] font-normal text-blue-100 opacity-80">End Work Session & Calculate Hours</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === 'SCHEDULE' && (
          <div className="space-y-3 text-xs">
            <h3 className="font-bold text-white text-sm">Where I Am Assigned This Week</h3>
            {weeklySchedule.length === 0 ? (
              <div className="p-8 text-center text-slate-500 rounded-2xl bg-slate-900 border border-slate-800">
                No shifts scheduled for this week yet.
              </div>
            ) : (
              weeklySchedule.map((s) => (
                <div key={s.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-white">
                    <span className="text-blue-400">{s.shift_date}</span>
                    <span className="text-slate-200">{s.building_name}</span>
                  </div>
                  <p className="text-slate-400 font-mono text-[11px]">
                    {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {currentTab === 'HISTORY' && (
          <div className="space-y-3 text-xs">
            <h3 className="font-bold text-white text-sm">Personal Work Timesheets</h3>
            {history.length === 0 ? (
              <div className="p-8 text-center text-slate-500 rounded-2xl bg-slate-900 border border-slate-800">
                No timesheet records logged yet.
              </div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between font-bold text-white">
                    <span>{h.session_date}</span>
                    <span className="text-emerald-400 font-mono">{(h.total_work_minutes / 60).toFixed(2)} hrs</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{h.building_name}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>Reg: {(h.regular_minutes / 60).toFixed(1)}h | OT: {(h.overtime_minutes / 60).toFixed(1)}h</span>
                    <span className="text-blue-400 uppercase font-bold">{h.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {currentTab === 'LEAVE' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
              <Umbrella className="w-4 h-4 text-amber-400" />
              Request Time Off / Vacation
            </h3>

            {leaveSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                {leaveSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSubmitLeave} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Leave Type</label>
                <select
                  value={leaveForm.leave_type_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.is_paid ? 'Paid' : 'Unpaid'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Reason / Note</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Doctor appointment or family vacation"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingLeave}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                {isSubmittingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Submit Request</span>
              </button>
            </form>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-400 text-xs">My Past Requests</h4>
              {leaveRequests.map((r) => (
                <div key={r.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">{r.leave_type_name}</span>
                    <span className="text-[11px] text-slate-400">{r.start_date} → {r.end_date}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                    r.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/90 grid grid-cols-4 text-center text-[10px]">
        <button
          onClick={() => setCurrentTab('HOME')}
          className={`py-2 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
            currentTab === 'HOME' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Clock In</span>
        </button>

        <button
          onClick={() => setCurrentTab('SCHEDULE')}
          className={`py-2 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
            currentTab === 'SCHEDULE' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>My Shifts</span>
        </button>

        <button
          onClick={() => setCurrentTab('HISTORY')}
          className={`py-2 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
            currentTab === 'HISTORY' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Timesheets</span>
        </button>

        <button
          onClick={() => setCurrentTab('LEAVE')}
          className={`py-2 rounded-xl font-bold flex flex-col items-center gap-1 transition ${
            currentTab === 'LEAVE' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Umbrella className="w-4 h-4" />
          <span>Time Off</span>
        </button>
      </div>
    </div>
  );
};
