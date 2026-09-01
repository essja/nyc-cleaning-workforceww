import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { db } from '../../db/index.js';
import {
  PayrollPeriod, PayrollRecord, OvertimeRule, Employee,
  PayRate, AttendanceSession
} from '../../db/types.js';
import { DeterministicPayrollEngine, CalculatedEmployeePayroll } from './payroll.engine.js';
import { AuditService } from '../audit/audit.service.js';

export interface CreatePayrollPeriodInput {
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
}

export class PayrollService {
  public static getOvertimeRules(orgId: string): OvertimeRule {
    let rules = db.queryOne<OvertimeRule>('SELECT * FROM overtime_rules WHERE organization_id = ?', [orgId]);
    if (!rules) {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.execute(`
        INSERT INTO overtime_rules (id, organization_id, daily_threshold_hours, weekly_threshold_hours, overtime_multiplier, created_at, updated_at)
        VALUES (?, ?, 8.0, 40.0, 1.5, ?, ?)
      `, [id, orgId, now, now]);
      rules = db.queryOne<OvertimeRule>('SELECT * FROM overtime_rules WHERE id = ?', [id])!;
    }
    return rules;
  }

  public static updateOvertimeRules(
    orgId: string,
    actorUserId: string,
    data: Partial<OvertimeRule>
  ): OvertimeRule {
    const existing = this.getOvertimeRules(orgId);
    const now = new Date().toISOString();

    db.execute(`
      UPDATE overtime_rules SET
        daily_threshold_hours = COALESCE(?, daily_threshold_hours),
        weekly_threshold_hours = COALESCE(?, weekly_threshold_hours),
        overtime_multiplier = COALESCE(?, overtime_multiplier),
        double_time_threshold_hours = COALESCE(?, double_time_threshold_hours),
        double_time_multiplier = COALESCE(?, double_time_multiplier),
        weekend_multiplier = COALESCE(?, weekend_multiplier),
        holiday_multiplier = COALESCE(?, holiday_multiplier),
        updated_at = ?
      WHERE organization_id = ?
    `, [
      data.daily_threshold_hours ?? null,
      data.weekly_threshold_hours ?? null,
      data.overtime_multiplier ?? null,
      data.double_time_threshold_hours ?? null,
      data.double_time_multiplier ?? null,
      data.weekend_multiplier ?? null,
      data.holiday_multiplier ?? null,
      now, orgId
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'PAYROLL.RULES_UPDATE',
      entityType: 'overtime_rules',
      entityId: existing.id,
      beforeState: existing,
      afterState: data
    });

    return this.getOvertimeRules(orgId);
  }

  public static listPayrollPeriods(orgId: string): PayrollPeriod[] {
    return db.query<PayrollPeriod>(
      'SELECT * FROM payroll_periods WHERE organization_id = ? ORDER BY start_date DESC',
      [orgId]
    );
  }

  public static createPayrollPeriod(
    orgId: string,
    actorUserId: string,
    input: CreatePayrollPeriodInput
  ): PayrollPeriod {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.execute(`
      INSERT INTO payroll_periods (id, organization_id, name, start_date, end_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `, [id, orgId, input.name, input.startDate, input.endDate, now, now]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'PAYROLL.PERIOD_CREATE',
      entityType: 'payroll_periods',
      entityId: id,
      afterState: input
    });

