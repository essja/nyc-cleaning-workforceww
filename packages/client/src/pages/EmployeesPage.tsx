import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Users, UserPlus, Upload, Search, Download,
  CheckCircle2, XCircle, AlertCircle, FileSpreadsheet,
  Building, DollarSign, Mail, Phone
} from 'lucide-react';

export const EmployeesPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Bulk Import state
  const [importStep, setImportStep] = useState<'UPLOAD' | 'PREVIEW' | 'COMPLETED'>('UPLOAD');
  const [importValidation, setImportValidation] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [formData, setFormData] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: 'Password123!',
    employment_type: 'HOURLY',
    hourly_rate: 20.00,
    building_ids: [] as string[]
  });

  const fetchEmployees = async () => {
    try {
      const res = await api.get(`/employees?search=${search}&status=${selectedStatus}`);
      setEmployees(res.employees || []);
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  const fetchBuildings = async () => {
    try {
      const res = await api.get('/buildings');
      setBuildings(res.buildings || []);
    } catch (err) {}
  };

  useEffect(() => {
    fetchEmployees();
    fetchBuildings();
  }, [search, selectedStatus, organization?.id]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/employees', formData);
      setIsAddModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      alert(`Error creating employee: ${err.message}`);
    }
  };

  // Sample Template for Uncle's cleaning crew
  const sampleImportData = [
    { employee_id: 'EMP-2001', first_name: 'Marcus', last_name: 'Brody', email: 'marcus.b@apex.com', department: 'Commercial Cleaning', position: 'Senior Cleaner', pay_type: 'HOURLY', pay_rate: 19.50 },
    { employee_id: 'EMP-2002', first_name: 'Fatima', last_name: 'Sesay', email: 'fatima.s@apex.com', department: 'Commercial Cleaning', position: 'Sanitation Tech', pay_type: 'HOURLY', pay_rate: 20.00 },
    { employee_id: 'EMP-2003', first_name: 'Tariq', last_name: 'Mansaray', email: 'tariq.m@apex.com', department: 'Facility Maintenance', position: 'HVAC Specialist', pay_type: 'HOURLY', pay_rate: 24.50 },
    { employee_id: 'EMP-2004', first_name: 'Chloe', last_name: 'Bennett', email: 'chloe.b@apex.com', department: 'Window & Exterior Services', position: 'Exterior Lead', pay_type: 'HOURLY', pay_rate: 22.00 }
  ];

  const handleRunSampleValidation = async () => {
    try {
      const val = await api.post('/employees/import/validate', {
        rows: sampleImportData,
        fileName: 'cleaners_roster.xlsx'
      });
      setImportValidation(val);
      setImportStep('PREVIEW');
    } catch (err: any) {
      alert(`Validation error: ${err.message}`);
    }
  };

  const handleExecuteImport = async () => {
    if (!importValidation) return;
    setIsImporting(true);
    try {
      await api.post('/employees/import/execute', {
        validRows: importValidation.validRows,
        fileName: importValidation.fileName,
        errors: importValidation.errors
      });
      setImportStep('COMPLETED');
      fetchEmployees();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Workforce Roster & Onboarding</h1>
          <p className="text-sm text-slate-400">Manage employee accounts, assign work locations, configure wage rates, and bulk import rosters.</p>
        </div>

        {['OWNER', 'ADMIN', 'HR_MANAGER'].includes(user?.role || '') && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => {
                setImportStep('UPLOAD');
                setIsImportModalOpen(true);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-blue-400" />
              <span>Bulk CSV / Excel Import</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Employee</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by employee name, code, email, or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ON_LEAVE">On Leave</option>
        </select>
      </div>

      {/* Employees Table */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Employee Code</th>
                <th className="pb-3">Name</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Pay Rate</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-900/50">
                  <td className="py-3.5 font-mono font-bold text-blue-400">{emp.employee_code}</td>
                  <td className="py-3.5 font-semibold text-white">
                    {emp.first_name} {emp.last_name}
                  </td>
                  <td className="py-3.5 text-slate-400">
                    <div className="flex flex-col gap-0.5">
                      {emp.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-500" /> {emp.email}</span>}
                      {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" /> {emp.phone}</span>}
                    </div>
                  </td>
                  <td className="py-3.5 text-slate-300">{emp.employment_type}</td>
                  <td className="py-3.5 font-medium text-emerald-400">
                    Hourly Standard
                  </td>
                  <td className="py-3.5">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      emp.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {emp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                Bulk Roster Import (CSV / XLSX)
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {importStep === 'UPLOAD' && (
              <div className="space-y-4 text-xs">
                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-900/50 text-center space-y-3 transition">
                  <Upload className="w-8 h-8 text-blue-400 mx-auto" />
                  <p className="font-semibold text-slate-200">Load employee roster spreadsheet</p>
                  <p className="text-slate-500 text-[11px]">Supports CSV, XLSX, and XLS formats with automatic column mapping</p>

                  <button
                    onClick={handleRunSampleValidation}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-md shadow-blue-500/25 transition"
                  >
                    Load Sample Roster Batch ({sampleImportData.length} Cleaners)
                  </button>
                </div>
              </div>
            )}

            {importStep === 'PREVIEW' && importValidation && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Total Records</span>
                    <p className="text-lg font-black text-white">{importValidation.totalRows}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-emerald-400 text-[11px]">Valid & Ready</span>
                    <p className="text-lg font-black text-emerald-400">{importValidation.validRowsCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <span className="text-red-400 text-[11px]">Errors Detected</span>
                    <p className="text-lg font-black text-red-400">{importValidation.invalidRowsCount}</p>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Code</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Position</th>
                        <th className="p-2.5">Pay Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {importValidation.previewRows.map((r: any, i: number) => (
                        <tr key={i} className={r._isValid ? 'bg-slate-950' : 'bg-red-500/10'}>
                          <td className="p-2.5">
                            {r._isValid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-slate-200">{r.employee_id}</td>
                          <td className="p-2.5 text-white font-medium">{r.first_name} {r.last_name}</td>
                          <td className="p-2.5 text-slate-400">{r.position}</td>
                          <td className="p-2.5 text-emerald-400">${r.pay_rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setImportStep('UPLOAD')}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleExecuteImport}
                    disabled={isImporting || importValidation.validRowsCount === 0}
                    className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25 transition disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : `Execute Import (${importValidation.validRowsCount} Records)`}
                  </button>
                </div>
              </div>
            )}

            {importStep === 'COMPLETED' && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-base font-bold text-white">Import Successfully Completed</h4>
                <p className="text-xs text-slate-400">All valid employee records, departments, and pay rates have been committed to the database.</p>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
                >
                  Close & View Roster
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Add Single Employee</h3>

            <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Employee ID / Code</label>
                <input
                  type="text"
                  required
                  placeholder="EMP-1050"
                  value={formData.employee_code}
                  onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Email / Login ID</label>
                  <input
                    type="email"
                    required
                    placeholder="cleaner@nyccleaning.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Permanent Login Password</label>
                  <input
                    type="text"
                    required
                    placeholder="Password123!"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Pay Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Primary Building</label>
                  <select
                    onChange={(e) => setFormData({ ...formData, building_ids: [e.target.value] })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="">Select Facility</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
