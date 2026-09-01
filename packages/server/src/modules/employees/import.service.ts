import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { AuditService } from '../audit/audit.service.js';
import { Employee, Department, Position } from '../../db/types.js';

export interface RawImportRow {
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  pay_type?: string;
  pay_rate?: string | number;
  status?: string;
  hire_date?: string;
}

export interface ValidationErrorItem {
  rowNumber: number;
  fieldName: string;
  rejectedValue: any;
  errorMessage: string;
}

export interface ImportValidationResult {
  importId: string;
  fileName: string;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  previewRows: (RawImportRow & { _isValid: boolean; _errors?: string[] })[];
  errors: ValidationErrorItem[];
  validRows: RawImportRow[];
}

export class EmployeeImportService {
  /**
   * Parses buffer from XLSX or CSV into raw object rows
   */
  public static parseBuffer(buffer: Buffer, fileName: string): RawImportRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('Uploaded spreadsheet has no sheets');

    const sheet = workbook.Sheets[firstSheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    // Normalize column headers
    return rawData.map((row) => {
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const cleanKey = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
        normalized[cleanKey] = typeof value === 'string' ? value.trim() : value;
      }

      return {
        employee_id: normalized.employee_id || normalized.employee_code || normalized.empid || normalized.id || '',
        first_name: normalized.first_name || normalized.firstname || normalized.first || '',
        last_name: normalized.last_name || normalized.lastname || normalized.last || '',
        email: normalized.email || normalized.email_address || '',
        phone: normalized.phone || normalized.phone_number || normalized.mobile || '',
        position: normalized.position || normalized.job_title || normalized.title || '',
        department: normalized.department || normalized.dept || '',
        pay_type: normalized.pay_type || normalized.paytype || 'HOURLY',
        pay_rate: normalized.pay_rate || normalized.payrate || normalized.rate || '',
        status: normalized.status || 'ACTIVE',
        hire_date: normalized.hire_date || normalized.hiredate || ''
      };
    });
  }

  /**
   * Validates raw rows against database and business rules
   */
  public static validateRows(orgId: string, rows: RawImportRow[], fileName: string): ImportValidationResult {
    const importId = uuidv4();
    const errors: ValidationErrorItem[] = [];
    const validRows: RawImportRow[] = [];
    const previewRows: (RawImportRow & { _isValid: boolean; _errors?: string[] })[] = [];

    // Pre-fetch existing employee codes and emails in this org
    const existingEmployees = db.query<Employee>('SELECT employee_code, email FROM employees WHERE organization_id = ?', [orgId]);
    const existingCodes = new Set(existingEmployees.map((e) => e.employee_code.toLowerCase()));
    const existingEmails = new Set(existingEmployees.filter((e) => e.email).map((e) => e.email!.toLowerCase()));

    const seenInFileCodes = new Set<string>();
    const seenInFileEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Line 1 is headers
      const rowErrors: string[] = [];

      // 1. Validate employee_id
      if (!row.employee_id) {
        const msg = 'Missing required Employee ID / Code';
        errors.push({ rowNumber: rowNum, fieldName: 'employee_id', rejectedValue: '', errorMessage: msg });
        rowErrors.push(msg);
      } else {
        const codeLower = row.employee_id.toLowerCase();
        if (existingCodes.has(codeLower)) {
          const msg = `Employee ID '${row.employee_id}' already exists in this organization`;
          errors.push({ rowNumber: rowNum, fieldName: 'employee_id', rejectedValue: row.employee_id, errorMessage: msg });
          rowErrors.push(msg);
        } else if (seenInFileCodes.has(codeLower)) {
          const msg = `Duplicate Employee ID '${row.employee_id}' within import file`;
          errors.push({ rowNumber: rowNum, fieldName: 'employee_id', rejectedValue: row.employee_id, errorMessage: msg });
          rowErrors.push(msg);
        } else {
          seenInFileCodes.add(codeLower);
        }
      }

      // 2. Validate first name & last name
      if (!row.first_name) {
        const msg = 'First name is required';
        errors.push({ rowNumber: rowNum, fieldName: 'first_name', rejectedValue: '', errorMessage: msg });
        rowErrors.push(msg);
      }
      if (!row.last_name) {
        const msg = 'Last name is required';
        errors.push({ rowNumber: rowNum, fieldName: 'last_name', rejectedValue: '', errorMessage: msg });
        rowErrors.push(msg);
      }

      // 3. Validate email
      if (row.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const emailLower = row.email.toLowerCase();
        if (!emailRegex.test(emailLower)) {
          const msg = `Invalid email format: '${row.email}'`;
          errors.push({ rowNumber: rowNum, fieldName: 'email', rejectedValue: row.email, errorMessage: msg });
          rowErrors.push(msg);
        } else if (existingEmails.has(emailLower)) {
          const msg = `Email '${row.email}' is already in use by another employee`;
          errors.push({ rowNumber: rowNum, fieldName: 'email', rejectedValue: row.email, errorMessage: msg });
          rowErrors.push(msg);
        } else if (seenInFileEmails.has(emailLower)) {
          const msg = `Duplicate email '${row.email}' within import file`;
          errors.push({ rowNumber: rowNum, fieldName: 'email', rejectedValue: row.email, errorMessage: msg });
          rowErrors.push(msg);
        } else {
          seenInFileEmails.add(emailLower);
        }
      }

      // 4. Validate pay rate
      if (row.pay_rate !== undefined && row.pay_rate !== '') {
        const rateNum = Number(row.pay_rate);
        if (isNaN(rateNum) || rateNum < 0) {
          const msg = `Pay rate must be a valid positive number: '${row.pay_rate}'`;
          errors.push({ rowNumber: rowNum, fieldName: 'pay_rate', rejectedValue: row.pay_rate, errorMessage: msg });
          rowErrors.push(msg);
        }
      }

      const isValid = rowErrors.length === 0;
      if (isValid) {
        validRows.push(row);
      }

      previewRows.push({
        ...row,
        _isValid: isValid,
        _errors: rowErrors.length > 0 ? rowErrors : undefined
      });
    }

    return {
      importId,
      fileName,
      totalRows: rows.length,
      validRowsCount: validRows.length,
      invalidRowsCount: rows.length - validRows.length,
      previewRows,
      errors,
      validRows
    };
  }

  /**
   * Executes database insertion of valid rows within an atomic transaction
   */
  public static executeImport(
    orgId: string,
    actorUserId: string,
    validRows: RawImportRow[],
    fileName: string,
    errors: ValidationErrorItem[] = []
  ): {
    importId: string;
    totalRows: number;
    importedRows: number;
    failedRows: number;
  } {
    const importId = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      // Record in imports table
      db.execute(`
        INSERT INTO imports (id, organization_id, type, file_name, total_rows, imported_rows, failed_rows, status, created_by, created_at)
        VALUES (?, ?, 'EMPLOYEES', ?, ?, ?, ?, 'COMPLETED', ?, ?)
      `, [
        importId, orgId, fileName, validRows.length + errors.length,
        validRows.length, errors.length, actorUserId, now
      ]);

      // Record any validation errors into import_errors table
      for (const err of errors) {
        db.execute(`
          INSERT INTO import_errors (id, import_id, row_number, field_name, rejected_value, error_message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(), importId, err.rowNumber, err.fieldName,
          String(err.rejectedValue ?? ''), err.errorMessage, now
        ]);
      }

      // Cache existing departments & positions
      const existingDepts = db.query<Department>('SELECT * FROM departments WHERE organization_id = ?', [orgId]);
      const deptMap = new Map<string, string>(existingDepts.map((d) => [d.name.toLowerCase(), d.id]));

      const existingPositions = db.query<Position>('SELECT * FROM positions WHERE organization_id = ?', [orgId]);
      const posMap = new Map<string, string>(existingPositions.map((p) => [p.title.toLowerCase(), p.id]));

      // Insert valid employees
      for (const row of validRows) {
        const empId = uuidv4();

        // Auto-create department if provided and doesn't exist
        let deptId: string | null = null;
        if (row.department) {
          const deptKey = row.department.trim().toLowerCase();
          if (deptMap.has(deptKey)) {
            deptId = deptMap.get(deptKey)!;
          } else {
            deptId = uuidv4();
            db.execute(`
              INSERT INTO departments (id, organization_id, name, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `, [deptId, orgId, row.department.trim(), now, now]);
            deptMap.set(deptKey, deptId);
          }
        }

        // Auto-create position if provided and doesn't exist
        let posId: string | null = null;
        if (row.position) {
          const posKey = row.position.trim().toLowerCase();
          if (posMap.has(posKey)) {
            posId = posMap.get(posKey)!;
          } else {
            posId = uuidv4();
            db.execute(`
              INSERT INTO positions (id, organization_id, department_id, title, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [posId, orgId, deptId, row.position.trim(), now, now]);
            posMap.set(posKey, posId);
          }
        }

        const normalizedPayType = ['HOURLY', 'SALARIED', 'CONTRACTOR'].includes(row.pay_type?.toUpperCase() || '')
          ? row.pay_type!.toUpperCase()
          : 'HOURLY';

        const normalizedStatus = ['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'].includes(row.status?.toUpperCase() || '')
          ? row.status!.toUpperCase()
          : 'ACTIVE';

        db.execute(`
          INSERT INTO employees (
            id, organization_id, employee_code, first_name, last_name,
            email, phone, department_id, position_id, employment_type,
            status, hire_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          empId, orgId, row.employee_id!.trim(), row.first_name!.trim(), row.last_name!.trim(),
          row.email?.toLowerCase().trim() || null, row.phone || null, deptId, posId,
          normalizedPayType, normalizedStatus, row.hire_date || now.split('T')[0], now, now
        ]);

        // Insert pay rate if provided
        if (row.pay_rate !== undefined && row.pay_rate !== '') {
          const rateNum = Number(row.pay_rate);
          if (!isNaN(rateNum) && rateNum > 0) {
            db.execute(`
              INSERT INTO pay_rates (id, organization_id, employee_id, hourly_rate, effective_from, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [uuidv4(), orgId, empId, rateNum, row.hire_date || now.split('T')[0], now, now]);
          }
        }
      }

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'EMPLOYEE.BULK_IMPORT',
        entityType: 'imports',
        entityId: importId,
        afterState: { imported: validRows.length, failed: errors.length, fileName }
      });
    });

    return {
      importId,
      totalRows: validRows.length + errors.length,
      importedRows: validRows.length,
      failedRows: errors.length
    };
  }
}
