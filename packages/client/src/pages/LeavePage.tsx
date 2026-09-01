import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { CalendarCheck, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';

export const LeavePage: React.FC = () => {
  const { organization, user } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    leaveTypeId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const fetchLeaveData = async () => {
    try {
      const [reqRes, typeRes] = await Promise.all([
        api.get('/leave/requests'),
        api.get('/leave/types')
      ]);
      setLeaveRequests(reqRes.leaveRequests || []);
      setLeaveTypes(typeRes.leaveTypes || []);
      if (typeRes.leaveTypes?.length > 0) {
        setRequestForm((f) => ({ ...f, leaveTypeId: typeRes.leaveTypes[0].id }));
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchLeaveData();
  }, [organization?.id]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/leave/requests', requestForm);
      setIsRequestModalOpen(false);
      fetchLeaveData();
    } catch (err: any) {
      alert(`Leave request error: ${err.message}`);
    }
  };

  const handleReview = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await api.post(`/leave/requests/${id}/review`, { decision });
      fetchLeaveData();
    } catch (err: any) {
      alert(`Review error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Leave & Absence Management</h1>
          <p className="text-sm text-slate-400">Manage paid time off, sick leave policies, and schedule conflict alerts.</p>
        </div>
        <button
          onClick={() => setIsRequestModalOpen(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Request Leave</span>
        </button>
      </div>

      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Employee</th>
                <th className="pb-3">Leave Type</th>
                <th className="pb-3">Dates</th>
                <th className="pb-3">Reason</th>
                <th className="pb-3">Status</th>
                {['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role || '') && (
                  <th className="pb-3 text-right">Review</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {leaveRequests.map((lr) => (
                <tr key={lr.id} className="hover:bg-slate-900/50">
                  <td className="py-3 font-semibold text-white">
                    {lr.first_name} {lr.last_name}
                    <span className="block text-[10px] font-mono text-slate-500">{lr.employee_code}</span>
                  </td>
                  <td className="py-3 text-slate-300">{lr.leave_type_name}</td>
                  <td className="py-3 font-mono text-slate-400">{lr.start_date} → {lr.end_date}</td>
                  <td className="py-3 text-slate-400 max-w-xs truncate">{lr.reason || 'None stated'}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      lr.status === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : (lr.status === 'REJECTED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30')
                    }`}>
                      {lr.status}
                    </span>
                  </td>
                  {['OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role || '') && lr.status === 'PENDING' && (
                    <td className="py-3 text-right space-x-1">
                      <button
                        onClick={() => handleReview(lr.id, 'APPROVED')}
                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-semibold border border-emerald-500/30 transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(lr.id, 'REJECTED')}
                        className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-lg text-[11px] font-semibold border border-red-500/30 transition"
                      >
                        Reject
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Submit Leave Request</h3>
            <form onSubmit={handleCreateRequest} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Leave Type</label>
                <select
                  value={requestForm.leaveTypeId}
                  onChange={(e) => setRequestForm({ ...requestForm, leaveTypeId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={requestForm.startDate}
                    onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={requestForm.endDate}
                    onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Reason (Optional)</label>
                <textarea
                  rows={2}
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
