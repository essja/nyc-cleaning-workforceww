import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  DollarSign, Calculator, CheckCircle2, Download,
  Settings, Plus, FileSpreadsheet, Lock
} from 'lucide-react';

export const PayrollPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any | null>(null);
  const [periodDetails, setPeriodDetails] = useState<any | null>(null);
  const [rules, setRules] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  const [periodForm, setPeriodForm] = useState({
    name: 'Bi-Weekly Pay Period',
    startDate: '2026-08-01',
    endDate: '2026-08-14'
  });

  const [rulesForm, setRulesForm] = useState({
    daily_threshold_hours: 8.0,
    weekly_threshold_hours: 40.0,
    overtime_multiplier: 1.5,
    double_time_threshold_hours: 12.0,
    double_time_multiplier: 2.0
  });

  const fetchPeriods = async () => {
    try {
      const res = await api.get('/payroll/periods');
      setPeriods(res.periods || []);
      if (res.periods?.length > 0 && !selectedPeriod) {
        setSelectedPeriod(res.periods[0]);
      }
    } catch (err) {}
  };

  const fetchRules = async () => {
    try {
      const res = await api.get('/payroll/rules');
      setRules(res.rules);
      if (res.rules) setRulesForm(res.rules);
    } catch (err) {}
  };

  const fetchSelectedPeriodDetails = async (id: string) => {
    try {
      const res = await api.get(`/payroll/periods/${id}`);
      setPeriodDetails(res);
    } catch (err) {}
  };

  useEffect(() => {
    fetchPeriods();
    fetchRules();
  }, [organization?.id]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchSelectedPeriodDetails(selectedPeriod.id);
    }
  }, [selectedPeriod]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/payroll/periods', periodForm);
      setIsCreateModalOpen(false);
      fetchPeriods();
    } catch (err: any) {
      alert(`Error creating pay period: ${err.message}`);
    }
  };

  const handleCalculatePeriod = async () => {
    if (!selectedPeriod) return;
    setIsCalculating(true);
    try {
      const res = await api.post(`/payroll/periods/${selectedPeriod.id}/calculate`);
      setPeriodDetails(res);
      fetchPeriods();
    } catch (err: any) {
      alert(`Calculation error: ${err.message}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleApprovePeriod = async () => {
    if (!selectedPeriod) return;
    if (!confirm('Are you sure you want to approve this payroll period? This locks the calculation.')) return;

    try {
      const res = await api.post(`/payroll/periods/${selectedPeriod.id}/approve`);
      setPeriodDetails(res);
      fetchPeriods();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  const handleExportExcel = () => {
    if (!selectedPeriod) return;
    window.open(`/api/v1/payroll/periods/${selectedPeriod.id}/export?token=${api.getToken()}`, '_blank');
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.put('/payroll/rules', rulesForm);
      setRules(res.rules);
      setIsRulesModalOpen(false);
      alert('Overtime calculation rules updated successfully.');
    } catch (err: any) {
      alert(`Error saving rules: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Deterministic Payroll Engine</h1>
          <p className="text-sm text-slate-400">
            Rule-based wage & overtime calculation with immutable audit records.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsRulesModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Overtime Rules</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Pay Period</span>
          </button>
        </div>
      </div>

      {/* Pay Periods Navigation & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Periods List */}
        <div className="lg:col-span-4 space-y-2.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payroll Periods</h3>
          {periods.map((p) => {
            const isSelected = selectedPeriod?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPeriod(p)}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/10 border-blue-500 shadow-md'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{p.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : (p.status === 'CALCULATED' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400')
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">{p.start_date} → {p.end_date}</p>
              </div>
            );
          })}
        </div>

        {/* Right: Calculation & Records Table */}
        <div className="lg:col-span-8 space-y-4">
          {periodDetails ? (
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">{periodDetails.period?.name}</h3>
                  <p className="text-xs text-slate-400">
                    Period: <strong className="text-slate-200">{periodDetails.period?.start_date} to {periodDetails.period?.end_date}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCalculatePeriod}
                    disabled={isCalculating || periodDetails.period?.status === 'APPROVED'}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                  >
                    <Calculator className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
                    <span>{isCalculating ? 'Computing...' : 'Run Wage Math'}</span>
                  </button>

                  {periodDetails.period?.status !== 'APPROVED' ? (
                    <button
                      onClick={handleApprovePeriod}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold px-2 py-1 rounded bg-emerald-500/10">
                      <Lock className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}

                  <button
                    onClick={handleExportExcel}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Regular Hours</span>
                  <p className="text-lg font-black text-white">{periodDetails.summary?.totalRegularHours}h</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400 text-[11px]">Overtime Hours</span>
                  <p className="text-lg font-black text-amber-400">{periodDetails.summary?.totalOvertimeHours}h</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-emerald-400 text-[11px]">Gross Payroll Est.</span>
                  <p className="text-lg font-black text-emerald-400">${periodDetails.summary?.totalGrossPay?.toFixed(2)}</p>
                </div>
              </div>

              {/* Records Breakdown Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5">Staff Member</th>
                      <th className="pb-2.5">Rate</th>
                      <th className="pb-2.5">Reg Hrs</th>
                      <th className="pb-2.5">OT Hrs</th>
                      <th className="pb-2.5">Reg Pay</th>
                      <th className="pb-2.5">OT Pay</th>
                      <th className="pb-2.5 font-bold text-white">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {periodDetails.records?.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 font-semibold text-white">
                          {r.first_name} {r.last_name}
                          <span className="block text-[10px] font-mono text-slate-500">{r.employee_code}</span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-300">${r.hourly_rate}</td>
                        <td className="py-2.5 text-slate-300">{r.regular_hours}h</td>
                        <td className="py-2.5 font-bold text-amber-400">{r.overtime_hours}h</td>
                        <td className="py-2.5 font-mono text-slate-300">${r.regular_pay.toFixed(2)}</td>
                        <td className="py-2.5 font-mono text-amber-400">${r.overtime_pay.toFixed(2)}</td>
                        <td className="py-2.5 font-mono font-black text-emerald-400">${r.gross_pay.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 rounded-2xl bg-slate-950 border border-slate-800">
              Select or create a payroll period to view register.
            </div>
          )}
        </div>
      </div>

      {/* Overtime Rules Configuration Modal */}
      {isRulesModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-400" />
              Configure Company Overtime Rules
            </h3>
            <p className="text-xs text-slate-400">Company-configured deterministic parameters applied across all facilities.</p>

            <form onSubmit={handleSaveRules} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Daily Threshold (hrs)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={rulesForm.daily_threshold_hours}
                    onChange={(e) => setRulesForm({ ...rulesForm, daily_threshold_hours: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Weekly Threshold (hrs)</label>
                  <input
                    type="number"
                    step="1"
                    value={rulesForm.weekly_threshold_hours}
                    onChange={(e) => setRulesForm({ ...rulesForm, weekly_threshold_hours: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Overtime Multiplier</label>
                  <input
                    type="number"
                    step="0.25"
                    value={rulesForm.overtime_multiplier}
                    onChange={(e) => setRulesForm({ ...rulesForm, overtime_multiplier: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Double Time Multiplier</label>
                  <input
                    type="number"
                    step="0.25"
                    value={rulesForm.double_time_multiplier}
                    onChange={(e) => setRulesForm({ ...rulesForm, double_time_multiplier: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRulesModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Rules
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Pay Period Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Create New Pay Period</h3>

            <form onSubmit={handleCreatePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Period Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bi-Weekly Pay Period #18"
                  value={periodForm.name}
                  onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={periodForm.startDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={periodForm.endDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Create Period
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
