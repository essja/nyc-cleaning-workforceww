import { AttendanceSession, PayRate, OvertimeRule } from '../../db/types.js';

export interface DailyWorkBreakdown {
  date: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  doubleTimeMinutes: number;
}

export interface CalculatedEmployeePayroll {
  employeeId: string;
  hourlyRate: number;
  totalWorkHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  regularPay: number;
  overtimePay: number;
  doubleTimePay: number;
  grossPay: number;
  breakdowns: DailyWorkBreakdown[];
}

export class DeterministicPayrollEngine {
  /**
   * Calculates deterministic payroll for an employee across a set of attendance sessions
   */
  public static calculate(
    employeeId: string,
    sessions: AttendanceSession[],
    payRate: number,
    rules: OvertimeRule
  ): CalculatedEmployeePayroll {
    const dailyThresholdMin = (rules.daily_threshold_hours || 8.0) * 60;
    const weeklyThresholdMin = (rules.weekly_threshold_hours || 40.0) * 60;
    const doubleTimeThresholdMin = (rules.double_time_threshold_hours || 12.0) * 60;
    const otMultiplier = rules.overtime_multiplier || 1.5;
    const dtMultiplier = rules.double_time_multiplier || 2.0;

    // Group sessions by session_date
    const sessionsByDate = new Map<string, AttendanceSession[]>();
    for (const s of sessions) {
      const list = sessionsByDate.get(s.session_date) || [];
      list.push(s);
      sessionsByDate.set(s.session_date, list);
    }

    const breakdowns: DailyWorkBreakdown[] = [];
    let accumulatedWeeklyRegularMin = 0;
    let totalRegularMin = 0;
    let totalOvertimeMin = 0;
    let totalDoubleTimeMin = 0;
    let totalWorkMin = 0;

    // Sort dates chronologically
    const sortedDates = Array.from(sessionsByDate.keys()).sort();

    for (const date of sortedDates) {
      const daySessions = sessionsByDate.get(date)!;
      let dayWorkMin = 0;
      let dayBreakMin = 0;

      for (const s of daySessions) {
        dayWorkMin += s.total_work_minutes;
        dayBreakMin += s.total_break_minutes;
      }

      totalWorkMin += dayWorkMin;

      // 1. Calculate Daily Double Time
      let dayDtMin = 0;
      if (doubleTimeThresholdMin > 0 && dayWorkMin > doubleTimeThresholdMin) {
        dayDtMin = dayWorkMin - doubleTimeThresholdMin;
      }

      // 2. Calculate Daily Overtime (between daily threshold and double-time threshold)
      const nonDtWorkMin = dayWorkMin - dayDtMin;
      let dayOtMin = 0;
      let dayRegMin = 0;

      if (nonDtWorkMin > dailyThresholdMin) {
        dayOtMin = nonDtWorkMin - dailyThresholdMin;
        dayRegMin = dailyThresholdMin;
      } else {
        dayRegMin = nonDtWorkMin;
      }

      // 3. Apply Weekly Overtime Threshold
      // If adding today's regular minutes exceeds weekly 40h threshold, shift excess to overtime
      if (accumulatedWeeklyRegularMin + dayRegMin > weeklyThresholdMin) {
        const remainingRegAllowed = Math.max(0, weeklyThresholdMin - accumulatedWeeklyRegularMin);
        const weeklyExcess = dayRegMin - remainingRegAllowed;

        dayRegMin = remainingRegAllowed;
        dayOtMin += weeklyExcess;
        accumulatedWeeklyRegularMin = weeklyThresholdMin;
      } else {
        accumulatedWeeklyRegularMin += dayRegMin;
      }

      totalRegularMin += dayRegMin;
      totalOvertimeMin += dayOtMin;
      totalDoubleTimeMin += dayDtMin;

      breakdowns.push({
        date,
        totalWorkMinutes: dayWorkMin,
        totalBreakMinutes: dayBreakMin,
        regularMinutes: dayRegMin,
        overtimeMinutes: dayOtMin,
        doubleTimeMinutes: dayDtMin
      });
    }

    const regularHours = Math.round((totalRegularMin / 60) * 100) / 100;
    const overtimeHours = Math.round((totalOvertimeMin / 60) * 100) / 100;
    const doubleTimeHours = Math.round((totalDoubleTimeMin / 60) * 100) / 100;
    const totalWorkHours = Math.round((totalWorkMin / 60) * 100) / 100;

    const regularPay = Math.round(regularHours * payRate * 100) / 100;
    const overtimePay = Math.round(overtimeHours * payRate * otMultiplier * 100) / 100;
    const doubleTimePay = Math.round(doubleTimeHours * payRate * dtMultiplier * 100) / 100;
    const grossPay = Math.round((regularPay + overtimePay + doubleTimePay) * 100) / 100;

    return {
      employeeId,
      hourlyRate: payRate,
      totalWorkHours,
      regularHours,
      overtimeHours,
      doubleTimeHours,
      regularPay,
      overtimePay,
      doubleTimePay,
      grossPay,
      breakdowns
    };
  }
}
