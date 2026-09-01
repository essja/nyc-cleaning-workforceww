import { Router, Request, Response } from 'express';
import { EmployeesService } from './employees.service.js';
import { EmployeeImportService, RawImportRow } from './import.service.js';
import { authenticateToken, requireRoles } from '../../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createEmployeeSchema = z.object({
  employee_code: z.string().optional().default(''),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  password: z.string().optional(),
  department_id: z.string().optional(),
  position_id: z.string().optional(),
  manager_id: z.string().optional(),
  employment_type: z.enum(['HOURLY', 'SALARIED', 'CONTRACTOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional(),
  hire_date: z.string().optional(),
  hourly_rate: z.number().min(0).optional(),
  building_ids: z.array(z.string()).optional()
});

const resetPasswordSchema = z.object({
  password: z.string().min(6).optional()
});

// List employees
router.get('/', authenticateToken, (req: Request, res: Response) => {
  try {
    const departmentId = req.query.departmentId as string | undefined;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const buildingId = req.query.buildingId as string | undefined;

    const employees = EmployeesService.listEmployees(req.user!.orgId, {
      departmentId,
      status,
      search,
      buildingId
    });

    res.json({ employees });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch employees' });
  }
});

// Get full employee profile
router.get('/:id/full-profile', authenticateToken, (req: Request, res: Response) => {
  try {
    const profile = EmployeesService.getFullEmployeeProfile(req.user!.orgId, req.params.id as string);
    res.json(profile);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Employee not found' });
  }
});

// Get single employee details
router.get('/:id', authenticateToken, (req: Request, res: Response) => {
  try {
    const details = EmployeesService.getEmployeeDetails(req.user!.orgId, req.params.id as string);
    res.json(details);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Employee not found' });
  }
});

// Create employee
router.post('/', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const input = createEmployeeSchema.parse(req.body);
    const employee = EmployeesService.createEmployee(req.user!.orgId, req.user!.userId, {
      ...input,
      email: input.email || undefined
    });
    res.status(201).json(employee);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create employee' });
  }
});

// Update employee
router.put('/:id', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const input = createEmployeeSchema.partial().parse(req.body);
    const employee = EmployeesService.updateEmployee(req.user!.orgId, req.user!.userId, req.params.id as string, {
      ...input,
      email: input.email || undefined
    });
    res.json(employee);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update employee' });
  }
});

// Reset employee password (Owner/Admin)
router.post('/:id/reset-password', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const result = EmployeesService.resetEmployeePassword(
      req.user!.orgId,
      req.user!.userId,
      req.params.id as string,
      parsed.password
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reset employee password' });
  }
});

// Delete employee (Testing & Management)
router.delete('/:id', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    EmployeesService.deleteEmployee(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Employee successfully deleted' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete employee' });
  }
});

// Archive employee
router.post('/:id/archive', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    EmployeesService.archiveEmployee(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Employee successfully archived' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to archive employee' });
  }
});

// Reactivate employee
router.post('/:id/reactivate', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    EmployeesService.reactivateEmployee(req.user!.orgId, req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Employee successfully reactivated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reactivate employee' });
  }
});

// Bulk Import — Validate & Preview
router.post('/import/validate', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const { rows, fileBase64, fileName } = req.body;
    let rawRows: RawImportRow[] = [];

    if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      rawRows = EmployeeImportService.parseBuffer(buffer, fileName || 'upload.xlsx');
    } else if (Array.isArray(rows)) {
      rawRows = rows;
    } else {
      res.status(400).json({ error: 'Either rows array or fileBase64 is required' });
      return;
    }

    const validation = EmployeeImportService.validateRows(req.user!.orgId, rawRows, fileName || 'import.csv');
    res.json(validation);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to validate import file' });
  }
});

// Bulk Import — Execute
router.post('/import/execute', authenticateToken, requireRoles('OWNER', 'ADMIN', 'HR_MANAGER'), (req: Request, res: Response) => {
  try {
    const { validRows, fileName, errors } = req.body;
    if (!Array.isArray(validRows) || validRows.length === 0) {
      res.status(400).json({ error: 'No valid rows to import' });
      return;
    }

    const summary = EmployeeImportService.executeImport(
      req.user!.orgId,
      req.user!.userId,
      validRows,
      fileName || 'bulk_import.xlsx',
      errors || []
    );

    res.json(summary);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to execute import' });
  }
});

export default router;
