import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 6 — Sunday-Saturday Scheduling & Workforce Assignment', () => {
  let app: any;
  let adminToken: string;
  let org2Token: string;

  beforeEach(async () => {
    await seedDatabase();
    app = createApp();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!', orgSlug: 'apex-facility' });
    adminToken = loginRes.body.accessToken;

    const org2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@primeservices.com', password: 'Password123!', orgSlug: 'prime-services' });
    org2Token = org2Login.body.accessToken;
  });

  it('should calculate work week start dynamically per organization (Sunday for Apex, Monday for Prime)', async () => {
    // 1. Apex work week range (start day: 0 = Sunday)
    const res1 = await request(app)
      .get('/api/v1/schedules/week-range?date=2026-08-29') // Saturday
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res1.status).toBe(200);
    // 2026-08-29 is Saturday, the Sunday of that week was 2026-08-23
    expect(res1.body.startDate).toBe('2026-08-23');
    expect(res1.body.endDate).toBe('2026-08-29');

    // 2. Prime Services work week range (start day: 1 = Monday)
    const res2 = await request(app)
      .get('/api/v1/schedules/week-range?date=2026-08-29')
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res2.status).toBe(200);
    // Monday of that week was 2026-08-24
    expect(res2.body.startDate).toBe('2026-08-24');
    expect(res2.body.endDate).toBe('2026-08-30');
  });

  it('should create and list shift templates', async () => {
    const createRes = await request(app)
      .post('/api/v1/schedules/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Weekend Floor Strip Shift',
        start_time: '07:00',
        end_time: '15:30',
        break_duration_minutes: 30,
        color: '#f59e0b'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe('Weekend Floor Strip Shift');

    const listRes = await request(app)
      .get('/api/v1/schedules/shifts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const names = listRes.body.shifts.map((s: any) => s.name);
    expect(names).toContain('Weekend Floor Strip Shift');
  });

  it('should detect overlapping shift conflict and prevent double booking', async () => {
    // 1. Get building and employee
    const empRes = await request(app).get('/api/v1/employees').set('Authorization', `Bearer ${adminToken}`);
    const bldRes = await request(app).get('/api/v1/buildings').set('Authorization', `Bearer ${adminToken}`);

    const empId = empRes.body.employees[0].id;
    const bld1Id = bldRes.body.buildings[0].id;
    const bld2Id = bldRes.body.buildings[1].id;

    const testDate = '2026-09-01';

    // 2. Schedule shift 1: 08:00 - 16:00 at Building 1
    const assign1 = await request(app)
      .post('/api/v1/schedules/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_id: empId,
        building_id: bld1Id,
        shift_date: testDate,
        start_time: `${testDate}T08:00:00Z`,
        end_time: `${testDate}T16:00:00Z`
      });

    expect(assign1.status).toBe(201);

    // 3. Attempt overlapping shift: 12:00 - 20:00 at Building 2 for same employee -> Should fail
    const assign2 = await request(app)
      .post('/api/v1/schedules/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_id: empId,
        building_id: bld2Id,
        shift_date: testDate,
        start_time: `${testDate}T12:00:00Z`,
        end_time: `${testDate}T20:00:00Z`
      });

    expect(assign2.status).toBe(400);
    expect(assign2.body.error).toContain('Schedule conflict');
  });

  it('should fetch weekly schedule grid for date range', async () => {
    const gridRes = await request(app)
      .get('/api/v1/schedules/grid?startDate=2024-01-01&endDate=2030-12-31')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(gridRes.status).toBe(200);
    expect(gridRes.body.assignments).toBeDefined();
    expect(gridRes.body.assignments.length).toBeGreaterThan(0);
    expect(gridRes.body.assignments[0].building_name).toBeDefined();
  });
});
