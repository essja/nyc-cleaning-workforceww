import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Building2, MapPin, Plus, Edit2, Archive,
  Shield, Check, Search, Radio, Compass, Loader2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

// Fix standard Leaflet marker icons in React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export const BuildingsPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Geocoding state
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingResult, setGeocodingResult] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address_line1: '',
    city: 'New York',
    state_province: 'NY',
    postal_code: '10001',
    country: 'USA',
    latitude: 40.7128,
    longitude: -74.0060,
    geofence_radius_meters: 150
  });

  const fetchBuildings = async () => {
    try {
      const res = await api.get(`/buildings?search=${search}`);
      setBuildings(res.buildings || []);
      if (res.buildings?.length > 0 && !selectedBuilding) {
        setSelectedBuilding(res.buildings[0]);
      }
    } catch (err) {
      console.error('Failed to load buildings:', err);
    }
  };

  useEffect(() => {
    fetchBuildings();
  }, [search, organization?.id]);

  const handleAddressLookup = async () => {
    if (!addressSearchQuery.trim()) return;
    setIsGeocoding(true);
    setGeocodingResult(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearchQuery)}&addressdetails=1&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const addr = item.address || {};
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);

        setFormData((prev) => ({
          ...prev,
          name: prev.name || item.display_name.split(',')[0],
          address_line1: `${addr.house_number ? addr.house_number + ' ' : ''}${addr.road || item.display_name.split(',')[0]}`,
          city: addr.city || addr.town || addr.suburb || 'New York',
          state_province: addr.state || 'NY',
          postal_code: addr.postcode || '10001',
          country: addr.country || 'USA',
          latitude: lat,
          longitude: lon
        }));
        setGeocodingResult(`✅ Found: ${item.display_name.slice(0, 60)}...`);
      } else {
        setGeocodingResult('❌ Address not found. Please try a more specific address.');
      }
    } catch {
      setGeocodingResult('❌ Geocoding lookup failed. Please enter coordinates manually.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/buildings', formData);
      setIsModalOpen(false);
      setFormData({
        name: '',
        code: '',
        address_line1: '',
        city: 'New York',
        state_province: 'NY',
        postal_code: '10001',
        country: 'USA',
        latitude: 40.7128,
        longitude: -74.0060,
        geofence_radius_meters: 150
      });
      setAddressSearchQuery('');
      setGeocodingResult(null);
      fetchBuildings();
    } catch (err: any) {
      alert(`Error creating building: ${err.message}`);
    }
  };

  const centerLat = selectedBuilding?.latitude || (buildings[0]?.latitude ?? 40.7128);
  const centerLng = selectedBuilding?.longitude || (buildings[0]?.longitude ?? -74.0060);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Facility & Site Management</h1>
          <p className="text-sm text-slate-400">Interactive OpenStreetMap, GPS geofence radius configuration, and job site deployment.</p>
        </div>

        {['OWNER', 'ADMIN'].includes(user?.role || '') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Building / Job Site</span>
          </button>
        )}
      </div>

      {/* Map & List Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Buildings List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search facilities, cities, or addresses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {buildings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                No facilities added yet. Click <strong>"Add Building / Job Site"</strong> to pin your first location on the map.
              </div>
            ) : (
              buildings.map((b) => {
                const isSelected = selectedBuilding?.id === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBuilding(b)}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600/10 border-blue-500 shadow-md'
                        : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-400" />
                        {b.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {b.code || 'SITE'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      {b.address_line1}, {b.city}, {b.state_province} {b.country}
                    </p>

                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3 text-blue-400" />
                        Geofence: <strong className="text-slate-200">{b.geofence_radius_meters}m</strong>
                      </span>
                      <span>Lat: {b.latitude.toFixed(4)}, Lng: {b.longitude.toFixed(4)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Live Interactive Real Map */}
        <div className="lg:col-span-7 rounded-2xl bg-slate-950 border border-slate-800 p-2 overflow-hidden flex flex-col min-h-[500px]">
          <div className="flex-1 rounded-xl overflow-hidden relative">
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={13}
              style={{ height: '100%', minHeight: '480px', width: '100%' }}
              key={`${centerLat}-${centerLng}`}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {buildings.map((b) => (
                <React.Fragment key={b.id}>
                  <Marker position={[b.latitude, b.longitude]}>
                    <Popup>
                      <div className="text-slate-900 text-xs">
                        <strong>{b.name}</strong>
                        <p>{b.address_line1}, {b.city}</p>
                        <p className="text-blue-600 font-bold">Geofence: {b.geofence_radius_meters}m boundary</p>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[b.latitude, b.longitude]}
                    radius={b.geofence_radius_meters}
                    pathOptions={{
                      color: selectedBuilding?.id === b.id ? '#3b82f6' : '#10b981',
                      fillColor: selectedBuilding?.id === b.id ? '#3b82f6' : '#10b981',
                      fillOpacity: 0.25
                    }}
                  />
                </React.Fragment>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Create Building Modal with Smart Address Geocoding */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              Add Facility / Job Site
            </h3>

            {/* Smart Address Lookup Search */}
            <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2 text-xs">
              <label className="block text-blue-300 font-bold">🔍 Auto-Locate Address on Map</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 350 5th Ave, New York or Empire State Building"
                  value={addressSearchQuery}
                  onChange={(e) => setAddressSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressLookup(); } }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddressLookup}
                  disabled={isGeocoding || !addressSearchQuery.trim()}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  {isGeocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5" />}
                  <span>Find GPS</span>
                </button>
              </div>
              {geocodingResult && (
                <p className="text-[11px] text-slate-300">{geocodingResult}</p>
              )}
            </div>

            <form onSubmit={handleSaveBuilding} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Building / Client Site Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midtown Medical Tower"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Site Code</label>
                  <input
                    type="text"
                    placeholder="BLD-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Country</label>
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Address Line 1</label>
                <input
                  type="text"
                  required
                  placeholder="123 Commercial Ave"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state_province}
                    onChange={(e) => setFormData({ ...formData, state_province: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">GPS Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">GPS Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 font-semibold">Geofence Radius: <strong className="text-white">{formData.geofence_radius_meters} meters</strong></label>
                  <span className="text-[11px] text-blue-400">Strict GPS verification boundary</span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="1000"
                  step="25"
                  value={formData.geofence_radius_meters}
                  onChange={(e) => setFormData({ ...formData, geofence_radius_meters: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
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
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Facility to Map
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
