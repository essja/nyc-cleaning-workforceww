import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 3 — Authentication & Role-Based Access Control (RBAC)', () => {
  let app: any;

  beforeEach(async () => {
    await seedDatabase();
    app = createApp();
  });

  it('should successfully log in with valid credentials and return tokens and permissions', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@apex.com',
        password: 'Password123!',
        orgSlug: 'apex-facility'
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@apex.com');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.permissions).toContain('employee:write');
    expect(res.body.organization.slug).toBe('apex-facility');
  });

  it('should reject login with incorrect password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@apex.com',
        password: 'WrongPassword999!'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('should verify authenticated /me endpoint with Bearer token', async () => {
    // 1. Log in as admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!' });

    const token = loginRes.body.accessToken;

    // 2. Fetch /me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('admin@apex.com');
    expect(meRes.body.user.role).toBe('ADMIN');
  });

  it('should reject /me endpoint when no token is provided', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('should allow Admin to invite a new user, and user to activate account', async () => {
    // 1. Log in as Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!' });
    const adminToken = loginRes.body.accessToken;

    // 2. Admin invites a new employee
    const inviteRes = await request(app)
      .post('/api/v1/auth/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'new.worker@apex.com',
        firstName: 'Michael',
        lastName: 'Scott',
        role: 'EMPLOYEE'
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invitationToken).toBeDefined();

    const invitationToken = inviteRes.body.invitationToken;

    // 3. User activates account
    const activateRes = await request(app)
      .post('/api/v1/auth/activate')
      .send({
        invitationToken,
        password: 'SecureNewPassword2026!'
      });

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.success).toBe(true);

    // 4. New user logs in with new password
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'new.worker@apex.com',
        password: 'SecureNewPassword2026!'
      });

    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.user.role).toBe('EMPLOYEE');
  });

  it('should prevent standard employees from inviting users (RBAC check)', async () => {
    // 1. Log in as John Doe (EMPLOYEE)
    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'john.doe@apex.com', password: 'Password123!' });

    const empToken = empLogin.body.accessToken;

    // 2. Employee attempts to invite another user
    const res = await request(app)
      .post('/api/v1/auth/invite')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        email: 'unauthorized@apex.com',
        firstName: 'Test',
        lastName: 'Fail',
        role: 'ADMIN'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Permission denied');
  });

  it('should refresh access token using valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!' });

    const refreshToken = loginRes.body.refreshToken;

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.user.email).toBe('admin@apex.com');
  });

  it('should enforce account suspension', async () => {
    // 1. Log in as Admin
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@apex.com', password: 'Password123!' });
    const adminToken = adminLogin.body.accessToken;

    // 2. Find John Doe's user ID
    const johnLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'john.doe@apex.com', password: 'Password123!' });
    const johnUserId = johnLogin.body.user.userId;

    // 3. Admin suspends John Doe
    const suspendRes = await request(app)
      .post(`/api/v1/auth/users/${johnUserId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(suspendRes.status).toBe(200);

    // 4. John Doe attempts to log in -> Should fail because membership is suspended
    const failedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'john.doe@apex.com', password: 'Password123!' });

    expect(failedLogin.status).toBe(400);
    expect(failedLogin.body.error).toContain('no active organization memberships');
  });
});