    return db.queryOne<PayrollPeriod>('SELECT * FROM payroll_periods WHERE id = ?', [id])!;
  }

  /**
   * Run deterministic payroll calculation for all active employees in period
   */
  public static calculatePeriod(orgId: string, actorUserId: string, periodId: string) {
    const period = db.queryOne<PayrollPeriod>(
      'SELECT * FROM payroll_periods WHERE organization_id = ? AND id = ?',
      [orgId, periodId]
    );
    if (!period) throw new Error('Payroll period not found');

    const rules = this.getOvertimeRules(orgId);
    const employees = db.query<Employee>('SELECT * FROM employees WHERE organization_id = ? AND status = ?', [orgId, 'ACTIVE']);
    const now = new Date().toISOString();

    return db.transaction(() => {
      // Clear prior calculated records for this period
      db.execute('DELETE FROM payroll_records WHERE payroll_period_id = ?', [periodId]);

      const calculatedResults: CalculatedEmployeePayroll[] = [];

      for (const emp of employees) {
        // Fetch sessions within period
        const sessions = db.query<AttendanceSession>(`
          SELECT * FROM attendance_sessions
          WHERE organization_id = ? AND employee_id = ?
            AND session_date >= ? AND session_date <= ?
            AND status IN ('COMPLETED', 'ADJUSTED')
        `, [orgId, emp.id, period.start_date, period.end_date]);

        // Get effective pay rate
        const payRateRecord = db.queryOne<PayRate>(`
          SELECT hourly_rate FROM pay_rates
          WHERE organization_id = ? AND employee_id = ?
          ORDER BY effective_from DESC LIMIT 1
        `, [orgId, emp.id]);

        const rate = payRateRecord?.hourly_rate || 0;
        const result = DeterministicPayrollEngine.calculate(emp.id, sessions, rate, rules);
        calculatedResults.push(result);

        // Insert record
        db.execute(`
          INSERT INTO payroll_records (
            id, organization_id, payroll_period_id, employee_id, regular_hours,
            overtime_hours, double_time_hours, hourly_rate, regular_pay,
            overtime_pay, double_time_pay, gross_pay, breakdown_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `, [
          uuidv4(), orgId, periodId, emp.id, result.regularHours,
          result.overtimeHours, result.doubleTimeHours, result.hourlyRate,
          result.regularPay, result.overtimePay, result.doubleTimePay,
          result.grossPay, JSON.stringify(result.breakdowns), now, now
        ]);
      }

      db.execute("UPDATE payroll_periods SET status = 'CALCULATED', updated_at = ? WHERE id = ?", [now, periodId]);

      AuditService.log({
        organizationId: orgId,
        actorUserId,
        action: 'PAYROLL.CALCULATE',
        entityType: 'payroll_periods',
        entityId: periodId,
        afterState: { processedEmployees: calculatedResults.length }
      });

      return this.getPeriodDetails(orgId, periodId);
    });
  }

  public static getPeriodDetails(orgId: string, periodId: string) {
    const period = db.queryOne<PayrollPeriod>(
      'SELECT * FROM payroll_periods WHERE organization_id = ? AND id = ?',
      [orgId, periodId]
    );
    if (!period) throw new Error('Payroll period not found');

    const records = db.query<{
      id: string;
      employee_id: string;
      employee_code: string;
      first_name: string;
      last_name: string;
      regular_hours: number;
      overtime_hours: number;
      double_time_hours: number;
      hourly_rate: number;
      regular_pay: number;
      overtime_pay: number;
      double_time_pay: number;
      gross_pay: number;
      breakdown_json: string;
      status: string;
    }>(`
      SELECT 
        pr.*, e.employee_code, e.first_name, e.last_name
      FROM payroll_records pr
      JOIN employees e ON e.id = pr.employee_id
      WHERE pr.organization_id = ? AND pr.payroll_period_id = ?
      ORDER BY e.last_name ASC, e.first_name ASC
    `, [orgId, periodId]);

    const totalGross = records.reduce((sum, r) => sum + r.gross_pay, 0);
    const totalRegularHours = records.reduce((sum, r) => sum + r.regular_hours, 0);
    const totalOvertimeHours = records.reduce((sum, r) => sum + r.overtime_hours, 0);

    return {
      period,
      records,
      summary: {
        totalEmployees: records.length,
        totalRegularHours: Math.round(totalRegularHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        totalGrossPay: Math.round(totalGross * 100) / 100
      }
    };
  }

  public static approvePeriod(orgId: string, actorUserId: string, periodId: string) {
    const now = new Date().toISOString();
    db.execute(`
      UPDATE payroll_periods SET status = 'APPROVED', approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [actorUserId, now, now, periodId, orgId]);

    db.execute(`
      UPDATE payroll_records SET status = 'APPROVED', updated_at = ?
      WHERE payroll_period_id = ? AND organization_id = ?
    `, [now, periodId, orgId]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'PAYROLL.APPROVE',
      entityType: 'payroll_periods',
      entityId: periodId
    });

    return this.getPeriodDetails(orgId, periodId);
  }

  /**
   * Generates Excel workbook buffer for payroll register
   */
  public static exportToExcel(orgId: string, periodId: string): Buffer {
    const details = this.getPeriodDetails(orgId, periodId);
    const rows = details.records.map((r) => ({
      'Employee Code': r.employee_code,
      'Employee Name': `${r.first_name} ${r.last_name}`,
      'Hourly Rate ($)': r.hourly_rate,
      'Regular Hours': r.regular_hours,
      'Overtime Hours': r.overtime_hours,
      'Double Time Hours': r.double_time_hours,
      'Regular Pay ($)': r.regular_pay,
      'Overtime Pay ($)': r.overtime_pay,
      'Double Time Pay ($)': r.double_time_pay,
      'Gross Pay ($)': r.gross_pay,
      'Status': r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payroll Summary');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
