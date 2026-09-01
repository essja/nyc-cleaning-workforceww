/**
 * Geolocation & Geofence Calculation Utility
 */

const EARTH_RADIUS_METERS = 6371000; // Earth mean radius in meters

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in meters (rounded to 2 decimal places)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (angle: number) => (angle * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_METERS * c;
  return Math.round(distance * 100) / 100;
}

export interface GeofenceEvaluationResult {
  isWithin: boolean;
  distanceMeters: number;
  thresholdRadiusMeters: number;
  excessMeters: number;
}

/**
 * Evaluates whether an employee coordinate is within a building's configured geofence radius
 */
export function evaluateGeofence(
  employeeLat: number,
  employeeLng: number,
  buildingLat: number,
  buildingLng: number,
  geofenceRadiusMeters: number,
  toleranceMeters: number = 20 // Account for standard smartphone GPS drift
): GeofenceEvaluationResult {
  const distance = calculateHaversineDistance(employeeLat, employeeLng, buildingLat, buildingLng);
  const allowedRadius = geofenceRadiusMeters + toleranceMeters;
  const isWithin = distance <= allowedRadius;
  const excess = isWithin ? 0 : Math.round((distance - geofenceRadiusMeters) * 100) / 100;

  return {
    isWithin,
    distanceMeters: distance,
    thresholdRadiusMeters: geofenceRadiusMeters,
    excessMeters: excess
  };
}
