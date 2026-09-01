import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { Building, Employee, BiometricDevice } from '../../db/types.js';
import { AuditService } from '../audit/audit.service.js';
import { evaluateGeofence, GeofenceEvaluationResult } from '../../utils/geo.js';

export interface CreateBuildingInput {
  name: string;
  code?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state_province?: string;
  postal_code?: string;
  country: string;
  latitude: number;
  longitude: number;
  geofence_radius_meters?: number;
}

export interface BuildingDetailView extends Building {
  assigned_employees_count: number;
  assigned_employees: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    employment_type: string;
    status: string;
  }[];
  devices: {
    id: string;
    name: string;
    device_identifier: string;
    manufacturer: string;
    status: string;
  }[];
  active_on_site_count: number;
  today_scheduled_count: number;
}

export class BuildingsService {
  public static listBuildings(orgId: string, search?: string): Building[] {
    let sql = 'SELECT * FROM buildings WHERE organization_id = ? AND is_active = 1';
    const params: any[] = [orgId];

    if (search) {
      sql += ' AND (name LIKE ? OR address_line1 LIKE ? OR city LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY name ASC';
    return db.query<Building>(sql, params);
  }

  public static getBuildingDetails(orgId: string, buildingId: string): BuildingDetailView {
    const building = db.queryOne<Building>(
      'SELECT * FROM buildings WHERE organization_id = ? AND id = ?',
      [orgId, buildingId]
    );

    if (!building) {
      throw new Error('Building not found');
    }

    const assignedEmployees = db.query<{
      id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      employment_type: string;
      status: string;
    }>(`
      SELECT e.id, e.employee_code, e.first_name, e.last_name, e.employment_type, e.status
      FROM employees e
      JOIN employee_buildings eb ON eb.employee_id = e.id
      WHERE eb.building_id = ? AND e.organization_id = ? AND e.status = 'ACTIVE'
      ORDER BY e.last_name, e.first_name
    `, [buildingId, orgId]);

    const devices = db.query<{
      id: string;
      name: string;
      device_identifier: string;
      manufacturer: string;
      status: string;
    }>(`
      SELECT id, name, device_identifier, manufacturer, status
      FROM biometric_devices
      WHERE building_id = ? AND organization_id = ?
    `, [buildingId, orgId]);

    const todayStr = new Date().toISOString().split('T')[0];

    // Today's scheduled count
    const scheduledRow = db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT employee_id) as count
      FROM schedule_assignments
      WHERE building_id = ? AND organization_id = ? AND shift_date = ? AND status != 'CANCELLED'
    `, [buildingId, orgId, todayStr]);

    // Active on site (open attendance sessions)
    const onSiteRow = db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT employee_id) as count
      FROM attendance_sessions
      WHERE building_id = ? AND organization_id = ? AND session_date = ? AND status = 'OPEN'
    `, [buildingId, orgId, todayStr]);

    return {
      ...building,
      assigned_employees_count: assignedEmployees.length,
      assigned_employees: assignedEmployees,
      devices: devices,
      active_on_site_count: onSiteRow?.count || 0,
      today_scheduled_count: scheduledRow?.count || 0
    };
  }

  public static createBuilding(orgId: string, actorUserId: string, data: CreateBuildingInput): Building {
    const id = uuidv4();
    const now = new Date().toISOString();
    const radius = data.geofence_radius_meters && data.geofence_radius_meters > 0 ? data.geofence_radius_meters : 100;

    db.execute(`
      INSERT INTO buildings (
        id, organization_id, name, code, address_line1, address_line2,
        city, state_province, postal_code, country, latitude, longitude,
        geofence_radius_meters, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `, [
      id, orgId, data.name, data.code || null, data.address_line1, data.address_line2 || null,
      data.city, data.state_province || null, data.postal_code || null, data.country,
      data.latitude, data.longitude, radius, now, now
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'BUILDING.CREATE',
      entityType: 'buildings',
      entityId: id,
      afterState: data
    });

    return db.queryOne<Building>('SELECT * FROM buildings WHERE id = ?', [id])!;
  }

  public static updateBuilding(
    orgId: string,
    actorUserId: string,
    buildingId: string,
    data: Partial<CreateBuildingInput>
  ): Building {
    const existing = db.queryOne<Building>(
      'SELECT * FROM buildings WHERE id = ? AND organization_id = ?',
      [buildingId, orgId]
    );

    if (!existing) throw new Error('Building not found');

    const now = new Date().toISOString();
    const updated = {
      name: data.name ?? existing.name,
      code: data.code !== undefined ? data.code : existing.code,
      address_line1: data.address_line1 ?? existing.address_line1,
      address_line2: data.address_line2 !== undefined ? data.address_line2 : existing.address_line2,
      city: data.city ?? existing.city,
      state_province: data.state_province !== undefined ? data.state_province : existing.state_province,
      postal_code: data.postal_code !== undefined ? data.postal_code : existing.postal_code,
      country: data.country ?? existing.country,
      latitude: data.latitude !== undefined ? data.latitude : existing.latitude,
      longitude: data.longitude !== undefined ? data.longitude : existing.longitude,
      geofence_radius_meters: data.geofence_radius_meters !== undefined ? data.geofence_radius_meters : existing.geofence_radius_meters
    };

    db.execute(`
      UPDATE buildings SET
        name = ?, code = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state_province = ?, postal_code = ?, country = ?,
        latitude = ?, longitude = ?, geofence_radius_meters = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [
      updated.name, updated.code, updated.address_line1, updated.address_line2,
      updated.city, updated.state_province, updated.postal_code, updated.country,
      updated.latitude, updated.longitude, updated.geofence_radius_meters, now,
      buildingId, orgId
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'BUILDING.UPDATE',
      entityType: 'buildings',
      entityId: buildingId,
      beforeState: existing,
      afterState: updated
    });

    return db.queryOne<Building>('SELECT * FROM buildings WHERE id = ?', [buildingId])!;
  }

  public static archiveBuilding(orgId: string, actorUserId: string, buildingId: string): void {
    const existing = db.queryOne<Building>(
      'SELECT * FROM buildings WHERE id = ? AND organization_id = ?',
      [buildingId, orgId]
    );
    if (!existing) throw new Error('Building not found');

    const now = new Date().toISOString();
    db.execute(`
      UPDATE buildings SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?
    `, [now, buildingId, orgId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'BUILDING.ARCHIVE',
      entityType: 'buildings',
      entityId: buildingId,
      beforeState: existing
    });
  }

  public static verifyGeofence(
    orgId: string,
    buildingId: string,
    lat: number,
    lng: number
  ): GeofenceEvaluationResult {
    const building = db.queryOne<Building>(
      'SELECT latitude, longitude, geofence_radius_meters FROM buildings WHERE id = ? AND organization_id = ?',
      [buildingId, orgId]
    );

    if (!building) throw new Error('Building not found');

    return evaluateGeofence(lat, lng, building.latitude, building.longitude, building.geofence_radius_meters);
  }
}
