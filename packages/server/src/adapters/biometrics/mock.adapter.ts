import { IBiometricDeviceAdapter, BiometricManufacturerType, DeviceConfig, DeviceStatusInfo, DevicePunchLog } from './adapter.interface.js';
import { v4 as uuidv4 } from 'uuid';

export class MockBiometricAdapter implements IBiometricDeviceAdapter {
  private isConnected: boolean = false;
  private mockLogs: DevicePunchLog[] = [];

  public getManufacturer(): BiometricManufacturerType {
    return 'MOCK';
  }

  public async connect(config: DeviceConfig): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  public async disconnect(): Promise<boolean> {
    this.isConnected = false;
    return true;
  }

  public async getDeviceStatus(config: DeviceConfig): Promise<DeviceStatusInfo> {
    return {
      isOnline: true,
      userCount: 45,
      fingerprintCount: 90,
      logCount: this.mockLogs.length,
      firmwareVersion: 'MOCK-FW-v2.4.1',
      lastHeartbeat: new Date().toISOString()
    };
  }

  public async enrollEmployee(config: DeviceConfig, employeePin: string, fullName: string): Promise<boolean> {
    return true;
  }

  public async removeEmployee(config: DeviceConfig, employeePin: string): Promise<boolean> {
    return true;
  }

  public async pullAttendanceLogs(config: DeviceConfig, sinceTimestamp?: Date): Promise<DevicePunchLog[]> {
    if (this.mockLogs.length === 0) {
      return [];
    }
    const logs = [...this.mockLogs];
    this.mockLogs = []; // Drained
    return logs;
  }

  /**
   * Helper to inject simulated punches during testing or staging
   */
  public simulatePunch(punch: Partial<DevicePunchLog>): DevicePunchLog {
    const fullPunch: DevicePunchLog = {
      rawPunchId: punch.rawPunchId || uuidv4(),
      deviceIdentifier: punch.deviceIdentifier || 'MOCK-DEV-01',
      biometricPinOrCard: punch.biometricPinOrCard || 'PIN-1001',
      punchTime: punch.punchTime || new Date().toISOString(),
      punchType: punch.punchType || 'CHECK_IN',
      verificationType: punch.verificationType || 'FINGERPRINT',
      isProcessed: false
    };
    this.mockLogs.push(fullPunch);
    return fullPunch;
  }
}
