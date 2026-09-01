import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import {
  AttendanceEvent, AttendanceSession, Employee, Building,
  ScheduleAssignment, BiometricDevice, Break, OvertimeRule
} from '../../db/types.js';
import { evaluateGeofence } from '../../utils/geo.js';
import { AuditService } from '../audit/audit.service.js';
import { DevicePunchLog } from '../../adapters/biometrics/adapter.interface.js';

export interface MobilePunchInput {
  organizationId: string;
  employeeId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  buildingId?: string;
  biometricVerified?: boolean;
  clientEventId?: string;
  timestamp?: string; // Optional client-reported time
}

export interface AdminAdjustmentInput {
  sessionId: string;
  checkInTime?: string;
  checkOutTime?: string;
  regularMinutes?: number;
  overtimeMinutes?: number;
  reason: string;
}

export class AttendanceEngine {
  /**
   * Process a verified mobile punch (Check In / Check Out / Breaks)
   */
  public static processMobilePunch(input: MobilePunchInput): {
    event: AttendanceEvent;
    session?: AttendanceSession;
    message: string;
  } {
    const orgId = input.organizationId;
    const employeeId = input.employeeId;
    const nowUtc = input.timestamp || new Date().toISOString();
    const todayStr = nowUtc.split('T')[0];

    // 1. Validate employee
    const employee = db.queryOne<Employee>(
      'SELECT * FROM employees WHERE organization_id = ? AND id = ? AND status = ?',
      [orgId, employeeId, 'ACTIVE']
    );
    if (!employee) throw new Error('Active employee record not found');

    // 2. Resolve target building
    let targetBuildingId = input.buildingId;
    if (!targetBuildingId) {
      // Check today's schedule assignment
      const sched = db.queryOne<ScheduleAssignment>(`
        SELECT building_id FROM schedule_assignments
        WHERE organization_id = ? AND employee_id = ? AND shift_date = ? AND status != 'CANCELLED'
        ORDER BY start_time ASC LIMIT 1
      `, [orgId, employeeId, todayStr]);

      if (sched) {
        targetBuildingId = sched.building_id;
      } else {
        // Fallback to primary assigned building
        const primaryBld = db.queryOne<{ building_id: string }>(`
          SELECT building_id FROM employee_buildings
          WHERE employee_id = ? ORDER BY is_primary DESC LIMIT 1
        `, [employeeId]);
        targetBuildingId = primaryBld?.building_id;
      }

      // If still no building assigned, fallback to first active company building in the organization
      if (!targetBuildingId) {
        const companyBld = db.queryOne<{ id: string }>(`
          SELECT id FROM buildings WHERE organization_id = ? AND is_active = 1 LIMIT 1
        `, [orgId]);
        targetBuildingId = companyBld?.id;
      }
    }

    if (!targetBuildingId) {
      throw new Error('No facilities configured for your company yet. Please ask your administrator to add a building in the admin portal.');
    }

    const building = db.queryOne<Building>(
      'SELECT * FROM buildings WHERE organization_id = ? AND id = ? AND is_active = 1',
      [orgId, targetBuildingId]
    );
    if (!building) throw new Error('Building not found or inactive');

    // 3. Evaluate Geofence
    let isWithinGeofence: number | null = null;
    let distanceMeters: number | null = null;

    if (input.latitude !== undefined && input.longitude !== undefined) {
      const geoResult = evaluateGeofence(
        input.latitude,
        input.longitude,
        building.latitude,
        building.longitude,
        building.geofence_radius_meters
      );
      isWithinGeofence = geoResult.isWithin ? 1 : 0;
      distanceMeters = geoResult.distanceMeters;
    }

    // 4. Check client-side idempotency
    if (input.clientEventId) {
      const existingEvent = db.queryOne<AttendanceEvent>(
        'SELECT * FROM attendance_events WHERE client_event_id = ?',
        [input.clientEventId]
      );
      if (existingEvent) {
        const session = db.queryOne<AttendanceSession>(
          'SELECT * FROM attendance_sessions WHERE check_in_event_id = ? OR check_out_event_id = ?',
          [existingEvent.id, existingEvent.id]
        );
        return { event: existingEvent, session: session || undefined, message: 'Event already processed' };
      }
    }

    // 5. Execute state machine within transaction
    return db.transaction(() => {
      const eventId = uuidv4();

      // Insert immutable attendance event
      db.execute(`
        INSERT INTO attendance_events (
          id, organization_id, employee_id, event_type, source, timestamp, received_at,
          building_id, latitude, longitude, accuracy_meters, distance_to_building_meters,
          is_within_geofence, biometric_verified, auth_method, sync_status, client_event_id, raw_payload
        ) VALUES (?, ?, ?, ?, 'MOBILE_APP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
      `, [
        eventId, orgId, employeeId, input.eventType, nowUtc, new Date().toISOString(),
        targetBuildingId, input.latitude ?? null, input.longitude ?? null,
        input.accuracyMeters ?? null, distanceMeters, isWithinGeofence,
        input.biometricVerified ? 1 : 0,
        input.biometricVerified ? 'PHONE_BIOMETRIC' : 'PIN_PASSCODE',
        input.clientEventId || null,
        JSON.stringify({ input })
      ]);

      const createdEvent = db.queryOne<AttendanceEvent>('SELECT * FROM attendance_events WHERE id = ?', [eventId])!;

      // Handle Check-In
      if (input.eventType === 'CHECK_IN') {
        const openSession = db.queryOne<AttendanceSession>(`
          SELECT * FROM attendance_sessions
          WHERE organization_id = ? AND employee_id = ? AND status = 'OPEN'
        `, [orgId, employeeId]);

        if (openSession) {
          throw new Error('Employee already has an open clock-in session. Please check out first.');
        }

        const sessionId = uuidv4();
        const anomalyFlags: string[] = [];

        if (isWithinGeofence === 0) {
          anomalyFlags.push('OUTSIDE_GEOFENCE');
        }

        // Check if late against schedule
        const sched = db.queryOne<ScheduleAssignment>(`
          SELECT * FROM schedule_assignments
          WHERE organization_id = ? AND employee_id = ? AND shift_date = ? AND status != 'CANCELLED'
          ORDER BY start_time ASC LIMIT 1
        `, [orgId, employeeId, todayStr]);

        if (sched) {
          const scheduledStartMs = new Date(sched.start_time).getTime();
          const actualStartMs = new Date(nowUtc).getTime();
          const diffMinutes = (actualStartMs - scheduledStartMs) / 60000;
          if (diffMinutes > 10) {
            anomalyFlags.push('LATE_ARRIVAL');
          }
        }

        db.execute(`
          INSERT INTO attendance_sessions (
            id, organization_id, employee_id, building_id, schedule_assignment_id,
            session_date, check_in_event_id, check_in_time, status, anomaly_flags, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
        `, [
          sessionId, orgId, employeeId, targetBuildingId, sched?.id || null,
          todayStr, eventId, nowUtc, JSON.stringify(anomalyFlags), nowUtc, nowUtc
        ]);

        const session = db.queryOne<AttendanceSession>('SELECT * FROM attendance_sessions WHERE id = ?', [sessionId])!;
        return { event: createdEvent, session, message: 'Check-in recorded successfully' };
      }

      // Handle Check-Out
      if (input.eventType === 'CHECK_OUT') {
        const openSession = db.queryOne<AttendanceSession>(`
          SELECT * FROM attendance_sessions
          WHERE organization_id = ? AND employee_id = ? AND status = 'OPEN'
          ORDER BY check_in_time DESC LIMIT 1
        `, [orgId, employeeId]);

        if (!openSession) {
          throw new Error('No open clock-in session found to check out from');
        }

        const checkInMs = new Date(openSession.check_in_time).getTime();
        const checkOutMs = new Date(nowUtc).getTime();
        const elapsedMinutes = Math.max(0, Math.round((checkOutMs - checkInMs) / 60000));

        // Deduct unpaid breaks
        const totalBreakMinutes = openSession.total_break_minutes || 0;
        const workMinutes = Math.max(0, elapsedMinutes - totalBreakMinutes);

        // Calculate regular vs overtime split
        const otRule = db.queryOne<OvertimeRule>('SELECT * FROM overtime_rules WHERE organization_id = ?', [orgId]);
        const dailyThresholdMinutes = otRule ? otRule.daily_threshold_hours * 60 : 480;

        const regularMinutes = Math.min(workMinutes, dailyThresholdMinutes);
        const overtimeMinutes = Math.max(0, workMinutes - dailyThresholdMinutes);

        let anomalies: string[] = [];
        try {
          anomalies = JSON.parse(openSession.anomaly_flags || '[]');
        } catch {
          anomalies = [];
        }

        if (isWithinGeofence === 0 && !anomalies.includes('OUTSIDE_GEOFENCE')) {
          anomalies.push('OUTSIDE_GEOFENCE');
        }

        db.execute(`
          UPDATE attendance_sessions SET
            check_out_event_id = ?,
            check_out_time = ?,
            total_work_minutes = ?,
            regular_minutes = ?,
            overtime_minutes = ?,
            status = 'COMPLETED',
            anomaly_flags = ?,
            updated_at = ?
          WHERE id = ?
        `, [
          eventId, nowUtc, workMinutes, regularMinutes, overtimeMinutes,
          JSON.stringify(anomalies), nowUtc, openSession.id
        ]);

        const session = db.queryOne<AttendanceSession>('SELECT * FROM attendance_sessions WHERE id = ?', [openSession.id])!;
        return { event: createdEvent, session, message: 'Check-out recorded successfully' };
      }

      // Handle Break Start
      if (input.eventType === 'BREAK_START') {
        const openSession = db.queryOne<AttendanceSession>(`
          SELECT * FROM attendance_sessions
          WHERE organization_id = ? AND employee_id = ? AND status = 'OPEN'
        `, [orgId, employeeId]);

        if (!openSession) throw new Error('Cannot start break without an active open session');

        const breakId = uuidv4();
        db.execute(`
          INSERT INTO breaks (id, organization_id, attendance_session_id, break_start_event_id, start_time, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [breakId, orgId, openSession.id, eventId, nowUtc, nowUtc, nowUtc]);

        return { event: createdEvent, session: openSession, message: 'Break started' };
      }

      // Handle Break End
      if (input.eventType === 'BREAK_END') {
        const openSession = db.queryOne<AttendanceSession>(`
          SELECT * FROM attendance_sessions
          WHERE organization_id = ? AND employee_id = ? AND status = 'OPEN'
        `, [orgId, employeeId]);

        if (!openSession) throw new Error('Cannot end break without an active open session');

        const activeBreak = db.queryOne<Break>(`
          SELECT * FROM breaks
          WHERE attendance_session_id = ? AND end_time IS NULL
          ORDER BY start_time DESC LIMIT 1
        `, [openSession.id]);

        if (!activeBreak) throw new Error('No active break found to end');

        const startMs = new Date(activeBreak.start_time).getTime();
        const endMs = new Date(nowUtc).getTime();
        const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

        db.execute(`
          UPDATE breaks SET
            break_end_event_id = ?,
            end_time = ?,
            duration_minutes = ?,
            updated_at = ?
          WHERE id = ?
        `, [eventId, nowUtc, durationMinutes, nowUtc, activeBreak.id]);

        db.execute(`
          UPDATE attendance_sessions SET
            total_break_minutes = total_break_minutes + ?,
            updated_at = ?
          WHERE id = ?
        `, [durationMinutes, nowUtc, openSession.id]);

        const updatedSession = db.queryOne<AttendanceSession>('SELECT * FROM attendance_sessions WHERE id = ?', [openSession.id])!;
        return { event: createdEvent, session: updatedSession, message: 'Break ended' };
      }

      return { event: createdEvent, message: 'Event logged' };
    });
  }

  /**
   * Process incoming punch from a physical Biometric Hardware Terminal
   */
  public static processDevicePunch(orgId: string, punch: DevicePunchLog): AttendanceEvent {
    const device = db.queryOne<BiometricDevice>(`
      SELECT * FROM biometric_devices
      WHERE organization_id = ? AND device_identifier = ?
    `, [orgId, punch.deviceIdentifier]);

    if (!device) throw new Error(`Unregistered biometric device: ${punch.deviceIdentifier}`);

    const enrollment = db.queryOne<{ employee_id: string }>(`
      SELECT employee_id FROM employee_device_enrollments
      WHERE organization_id = ? AND device_id = ? AND biometric_pin_or_card = ?
    `, [orgId, device.id, punch.biometricPinOrCard]);

    if (!enrollment) {
      throw new Error(`Unrecognized biometric PIN/Card '${punch.biometricPinOrCard}' on device ${device.name}`);
    }

    const eventResult = this.processMobilePunch({
      organizationId: orgId,
      employeeId: enrollment.employee_id,
      eventType: punch.punchType,
      buildingId: device.building_id,
      biometricVerified: true,
      timestamp: punch.punchTime,
      clientEventId: `DEV-${punch.rawPunchId}`
    });

    // Update device event processed state
    db.execute(`
      INSERT INTO biometric_device_events (id, organization_id, device_id, raw_punch_id, employee_pin_or_card, event_time, event_type, is_processed, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [uuidv4(), orgId, device.id, punch.rawPunchId, punch.biometricPinOrCard, punch.punchTime, punch.punchType, new Date().toISOString()]);

    return eventResult.event;
  }

  /**
   * Administrative Attendance Adjustment (Preserves immutable punch history)
   */
  public static adjustSession(
    orgId: string,
    actorUserId: string,
    input: AdminAdjustmentInput
  ): AttendanceSession {
    const existing = db.queryOne<AttendanceSession>(
      'SELECT * FROM attendance_sessions WHERE organization_id = ? AND id = ?',
      [orgId, input.sessionId]
    );

    if (!existing) throw new Error('Attendance session not found');

    const now = new Date().toISOString();
    const adjEventId = uuidv4();

    return db.transaction(() => {
      // 1. Record immutable adjustment event
      db.execute(`
        INSERT INTO attendance_events (
          id, organization_id, employee_id, event_type, source, timestamp, received_at,
          building_id, auth_method, sync_status, raw_payload
        ) VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', 'ADMIN_MANUAL', ?, ?, ?, 'ADMIN_OVERRIDE', 'SYNCED', ?)
      `, [
        adjEventId, orgId, existing.employee_id, now, now, existing.building_id,
        JSON.stringify({ reason: input.reason, before: existing, adjustments: input })
      ]);

      const checkIn = input.checkInTime || existing.check_in_time;
      const checkOut = input.checkOutTime || existing.check_out_time;
      let regularMin = input.regularMinutes !== undefined ? input.regularMinutes : existing.regular_minutes;
      let overtimeMin = input.overtimeMinutes !== undefined ? input.overtimeMinutes : existing.overtime_minutes;
      const totalWork = regularMin + overtimeMin;

      let flags: string[] = [];
      try {
        flags = JSON.parse(existing.anomaly_flags || '[]');
      } catch {
        flags = [];
      }
      if (!flags.includes('ADJUSTED')) flags.push('ADJUSTED');

      db.execute(`
        UPDATE attendance_sessions SET
          check_in_time = ?,
          check_out_time = ?,
          regular_minutes = ?,
          overtime_minutes = ?,
          total_work_minutes = ?,
          status = 'ADJUSTED',
          anomaly_flags = ?,
          updated_at = ?
        WHERE id = ? AND organization_id = ?
      `, [
        checkIn, checkOut, regularMin, overtimeMin, totalWork,
        JSON.stringify(flags), now, input.sessionId, orgId
      ]);

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'ATTENDANCE.ADJUST',
        entityType: 'attendance_sessions',
        entityId: input.sessionId,
        beforeState: existing,
        afterState: { input, regularMin, overtimeMin, totalWork }
      });

      return db.queryOne<AttendanceSession>('SELECT * FROM attendance_sessions WHERE id = ?', [input.sessionId])!;
    });
  }

  /**
   * Get Live Attendance Dashboard / Overview for Today
   */
  public static getLiveAttendanceOverview(orgId: string, buildingId?: string) {
    const todayStr = new Date().toISOString().split('T')[0];

    let query = `
      SELECT 
        s.id, s.session_date, s.check_in_time, s.check_out_time, s.status,
        s.total_work_minutes, s.regular_minutes, s.overtime_minutes, s.anomaly_flags,
        e.id as employee_id, e.employee_code, e.first_name, e.last_name,
        b.id as building_id, b.name as building_name
      FROM attendance_sessions s
      JOIN employees e ON e.id = s.employee_id
      JOIN buildings b ON b.id = s.building_id
      WHERE s.organization_id = ? AND s.session_date = ?
    `;
    const params: any[] = [orgId, todayStr];

    if (buildingId) {
      query += ' AND s.building_id = ?';
      params.push(buildingId);
    }

    query += ' ORDER BY s.check_in_time DESC';
    return db.query(query, params);
  }
}
