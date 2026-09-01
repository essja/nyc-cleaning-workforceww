import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Building2, MapPin, Plus, Navigation, Search, Radio,
  Compass, Loader2, LocateFixed, ShieldCheck
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix standard Leaflet marker icons in React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Admin Live GPS Marker with Pulsing Arrow
const adminLiveIcon = L.divIcon({
  className: 'admin-live-marker',
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
      <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background-color: rgba(59, 130, 246, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 26px; height: 26px; border-radius: 9999px; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="12 2 21 21 12 17 3 21 12 2"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// Map Viewport Controller to smoothly pan without re-mounting
const MapController: React.FC<{ center: [number, number]; zoom?: number }> = ({ center, zoom = 14 }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center[0], center[1], zoom, map]);
  return null;
};

// Calculate Haversine distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const BuildingsPage: React.FC = () => {
  const { organization, user } = useAuth();
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  // Admin Live Location Tracking
  const [adminLocation, setAdminLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    heading: number | null;
  } | null>(null);
  const [isTrackingAdmin, setIsTrackingAdmin] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]);

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
        setMapCenter([res.buildings[0].latitude, res.buildings[0].longitude]);
      }
    } catch (err) {
      console.error('Failed to load buildings:', err);
    }
  };

  // Start Live Admin GPS Watch
  useEffect(() => {
    fetchBuildings();

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      setIsTrackingAdmin(true);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading
          };
          setAdminLocation(loc);
        },
        (err) => console.warn('Admin location prompt:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [organization?.id]);

  const handleRecenterOnAdmin = () => {
    if (adminLocation) {
      setMapCenter([adminLocation.latitude, adminLocation.longitude]);
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading
        };
        setAdminLocation(loc);
        setMapCenter([loc.latitude, loc.longitude]);
      });
    }
  };

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-400" />
            Facility & Site Operations Map
          </h1>
          <p className="text-sm text-slate-400">
            Real-time GPS geofence radar, client building fleet, and live Admin location tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRecenterOnAdmin}
            title="Recenter Map to Your Current Location"
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <LocateFixed className="w-4 h-4 text-blue-400" />
            <span>Track My Location (Admin)</span>
          </button>

          {['OWNER', 'ADMIN'].includes(user?.role || '') && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Building / Job Site</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Location Banner */}
      {adminLocation && (
        <div className="p-3 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping"></div>
            <span className="font-bold text-white">Live Admin GPS Signal Active:</span>
            <span className="font-mono text-blue-300">
              {adminLocation.latitude.toFixed(5)}, {adminLocation.longitude.toFixed(5)} (±{Math.round(adminLocation.accuracy)}m)
            </span>
          </div>
          {selectedBuilding && (
            <div className="text-slate-400">
              Distance to <strong className="text-white">{selectedBuilding.name}</strong>:{' '}
              <span className="font-mono text-emerald-400 font-bold">
                {(calculateDistanceMeters(adminLocation.latitude, adminLocation.longitude, selectedBuilding.latitude, selectedBuilding.longitude) / 1000).toFixed(2)} km
              </span>
            </div>
          )}
        </div>
      )}

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
                const distMeters = adminLocation
                  ? calculateDistanceMeters(adminLocation.latitude, adminLocation.longitude, b.latitude, b.longitude)
                  : null;

                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      setSelectedBuilding(b);
                      setMapCenter([b.latitude, b.longitude]);
                    }}
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

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3 text-blue-400" />
                        Geofence: <strong className="text-slate-200">{b.geofence_radius_meters}m</strong>
                      </span>
                      {distMeters !== null && (
                        <span className="font-mono text-blue-400 font-semibold">
                          {(distMeters / 1000).toFixed(2)} km away
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Live Interactive Real Map */}
        <div className="lg:col-span-7 rounded-2xl bg-slate-950 border border-slate-800 p-2 overflow-hidden flex flex-col min-h-[520px]">
          <div className="flex-1 rounded-xl overflow-hidden relative" style={{ isolation: 'isolate' }}>
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', minHeight: '500px', width: '100%', zIndex: 0 }}
            >
              <MapController center={mapCenter} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />

              {/* Admin Live Location Marker */}
              {adminLocation && (
                <>
                  <Marker
                    position={[adminLocation.latitude, adminLocation.longitude]}
                    icon={adminLiveIcon}
                  >
                    <Popup>
                      <div className="text-slate-900 text-xs font-sans">
                        <strong className="text-blue-600 flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          You Are Here (Admin Live Location)
                        </strong>
                        <p className="text-[11px] text-slate-600 mt-1 font-mono">
                          Lat: {adminLocation.latitude.toFixed(5)}, Lng: {adminLocation.longitude.toFixed(5)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          GPS Accuracy: ±{Math.round(adminLocation.accuracy)} meters
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[adminLocation.latitude, adminLocation.longitude]}
                    radius={adminLocation.accuracy}
                    pathOptions={{
                      color: '#2563eb',
                      fillColor: '#3b82f6',
                      fillOpacity: 0.15,
                      weight: 1
                    }}
                  />
                </>
              )}

              {/* Client Buildings & Geofence Rings */}
              {buildings.map((b) => (
                <React.Fragment key={b.id}>
                  <Marker
                    position={[b.latitude, b.longitude]}
                    eventHandlers={{
                      click: () => {
                        setSelectedBuilding(b);
                        setMapCenter([b.latitude, b.longitude]);
                      }
                    }}
                  >
                    <Popup>
                      <div className="text-slate-900 text-xs">
                        <strong>{b.name}</strong>
                        <p>{b.address_line1}, {b.city}</p>
                        <p className="text-blue-600 font-bold">Geofence: {b.geofence_radius_meters}m radius</p>
                        {adminLocation && (
                          <p className="text-emerald-700 font-bold mt-1">
                            Distance from you: {(calculateDistanceMeters(adminLocation.latitude, adminLocation.longitude, b.latitude, b.longitude) / 1000).toFixed(2)} km
                          </p>
                        )}
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
                  placeholder="e.g. 350 5th Ave, New York, NY 10118"
                  value={addressSearchQuery}
                  onChange={(e) => setAddressSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddressLookup();
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={handleAddressLookup}
                  disabled={isGeocoding}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isGeocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Find GPS</span>
                </button>
              </div>
              {geocodingResult && (
                <p className="text-[11px] text-slate-300 font-mono mt-1">{geocodingResult}</p>
              )}
            </div>

            <form onSubmit={handleSaveBuilding} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Building / Client Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Empire State Facility"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Site Code</label>
                  <input
                    type="text"
                    placeholder="ESB-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  placeholder="350 5th Ave"
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
                    required
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Geofence (Meters)</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    required
                    value={formData.geofence_radius_meters}
                    onChange={(e) => setFormData({ ...formData, geofence_radius_meters: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md shadow-blue-500/25"
                >
                  Save Building
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
