import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { runMigrations } from './db/migrate.js';
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

export function createApp() {
  const app = express();

  // Security & standard middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

  // Global 404 handler
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  return app;
}

export function startServer(port: number = 4000) {
  runMigrations();
  const app = createApp();
  return app.listen(port, () => {
    console.log(`🚀 Workforce Management Platform API running on http://localhost:${port}`);
  });
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.env.PORT || '4000', 10);
  startServer(port);
}
