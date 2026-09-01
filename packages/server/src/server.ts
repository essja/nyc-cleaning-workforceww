import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import { initProductionDatabase } from './db/init-prod.js';
import { db } from './db/index.js';
import authRoutes from './modules/auth/auth.routes.js';
import buildingRoutes from './modules/buildings/buildings.routes.js';
import employeeRoutes from './modules/employees/employees.routes.js';
import schedulingRoutes from './modules/scheduling/scheduling.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import intelligenceRoutes from './modules/ai/intelligence.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Security & standard middleware
  app.use(helmet({
    contentSecurityPolicy: false // Allow OpenStreetMap tiles and client assets
  }));
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      service: 'enterprise-workforce-api',
      version: '1.0.0'
    });
  });

  // Mount API modules
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/buildings', buildingRoutes);
  app.use('/api/v1/employees', employeeRoutes);
  app.use('/api/v1/schedules', schedulingRoutes);
  app.use('/api/v1/attendance', attendanceRoutes);
  app.use('/api/v1/payroll', payrollRoutes);
  app.use('/api/v1/leave', leaveRoutes);
  app.use('/api/v1/reports', reportsRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/sync', syncRoutes);
  app.use('/api/v1/ai', intelligenceRoutes);

  // Serve static client frontend files in production
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    // Global 404 handler for API routes
    app.use('/api/*', (req, res) => {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
    });
  }

  return app;
}

export async function startServer(port: number = 4000) {
  runMigrations();

  // Auto-initialize clean NYC Cleaning & Maintenance company on fresh production startup
  try {
    const userCount = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    if (!userCount || userCount.count === 0) {
      console.log('🌱 Fresh deployment detected. Initializing NYC Cleaning and Maintenance for Ibrihim Jalloh...');
      await initProductionDatabase();
      console.log('✅ Master Admin provisioned: admin@nyccleaning.com / Password123!');
    }
  } catch (err) {
    console.error('⚠️ Database auto-initialization check warning:', err);
  }

  // One-time cleanup: remove any employee records where the linked user has OWNER role
  // This prevents the Owner from being counted or displayed as a cleaner/staff member
  try {
    db.execute(`
      DELETE FROM employees
      WHERE id IN (
        SELECT e.id FROM employees e
        INNER JOIN organization_users ou ON ou.user_id = e.user_id AND ou.organization_id = e.organization_id
        WHERE ou.role = 'OWNER'
      )
    `);
    console.log('✅ Owner employee record cleanup complete.');
  } catch (err) {
    console.error('⚠️ Owner cleanup warning (non-fatal):', err);
  }

  const app = createApp();
  return app.listen(port, () => {
    console.log(`🚀 Workforce Management Platform API running on http://localhost:${port}`);
  });
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.env.PORT || '4000', 10);
  startServer(port);
}
