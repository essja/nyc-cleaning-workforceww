import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Cpu, Radio, RefreshCw, CheckCircle2, Play, Activity,
  Plus, Smartphone, Fingerprint, ShieldCheck, AlertCircle
} from 'lucide-react';

export const DevicesPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal form state
  const [deviceForm, setDeviceForm] = useState({
    buildingId: '',
    name: '',
    deviceIdentifier: '',
    manufacturer: 'ZKTECO',
    ipAddress: '192.168.1.100',
    port: 4370
  });

  // Simulator state
  const [simulatedDevice, setSimulatedDevice] = useState('');
  const [simulatedPin, setSimulatedPin] = useState('');
  const [simulatedType, setSimulatedType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  const fetchLookups = async () => {
    try {
      const bldRes = await api.get('/buildings');
      const blds = bldRes.buildings || [];
      setBuildings(blds);
      if (blds.length > 0 && !deviceForm.buildingId) {
        setDeviceForm((prev) => ({ ...prev, buildingId: blds[0].id }));
      }

      const devRes = await api.get('/buildings/devices/all');
      const devList = devRes.devices || [];
      setDevices(devList);
      if (devList.length > 0 && !simulatedDevice) {
        setSimulatedDevice(devList[0].device_identifier);
      }

      const empRes = await api.get('/employees');
      const empList = empRes.employees || [];
      setEmployees(empList);
      if (empList.length > 0 && !simulatedPin) {
        setSimulatedPin(`PIN-${empList[0].employee_code.replace(/[^0-9]/g, '') || '1001'}`);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchLookups();
  }, [organization?.id]);

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.buildingId) {
      alert('Please select a building / facility first.');
      return;
    }
    try {
      await api.post(`/buildings/${deviceForm.buildingId}/devices`, {
        name: deviceForm.name,
        deviceIdentifier: deviceForm.deviceIdentifier,
        manufacturer: deviceForm.manufacturer,
        ipAddress: deviceForm.ipAddress,
        port: deviceForm.port
      });
      setIsModalOpen(false);
      setDeviceForm({
        buildingId: buildings[0]?.id || '',
        name: '',
        deviceIdentifier: '',
        manufacturer: 'ZKTECO',
        ipAddress: '192.168.1.100',
        port: 4370
      });
      fetchLookups();
    } catch (err: any) {
      alert(`Failed to register terminal: ${err.message}`);
    }
  };

  const handleSimulateDevicePunch = async () => {
    if (!simulatedDevice) {
      setSimulationLog('⚠️ Please register or select a target terminal first.');
      return;
    }
    try {
      setSimulationLog('📡 Broadcasting terminal punch through hardware adapter...');
      const res = await api.post('/attendance/device-punch', {
        deviceIdentifier: simulatedDevice,
        biometricPinOrCard: simulatedPin || 'PIN-1001',
        punchType: simulatedType
      });

      setSimulationLog(`✅ Success! Hardware fingerprint scan verified and logged in Timesheet at ${new Date(res.event.timestamp).toLocaleTimeString()}`);
    } catch (err: any) {
      setSimulationLog(`❌ Simulation Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Biometric Hardware & Edge Gateways</h1>
          <p className="text-sm text-slate-400">
            Physical wall-mounted fingerprint/facial time clocks (ZKTeco, Anviz) and smartphone biometric integration.
          </p>
        </div>

        {['OWNER', 'ADMIN'].includes(user?.role || '') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Register Biometric Terminal</span>
          </button>
        )}
      </div>

      {/* Biometric Modality Explainer Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">📱 Mobile Biometrics (Apple FaceID / TouchID)</h4>
            <p className="text-xs text-slate-400 mt-1">
              Workers clock in directly on their phones using their iPhone FaceID or Android fingerprint scanner via the <strong>Employee Mobile Portal</strong>.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">🏢 Physical Wall Clock Terminals</h4>
            <p className="text-xs text-slate-400 mt-1">
              On-site hardware fingerprint boxes mounted in lobbies and maintenance closets sync live attendance directly to the server.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Device Fleet */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Physical Terminals</h3>
          
          {devices.length === 0 ? (
            <div className="p-8 text-center text-slate-500 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3">
              <Cpu className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No physical wall terminals registered for <strong>{organization?.name}</strong> yet.</p>
              {['OWNER', 'ADMIN'].includes(user?.role || '') && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Wall Clock Terminal</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((dev) => (
                <div key={dev.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-white block">{dev.name}</span>
                      <span className="text-xs text-slate-400 block font-mono">{dev.device_identifier} • {dev.manufacturer}</span>
                      <span className="text-[11px] text-slate-500">{dev.building_name}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <Radio className="w-3 h-3 animate-pulse text-emerald-400" /> ONLINE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Interactive Terminal Simulator */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Physical Terminal Simulator</h3>
          </div>
          <p className="text-xs text-slate-400">
            Simulate a physical fingerprint punch event from an on-site biometric terminal to test edge ingestion.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Target Terminal</label>
              {devices.length === 0 ? (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
                  No terminals registered yet. Click <strong>"Register Biometric Terminal"</strong> above to add one.
                </div>
              ) : (
                <select
                  value={simulatedDevice}
                  onChange={(e) => setSimulatedDevice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.device_identifier}>
                      {d.device_identifier} ({d.name} - {d.building_name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Enrolled Employee / PIN</label>
              {employees.length === 0 ? (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
                  No employees in roster yet. Add cleaners on the Employees page first.
                </div>
              ) : (
                <select
                  value={simulatedPin}
                  onChange={(e) => setSimulatedPin(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={`PIN-${emp.employee_code.replace(/[^0-9]/g, '') || '1001'}`}>
                      PIN-{emp.employee_code.replace(/[^0-9]/g, '') || '1001'} ({emp.first_name} {emp.last_name} - {emp.employee_code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Action Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSimulatedType('CHECK_IN')}
                  className={`py-2 rounded-xl font-bold transition ${
                    simulatedType === 'CHECK_IN'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Clock In
                </button>
                <button
                  type="button"
                  onClick={() => setSimulatedType('CHECK_OUT')}
                  className={`py-2 rounded-xl font-bold transition ${
                    simulatedType === 'CHECK_OUT'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  Clock Out
                </button>
              </div>
            </div>

            <button
              onClick={handleSimulateDevicePunch}
              disabled={devices.length === 0}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Simulate Physical Fingerprint Scan</span>
            </button>

            {simulationLog && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
                {simulationLog}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Register Biometric Terminal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              Register Biometric Hardware Terminal
            </h3>

            <form onSubmit={handleRegisterDevice} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Building / Facility</label>
                {buildings.length === 0 ? (
                  <p className="text-amber-400 text-[11px]">Please add a facility on the Buildings page first.</p>
                ) : (
                  <select
                    value={deviceForm.buildingId}
                    onChange={(e) => setDeviceForm({ ...deviceForm, buildingId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Terminal Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Lobby Wall Clock"
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Device ID Code</label>
                  <input
                    type="text"
                    required
                    placeholder="NYC-LOBBY-01"
                    value={deviceForm.deviceIdentifier}
                    onChange={(e) => setDeviceForm({ ...deviceForm, deviceIdentifier: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Manufacturer</label>
                  <select
                    value={deviceForm.manufacturer}
                    onChange={(e) => setDeviceForm({ ...deviceForm, manufacturer: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="ZKTECO">ZKTeco Biometric</option>
                    <option value="ANVIZ">Anviz Biometric</option>
                    <option value="GENERIC_PULL">Generic Hardware</option>
                    <option value="MOCK">Virtual Simulator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Local IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    value={deviceForm.ipAddress}
                    onChange={(e) => setDeviceForm({ ...deviceForm, ipAddress: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Port</label>
                  <input
                    type="number"
                    value={deviceForm.port}
                    onChange={(e) => setDeviceForm({ ...deviceForm, port: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={buildings.length === 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow-md shadow-blue-500/25 disabled:opacity-50"
                >
                  Register Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
