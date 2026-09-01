import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Shield, Search, Calendar, User, Filter,
  ChevronLeft, ChevronRight, Trash2, Download, CheckCircle2
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  const fetchAuditLogs = async () => {
    try {
      let url = `/audit?page=${page}&limit=15`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (selectedAction) url += `&action=${encodeURIComponent(selectedAction)}`;
      const res = await api.get(url);
      setLogs(res.auditLogs || []);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
      if (res.auditLogs?.length > 0 && !selectedLog) {
        setSelectedLog(res.auditLogs[0]);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, search, selectedAction, organization?.id]);

  const handlePurgeLogins = async () => {
    setIsPurging(true);
    setRetentionMessage(null);
    try {
      const res = await api.post('/audit/purge-routine-logins', { olderThanDays: retentionDays });
      setRetentionMessage(`✅ ${res.message}`);
      fetchAuditLogs();
    } catch (err: any) {
      setRetentionMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            Security & Administrative Audit Trail
          </h1>
          <p className="text-sm text-slate-400">
            Immutable legal ledger recording all administrative creations, timesheet adjustments, and logins ({totalCount} total events).
          </p>
        </div>

        {user?.role === 'OWNER' && (
          <button
            onClick={() => {
              setRetentionMessage(null);
              setIsRetentionModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition self-start sm:self-auto"
          >
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>Manage Retention & Purge</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by IP, action, entity ID, or keyword..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-4">
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Event Actions</option>
            <option value="AUTH.LOGIN">AUTH.LOGIN (Logins)</option>
            <option value="ATTENDANCE.ADJUST">ATTENDANCE.ADJUST (Time Edits)</option>
            <option value="EMPLOYEE.CREATE">EMPLOYEE.CREATE (New Cleaners)</option>
            <option value="BUILDING.CREATE">BUILDING.CREATE (New Sites)</option>
            <option value="PAYROLL.APPROVE">PAYROLL.APPROVE (Wage Approvals)</option>
            <option value="USER.INVITE">USER.INVITE (Staff Invites)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Audit Log List */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Entity</th>
                  <th className="pb-3">Timestamp (UTC)</th>
                  <th className="pb-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                      No audit events match your search query.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`cursor-pointer hover:bg-slate-900/50 transition ${
                        selectedLog?.id === log.id ? 'bg-blue-600/10 text-white' : ''
                      }`}
                    >
                      <td className="py-3 font-mono font-bold text-blue-400">{log.action}</td>
                      <td className="py-3 text-slate-300">{log.entity_type}</td>
                      <td className="py-3 text-slate-400 font-mono text-[11px]">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <span className="text-[11px] text-slate-500 underline">Inspect</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
            <span>
              Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong> ({totalCount} total logs)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Selected Log Payload Inspector */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white">Event Payload Inspector</h3>
          {selectedLog ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <p><strong>Action:</strong> <span className="font-mono text-blue-400">{selectedLog.action}</span></p>
                <p><strong>Entity ID:</strong> <span className="font-mono text-slate-400 truncate block">{selectedLog.entity_id}</span></p>
                <p><strong>IP Address:</strong> <span className="font-mono text-slate-400">{selectedLog.ip_address}</span></p>
                <p><strong>User Agent:</strong> <span className="text-slate-400 truncate block">{selectedLog.user_agent}</span></p>
                <p><strong>Recorded At:</strong> <span className="font-mono text-slate-400">{selectedLog.created_at}</span></p>
              </div>

              {selectedLog.before_state && (
                <div>
                  <span className="text-slate-400 font-semibold mb-1 block">Before State Snapshot</span>
                  <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-300 overflow-x-auto font-mono max-h-40">
                    {JSON.stringify(JSON.parse(selectedLog.before_state), null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.after_state && (
                <div>
                  <span className="text-slate-400 font-semibold mb-1 block">After State Snapshot</span>
                  <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-emerald-300 overflow-x-auto font-mono max-h-40">
                    {JSON.stringify(JSON.parse(selectedLog.after_state), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              Select an audit record to inspect immutable JSON before/after snapshots.
            </div>
          )}
        </div>
      </div>

      {/* Retention Management Modal */}
      {isRetentionModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-amber-400" />
              Manage Long-Term Data Retention
            </h3>

            <p className="text-xs text-slate-400">
              Timesheet edits, wage adjustments, and payroll approvals are permanently protected by labor law. You can safely purge routine login ping events to keep database performance lightning fast over years of usage.
            </p>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">Purge routine login records older than:</label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
              >
                <option value={30}>30 Days (Recommended)</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
                <option value={180}>6 Months</option>
                <option value={365}>1 Year</option>
              </select>
            </div>

            {retentionMessage && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                {retentionMessage}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsRetentionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePurgeLogins}
                disabled={isPurging}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md shadow-amber-500/25 disabled:opacity-50"
              >
                {isPurging ? 'Purging...' : 'Purge Old Login Logs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
