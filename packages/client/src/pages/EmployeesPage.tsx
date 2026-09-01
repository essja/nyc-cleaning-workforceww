import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Users, UserPlus, Upload, Search, Download,
  CheckCircle2, XCircle, AlertCircle, FileSpreadsheet,
  Building, DollarSign, Mail, Phone, Edit2, KeyRound,
  Trash2, Eye, ShieldCheck, Calendar, Clock, Copy,
  ExternalLink, Check, UserCheck, Umbrella
} from 'lucide-react';

export const EmployeesPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Selected employee for modal actions
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [fullProfile, setFullProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  // Password reset state
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Credentials card state (shown right after creating a cleaner)
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    appUrl: string;
  } | null>(null);

  // Bulk Import state
  const [importStep, setImportStep] = useState<'UPLOAD' | 'PREVIEW' | 'COMPLETED'>('UPLOAD');
  const [importValidation, setImportValidation] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Add Employee Form state
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

  // Edit Employee Form state
  const [editFormData, setEditFormData] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    employment_type: 'HOURLY',
    status: 'ACTIVE',
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

  // Create Employee Handler
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.post('/employees', formData);
      setIsAddModalOpen(false);
      
      // Open clean login credentials modal for the owner
      setCreatedCredentials({
        name: `${created.first_name} ${created.last_name}`,
        email: created.email || formData.email,
        password: formData.password || 'Password123!',
        appUrl: window.location.origin
      });
      setIsCredentialsModalOpen(true);

      // Reset form
      setFormData({
        employee_code: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        password: 'Password123!',
        employment_type: 'HOURLY',
        hourly_rate: 20.00,
        building_ids: []
      });

      fetchEmployees();
    } catch (err: any) {
      alert(`Error creating employee: ${err.message}`);
    }
  };

  // Open Edit Modal
  const openEditModal = (emp: any) => {
    setSelectedEmployee(emp);
    setEditFormData({
      employee_code: emp.employee_code || '',
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      employment_type: emp.employment_type || 'HOURLY',
      status: emp.status || 'ACTIVE',
      hourly_rate: emp.current_pay_rate || 20.00,
      building_ids: emp.assigned_buildings?.map((b: any) => b.id) || []
    });
    setIsEditModalOpen(true);
  };

  // Save Edit Handler
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await api.put(`/employees/${selectedEmployee.id}`, editFormData);
      setIsEditModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      alert(`Error updating employee: ${err.message}`);
    }
  };

  // Open Full Profile
  const openProfileModal = async (emp: any) => {
    setSelectedEmployee(emp);
    setProfileLoading(true);
    setIsProfileModalOpen(true);
    try {
      const res = await api.get(`/employees/${emp.id}/full-profile`);
      setFullProfile(res);
    } catch (err: any) {
      alert(`Failed to load profile: ${err.message}`);
    } finally {
      setProfileLoading(false);
    }
  };

  // Open Password Reset Modal
  const openResetPasswordModal = (emp: any) => {
    setSelectedEmployee(emp);
    setNewPasswordInput(`NYC-${Math.random().toString(36).substring(2, 7)}!`);
    setResetSuccessMessage(null);
    setIsResetPasswordModalOpen(true);
  };

  // Execute Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      const res = await api.post(`/employees/${selectedEmployee.id}/reset-password`, {
        password: newPasswordInput
      });
      setResetSuccessMessage(res.message || 'Password successfully reset.');
    } catch (err: any) {
      alert(`Error resetting password: ${err.message}`);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (emp: any) => {
    setSelectedEmployee(emp);
    setIsDeleteModalOpen(true);
  };

  // Execute Delete
  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    try {
      await api.delete(`/employees/${selectedEmployee.id}`);
      setIsDeleteModalOpen(false);
      if (isProfileModalOpen) setIsProfileModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      alert(`Error deleting employee: ${err.message}`);
    }
  };

  // Copy login instructions to clipboard
  const handleCopyInstructions = () => {
    if (!createdCredentials) return;
    const text = `🏢 Welcome to NYC Cleaning & Maintenance!\n\nHere is your permanent account to clock in and view your schedule:\n\n📱 App Link: ${createdCredentials.appUrl}\n📧 Login Email: ${createdCredentials.email}\n🔑 Password: ${createdCredentials.password}\n\nOpen the app link on your phone, log in, and tap "Clock In" with Apple FaceID / Fingerprint!`;
    navigator.clipboard.writeText(text);
    setCopiedInstructions(true);
    setTimeout(() => setCopiedInstructions(false), 3000);
  };

  // Sample Template for Bulk Import
  const sampleImportData = [
    { employee_id: 'EMP-2001', first_name: 'Marcus', last_name: 'Brody', email: 'marcus.b@nyccleaning.com', department: 'Commercial Cleaning', position: 'Senior Cleaner', pay_type: 'HOURLY', pay_rate: 22.50 },
    { employee_id: 'EMP-2002', first_name: 'Fatima', last_name: 'Sesay', email: 'fatima.s@nyccleaning.com', department: 'Commercial Cleaning', position: 'Sanitation Tech', pay_type: 'HOURLY', pay_rate: 21.00 },
    { employee_id: 'EMP-2003', first_name: 'Tariq', last_name: 'Mansaray', email: 'tariq.m@nyccleaning.com', department: 'Facility Maintenance', position: 'Maintenance Specialist', pay_type: 'HOURLY', pay_rate: 25.00 }
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
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Workforce Roster & Staff Accounts
          </h1>
          <p className="text-sm text-slate-400">
            Create permanent cleaner login accounts, edit employee information, reset passwords, and track work assignments.
          </p>
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
              <span>Bulk Excel Import</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Employee</span>
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
            placeholder="Search by cleaner name, code, email, or phone..."
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
          <option value="ACTIVE">Active Staff</option>
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
                <th className="pb-3">Staff Code</th>
                <th className="pb-3">Cleaner Name</th>
                <th className="pb-3">Login Email / Phone</th>
                <th className="pb-3">Assigned Facility</th>
                <th className="pb-3">Pay Rate</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    No cleaning staff found. Click <strong>"+ Add Employee"</strong> to add your first cleaner!
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-3.5 font-mono font-bold text-blue-400">{emp.employee_code}</td>
                    <td className="py-3.5 font-semibold text-white">
                      <button
                        onClick={() => openProfileModal(emp)}
                        className="hover:underline text-left text-white font-bold"
                      >
                        {emp.first_name} {emp.last_name}
                      </button>
                    </td>
                    <td className="py-3.5 text-slate-400">
                      <div className="flex flex-col gap-0.5">
                        {emp.email ? (
                          <span className="flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                            <Mail className="w-3 h-3 text-blue-400" /> {emp.email}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">No email set</span>
                        )}
                        {emp.phone && (
                          <span className="flex items-center gap-1 text-slate-400 text-[10px]">
                            <Phone className="w-3 h-3 text-slate-500" /> {emp.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-300">
                      {emp.primary_building_name || 'Downtown Commercial Plaza'}
                    </td>
                    <td className="py-3.5 font-medium text-emerald-400 font-mono">
                      ${emp.current_pay_rate?.toFixed(2) || '20.00'}/hr
                    </td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        emp.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : (emp.status === 'ON_LEAVE' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400')
                      }`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openProfileModal(emp)}
                          title="View Full Profile & Attendance"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          title="Edit Information"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-blue-600/20 text-blue-400 transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openResetPasswordModal(emp)}
                          title="Reset Password"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-amber-600/20 text-amber-400 transition"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(emp)}
                          title="Delete Employee"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-600/20 text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. Account Created Credentials Modal (Clear Onboarding Access) */}
      {isCredentialsModalOpen && createdCredentials && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-emerald-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Staff Account Created Successfully!</h3>
              <p className="text-xs text-slate-400">
                Share these permanent login credentials with <strong>{createdCredentials.name}</strong> so they can log in on their phone.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">📱 Mobile Web App:</span>
                <a href={createdCredentials.appUrl} target="_blank" rel="noreferrer" className="text-blue-400 font-bold hover:underline flex items-center gap-1 font-mono text-[11px]">
                  <span>Open App</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">📧 Login Email:</span>
                <span className="font-mono text-white font-bold">{createdCredentials.email}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">🔑 Permanent Password:</span>
                <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {createdCredentials.password}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCopyInstructions}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition"
              >
                {copiedInstructions ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedInstructions ? 'Copied to Clipboard!' : '📋 Copy Login Instructions (SMS / WhatsApp)'}</span>
              </button>

              <button
                onClick={() => setIsCredentialsModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" />
              Add Single Cleaning Staff
            </h3>

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
                    placeholder="Marcus"
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
                    placeholder="Vance"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Login Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="marcus@nyccleaning.com"
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

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
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
                  Save & Create Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Edit Employee Modal */}
      {isEditModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-400" />
              Edit Employee Information
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Staff Code</label>
                  <input
                    type="text"
                    required
                    value={editFormData.employee_code}
                    onChange={(e) => setEditFormData({ ...editFormData, employee_code: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="TERMINATED">TERMINATED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Login Email Address</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Hourly Pay Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={editFormData.hourly_rate}
                    onChange={(e) => setEditFormData({ ...editFormData, hourly_rate: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Assigned Building</label>
                  <select
                    value={editFormData.building_ids[0] || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, building_ids: [e.target.value] })}
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
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Reset Password Modal */}
      {isResetPasswordModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              Reset Cleaner Password
            </h3>

            <p className="text-xs text-slate-400">
              Set a new permanent or temporary password for <strong>{selectedEmployee.first_name} {selectedEmployee.last_name}</strong> ({selectedEmployee.email}).
            </p>

            {resetSuccessMessage ? (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs space-y-3">
                <p>{resetSuccessMessage}</p>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-white font-bold">
                  New Password: <span className="text-emerald-400">{newPasswordInput}</span>
                </div>
                <button
                  onClick={() => setIsResetPasswordModalOpen(false)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">New Password</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-mono"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPasswordInput(`NYC-${Math.random().toString(36).substring(2, 8)}!`)}
                    className="py-1.5 px-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white text-[11px]"
                  >
                    🎲 Generate Random Password
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsResetPasswordModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-md shadow-amber-500/25"
                  >
                    Set New Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Delete Employee Record
            </h3>

            <p className="text-xs text-slate-300">
              Are you sure you want to delete <strong>{selectedEmployee.first_name} {selectedEmployee.last_name}</strong> ({selectedEmployee.employee_code})?
            </p>
            <p className="text-[11px] text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">
              ⚠️ This will remove the staff profile and login access from the active roster.
            </p>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-md shadow-red-500/25 text-xs"
              >
                Yes, Delete Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Full Employee Profile Modal */}
      {isProfileModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
                  {selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedEmployee.first_name} {selectedEmployee.last_name}</h3>
                  <p className="text-slate-400 font-mono text-[11px]">ID: {selectedEmployee.employee_code} • {selectedEmployee.primary_building_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedEmployee)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-blue-400 rounded-xl border border-slate-800 font-semibold"
                >
                  Edit
                </button>
                <button
                  onClick={() => openResetPasswordModal(selectedEmployee)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl border border-slate-800 font-semibold"
                >
                  Reset Password
                </button>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {profileLoading ? (
              <div className="p-8 text-center text-slate-500">Loading full employee profile...</div>
            ) : fullProfile ? (
              <div className="space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Pay Rate</span>
                    <strong className="text-emerald-400 font-mono text-sm">${fullProfile.employee.current_pay_rate?.toFixed(2)}/h</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Present Days</span>
                    <strong className="text-white text-sm">{fullProfile.attendanceStats.presentDays}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Late Clock-Ins</span>
                    <strong className="text-amber-400 text-sm">{fullProfile.attendanceStats.lateArrivals}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Account Status</span>
                    <strong className="text-blue-400 text-sm">{fullProfile.employee.status}</strong>
                  </div>
                </div>

                {/* Account Details Box */}
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 font-bold block text-[11px]">🔐 Login & Account Info:</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <p><strong className="text-slate-400">Login Email:</strong> <span className="font-mono text-white">{fullProfile.account.loginEmail || 'None'}</span></p>
                    <p><strong className="text-slate-400">Phone:</strong> <span className="text-slate-200">{fullProfile.employee.phone || 'None'}</span></p>
                    <p><strong className="text-slate-400">Hire Date:</strong> <span className="text-slate-200">{fullProfile.employee.hire_date || 'N/A'}</span></p>
                    <p><strong className="text-slate-400">Facility:</strong> <span className="text-slate-200">{fullProfile.employee.primary_building_name}</span></p>
                  </div>
                </div>

                {/* Recent Attendance Sessions */}
                <div className="space-y-2">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-400" />
                    Recent Attendance Punch History
                  </h4>
                  {fullProfile.attendanceStats.recentSessions.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 rounded-xl bg-slate-900 border border-slate-800">
                      No attendance sessions recorded yet.
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-900 text-slate-400">
                          <tr>
                            <th className="p-2">Date</th>
                            <th className="p-2">Site</th>
                            <th className="p-2">Clock In</th>
                            <th className="p-2">Clock Out</th>
                            <th className="p-2">Hours</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {fullProfile.attendanceStats.recentSessions.map((s: any) => (
                            <tr key={s.id}>
                              <td className="p-2 font-mono text-slate-300">{s.session_date}</td>
                              <td className="p-2 text-slate-300">{s.building_name}</td>
                              <td className="p-2 text-emerald-400 font-mono">{s.check_in_time ? new Date(s.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
                              <td className="p-2 text-slate-400 font-mono">{s.check_out_time ? new Date(s.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'OPEN'}</td>
                              <td className="p-2 font-bold text-white">{(s.total_work_minutes / 60).toFixed(2)}h</td>
                              <td className="p-2 text-blue-400 uppercase text-[10px] font-bold">{s.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Leave Requests */}
                <div className="space-y-2">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Umbrella className="w-4 h-4 text-amber-400" />
                    Leave & Time Off Requests
                  </h4>
                  {fullProfile.leaveStats.requests.length === 0 ? (
                    <div className="p-3 text-center text-slate-500 rounded-xl bg-slate-900 border border-slate-800">
                      No leave requests filed.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {fullProfile.leaveStats.requests.map((r: any) => (
                        <div key={r.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]">
                          <div>
                            <strong className="text-white">{r.leave_type_name}</strong>
                            <span className="text-slate-400 block">{r.start_date} → {r.end_date} ({r.days_requested} days)</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                            r.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                  <button
                    onClick={() => openDeleteModal(selectedEmployee)}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Employee</span>
                  </button>
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs"
                  >
                    Close Profile
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 7. Bulk Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              Bulk Staff Spreadsheet Import
            </h3>

            {importStep === 'UPLOAD' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-400">
                  Upload an Excel or CSV file containing cleaner names, employee codes, emails, departments, and pay rates.
                </p>

                <div className="border-2 border-dashed border-slate-800 hover:border-blue-500 rounded-2xl p-6 text-center space-y-3 cursor-pointer">
                  <FileSpreadsheet className="w-10 h-10 text-blue-400 mx-auto" />
                  <div>
                    <span className="font-bold text-white block">Drop Cleaner Roster (CSV / XLSX)</span>
                    <span className="text-slate-500 text-[11px]">Supports Standard StaffClock & Excel Formats</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                  <div>
                    <strong className="text-blue-300 block">Want to test with sample cleaning roster?</strong>
                    <span className="text-slate-400 text-[11px]">Includes 4 pre-formatted cleaner records.</span>
                  </div>
                  <button
                    onClick={handleRunSampleValidation}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs"
                  >
                    Test Sample Data
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
    </div>
  );
};
