import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Master End-to-End Workflow & Multi-Domain System Verification', () => {
  let app: any;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;
  let buildingId: string;

  beforeEach(async () => {
    await seedDatabase();
    app = createApp();

    // 1. Admin Login (Apex Facility Solutions)
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!', orgSlug: 'apex-facility' });
    adminToken = adminLogin.body.accessToken;

    // 2. Employee Login (John Doe)
    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'john.doe@apex.com', password: 'Password123!', orgSlug: 'apex-facility' });
    employeeToken = empLogin.body.accessToken;
    employeeId = empLogin.body.user.employeeId;

    // 3. Get building ID (Downtown Medical Plaza)
    const bldRes = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`);
    buildingId = bldRes.body.buildings[0].id;
  });

  it('should execute full lifecycle: Import -> Schedule -> Biometric & Geofenced Mobile Punch -> Breaks -> Checkout -> Payroll Calculation & Export', async () => {
    // Step 1: Bulk import a new employee
    const importRes = await request(app)
      .post('/api/v1/employees/import/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        validRows: [
          {
            employee_id: 'ROSTER-501',
            first_name: 'Daniel',
            last_name: 'Craig',
            email: 'daniel.craig@apex.com',
            department: 'Commercial Cleaning',
            position: 'Lead Sanitizer',
            pay_type: 'HOURLY',
            pay_rate: 22.00
          }
        ],
        fileName: 'new_hire_roster.xlsx'
      });

    expect(importRes.status).toBe(200);
    expect(importRes.body.importedRows).toBe(1);

    // Step 2: Schedule John Doe for today at Downtown Medical Plaza
    const todayStr = new Date().toISOString().split('T')[0];
    const schedRes = await request(app)
      .post('/api/v1/schedules/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_id: employeeId,
        building_id: buildingId,
        shift_date: todayStr,
        start_time: `${todayStr}T08:00:00Z`,
        end_time: `${todayStr}T17:00:00Z`,
        force: true
      });

    expect(schedRes.status).toBe(201);

    // Step 3: John Doe clocks in via mobile app (with Biometrics + GPS inside building perimeter)
    const checkInRes = await request(app)
      .post('/api/v1/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        eventType: 'CHECK_IN',
        latitude: 40.71281, // 10m from Downtown Medical Plaza
        longitude: -74.00601,
        accuracyMeters: 5.0,
        biometricVerified: true,
        buildingId: buildingId,
        clientEventId: `CLIENT-${Date.now()}-IN`
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.event.is_within_geofence).toBe(1);
    expect(checkInRes.body.event.biometric_verified).toBe(1);
    expect(checkInRes.body.session.status).toBe('OPEN');

    // Step 4: Admin views Live Management Dashboard and sees John Doe present on site
    const liveDashboard = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(liveDashboard.status).toBe(200);
    expect(liveDashboard.body.metrics.currentlyWorking).toBeGreaterThanOrEqual(1);

    // Step 5: John Doe starts and ends a 30-min break
    const breakStart = await request(app)
      .post('/api/v1/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ eventType: 'BREAK_START' });
    expect(breakStart.status).toBe(200);

    const breakEnd = await request(app)
      .post('/api/v1/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ eventType: 'BREAK_END' });
    expect(breakEnd.status).toBe(200);

    // Step 6: John Doe clocks out at end of shift (Simulating 9 hours total, 30 min break = 8.5h work -> 8h reg + 0.5h overtime)
    const checkOutTime = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
    const checkOutRes = await request(app)
      .post('/api/v1/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        eventType: 'CHECK_OUT',
        latitude: 40.71280,
        longitude: -74.00600,
        biometricVerified: true,
        timestamp: checkOutTime,
        clientEventId: `CLIENT-${Date.now()}-OUT`
      });

    expect(checkOutRes.status).toBe(200);
    expect(checkOutRes.body.session.status).toBe('COMPLETED');
    expect(checkOutRes.body.session.regular_minutes).toBeGreaterThan(0);

    // Step 7: Create and Calculate Payroll Period
    const periodRes = await request(app)
      .post('/api/v1/payroll/periods')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Current Operational Pay Period',
        startDate: '2020-01-01',
        endDate: '2030-12-31'
      });

    const periodId = periodRes.body.period.id;

    const calcRes = await request(app)
      .post(`/api/v1/payroll/periods/${periodId}/calculate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(calcRes.status).toBe(200);
    expect(calcRes.body.summary.totalGrossPay).toBeGreaterThan(0);

    // Step 8: Approve Payroll Period
    const approveRes = await request(app)
      .post(`/api/v1/payroll/periods/${periodId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.period.status).toBe('APPROVED');

    // Step 9: Export Payroll Excel Spreadsheet
    const exportRes = await request(app)
      .get(`/api/v1/payroll/periods/${periodId}/export`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('spreadsheetml');
  });

  it('should support offline-first batch synchronization with duplicate deduplication', async () => {
    const offlineEvent1Id = `OFFLINE-EVT-001-${Date.now()}`;
    const offlineEvent2Id = `OFFLINE-EVT-002-${Date.now()}`;
    const dateStr = '2026-09-10';

    const syncBatchPayload = {
      clientId: 'MOBILE-DEVICE-IPHONE-15',
      sourceType: 'MOBILE_APP' as const,
      events: [
        {
          employeeId: employeeId,
          eventType: 'CHECK_IN' as const,
          timestamp: `${dateStr}T08:00:00Z`,
          buildingId: buildingId,
          latitude: 40.71280,
          longitude: -74.00600,
          biometricVerified: true,
          clientEventId: offlineEvent1Id
        },
        {
          employeeId: employeeId,
          eventType: 'CHECK_OUT' as const,
          timestamp: `${dateStr}T16:30:00Z`,
          buildingId: buildingId,
          latitude: 40.71280,
          longitude: -74.00600,
          biometricVerified: true,
          clientEventId: offlineEvent2Id
        }
      ]
    };

    // First batch dispatch
    const syncRes1 = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(syncBatchPayload);

    expect(syncRes1.status).toBe(200);
    expect(syncRes1.body.successfullyProcessed).toBe(2);
    expect(syncRes1.body.duplicatesSkipped).toBe(0);

    // Repeated dispatch (simulating network retry upon reconnect) -> Must skip duplicates without failing
    const syncRes2 = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(syncBatchPayload);

    expect(syncRes2.status).toBe(200);
    expect(syncRes2.body.duplicatesSkipped).toBe(2);
  });

  it('should ingest physical biometric terminal punch correctly', async () => {
    const devPunchRes = await request(app)
      .post('/api/v1/attendance/device-punch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        deviceIdentifier: 'ZKT-DMP-01',
        biometricPinOrCard: 'PIN-1001', // John Doe
        punchType: 'CHECK_IN',
        punchTime: new Date().toISOString()
      });

    expect(devPunchRes.status).toBe(200);
    expect(devPunchRes.body.event.source).toBe('MOBILE_APP'); // Processed through engine
    expect(devPunchRes.body.event.biometric_verified).toBe(1);
  });
});
