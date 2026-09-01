export type BiometricManufacturerType = 'ZKTECO' | 'ANVIZ' | 'GENERIC_PULL' | 'MOCK';

export interface DevicePunchLog {
  rawPunchId: string;
  deviceIdentifier: string;
  biometricPinOrCard: string;
  punchTime: string; // UTC ISO
  punchType: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';
  verificationType: 'FINGERPRINT' | 'FACE' | 'CARD' | 'PIN';
  isProcessed?: boolean;
}

export interface DeviceConfig {
  deviceIdentifier: string;
  ipAddress?: string;
  port?: number;
  apiKeyOrSecret?: string;
  timeoutMs?: number;
}

export interface DeviceStatusInfo {
  isOnline: boolean;
  userCount?: number;
  fingerprintCount?: number;
  faceCount?: number;
  logCount?: number;
  firmwareVersion?: string;
  lastHeartbeat: string;
}

/**
 * Standard Hardware Abstraction Layer for Physical Biometric Terminals
 */
export interface IBiometricDeviceAdapter {
  getManufacturer(): BiometricManufacturerType;
  connect(config: DeviceConfig): Promise<boolean>;
  disconnect(): Promise<boolean>;
  getDeviceStatus(config: DeviceConfig): Promise<DeviceStatusInfo>;
  enrollEmployee(config: DeviceConfig, employeePin: string, fullName: string): Promise<boolean>;
  removeEmployee(config: DeviceConfig, employeePin: string): Promise<boolean>;
  pullAttendanceLogs(config: DeviceConfig, sinceTimestamp?: Date): Promise<DevicePunchLog[]>;
  clearAttendanceLogs?(config: DeviceConfig): Promise<boolean>;
}
