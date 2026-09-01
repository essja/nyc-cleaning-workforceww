import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 5 — Employee Management & Bulk Spreadsheet Import', () => {
  let app: any;
  let adminToken: string;

  beforeEach(async () => {
    await seedDatabase();
    app = createApp();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!', orgSlug: 'apex-facility' });
    adminToken = loginRes.body.accessToken;
  });

  it('should list employees with optional search and department filter', async () => {
    const listRes = await request(app)
      .get('/api/v1/employees?search=John')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.employees.length).toBe(1);
    expect(listRes.body.employees[0].first_name).toBe('John');
  });

  it('should fetch complete employee details with pay rate and assigned buildings', async () => {
    const listRes = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    const empId = listRes.body.employees[0].id;

    const detailRes = await request(app)
      .get(`/api/v1/employees/${empId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.employee_code).toBeDefined();
    expect(detailRes.body.assigned_buildings).toBeDefined();
    expect(detailRes.body.current_pay_rate).toBeGreaterThan(0);
  });

  it('should create a new employee and prevent duplicate codes', async () => {
    // 1. Create unique employee
    const createRes = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_code: 'EMP-9001',
        first_name: 'Gabriel',
        last_name: 'Santos',
        email: 'gabriel.santos@apex.com',
        employment_type: 'HOURLY',
        hourly_rate: 22.50
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.current_pay_rate).toBe(22.50);

    // 2. Duplicate employee_code should be rejected
    const dupRes = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_code: 'EMP-9001',
        first_name: 'Another',
        last_name: 'Person'
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.error).toContain('already exists');
  });

  it('should validate bulk import rows and detect errors accurately', async () => {
    const importRows = [
      {
        employee_id: 'IMP-001',
        first_name: 'Alice',
        last_name: 'Walker',
        email: 'alice.w@apex.com',
        position: 'Window Cleaner',
        department: 'Exterior Services',
        pay_rate: 19.50
      },
      {
        employee_id: '', // Missing ID error
        first_name: 'Bob',
        last_name: 'Marley',
        email: 'bob@apex.com',
        pay_rate: 20.00
      },
      {
        employee_id: 'EMP-1001', // Already existing code error
        first_name: 'Duplicate',
        last_name: 'Code',
        email: 'dup@apex.com'
      },
      {
        employee_id: 'IMP-002',
        first_name: 'Charlie',
        last_name: 'Brown',
        email: 'invalid-email-address', // Invalid email error
        pay_rate: 'invalid-rate' // Invalid rate error
      }
    ];

    const validateRes = await request(app)
      .post('/api/v1/employees/import/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rows: importRows, fileName: 'test_roster.csv' });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.totalRows).toBe(4);
    expect(validateRes.body.validRowsCount).toBe(1);
    expect(validateRes.body.invalidRowsCount).toBe(3);
    expect(validateRes.body.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('should execute bulk import and auto-create departments and pay rates', async () => {
    const validRows = [
      {
        employee_id: 'BULK-101',
        first_name: 'Maya',
        last_name: 'Lin',
        email: 'maya.lin@apex.com',
        department: 'Special Operations',
        position: 'Sanitation Lead',
        pay_type: 'HOURLY',
        pay_rate: 25.00
      },
      {
        employee_id: 'BULK-102',
        first_name: 'Samuel',
        last_name: 'Green',
        email: 'sam.green@apex.com',
        department: 'Special Operations',
        position: 'General Technician',
        pay_type: 'HOURLY',
        pay_rate: 21.00
      }
    ];

    const execRes = await request(app)
      .post('/api/v1/employees/import/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ validRows, fileName: 'operations_staff.xlsx' });

    expect(execRes.status).toBe(200);
    expect(execRes.body.importedRows).toBe(2);
    expect(execRes.body.failedRows).toBe(0);

    // Verify imported employee exists in database
    const empRes = await request(app)
      .get('/api/v1/employees?search=Maya')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(empRes.body.employees.length).toBe(1);
    expect(empRes.body.employees[0].employee_code).toBe('BULK-101');
  });
});
