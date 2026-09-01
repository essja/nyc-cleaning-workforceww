import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 4 — Company, Buildings, Real Map & Geofencing', () => {
  let app: any;
  let adminToken: string;
  let org2Token: string;

  beforeEach(async () => {
    await seedDatabase();
    app = createApp();

    // Log in as Apex Facility Admin (Org 1)
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!', orgSlug: 'apex-facility' });
    adminToken = loginRes.body.accessToken;

    // Log in as Prime Services Admin (Org 2)
    const org2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@primeservices.com', password: 'Password123!', orgSlug: 'prime-services' });
    org2Token = org2Login.body.accessToken;
  });

  it('should list all buildings for the organization with strict tenant isolation', async () => {
    // Apex should see 3 buildings
    const res1 = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res1.status).toBe(200);
    expect(res1.body.buildings.length).toBe(3);
    const names = res1.body.buildings.map((b: any) => b.name);
    expect(names).toContain('Downtown Medical Plaza');

    // Prime Services should see 1 building
    const res2 = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.buildings.length).toBe(1);
    expect(res2.body.buildings[0].name).toBe('Midwest Logistics Hub');
  });

  it('should fetch building details including assigned employees and devices', async () => {
    const listRes = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`);

    const bldId = listRes.body.buildings[0].id;

    const detailRes = await request(app)
      .get(`/api/v1/buildings/${bldId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.name).toBeDefined();
    expect(detailRes.body.geofence_radius_meters).toBeGreaterThan(0);
    expect(detailRes.body.assigned_employees).toBeDefined();
  });

  it('should allow admin to create, update, and archive a building', async () => {
    // 1. Create
    const createRes = await request(app)
      .post('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Queens Distribution Center',
        code: 'BLD-QDC',
        address_line1: '200 Queens Blvd',
        city: 'Queens',
        state_province: 'NY',
        postal_code: '11375',
        country: 'USA',
        latitude: 40.7282,
        longitude: -73.8448,
        geofence_radius_meters: 175
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    const newBldId = createRes.body.id;

    // 2. Update
    const updateRes = await request(app)
      .put(`/api/v1/buildings/${newBldId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        geofence_radius_meters: 220
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.geofence_radius_meters).toBe(220);

    // 3. Archive
    const archiveRes = await request(app)
      .delete(`/api/v1/buildings/${newBldId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(archiveRes.status).toBe(200);

    // Verify archived building is excluded from active list
    const listRes = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`);

    const found = listRes.body.buildings.find((b: any) => b.id === newBldId);
    expect(found).toBeUndefined();
  });

  it('should accurately evaluate geospatial distance and geofence status', async () => {
    const listRes = await request(app)
      .get('/api/v1/buildings')
      .set('Authorization', `Bearer ${adminToken}`);

    const downtownPlaza = listRes.body.buildings.find((b: any) => b.name === 'Downtown Medical Plaza');
    expect(downtownPlaza).toBeDefined();

    // 1. Employee standing 10 meters away from downtown plaza (40.7128, -74.0060)
    const insideRes = await request(app)
      .post(`/api/v1/buildings/${downtownPlaza.id}/verify-geofence`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        latitude: 40.71281,
        longitude: -74.00602
      });

    expect(insideRes.status).toBe(200);
    expect(insideRes.body.isWithin).toBe(true);
    expect(insideRes.body.distanceMeters).toBeLessThan(30);

    // 2. Employee in Times Square (approx 5km away)
    const outsideRes = await request(app)
      .post(`/api/v1/buildings/${downtownPlaza.id}/verify-geofence`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        latitude: 40.7580,
        longitude: -73.9855
      });

    expect(outsideRes.status).toBe(200);
    expect(outsideRes.body.isWithin).toBe(false);
    expect(outsideRes.body.distanceMeters).toBeGreaterThan(4000);
    expect(outsideRes.body.excessMeters).toBeGreaterThan(3000);
  });
});
