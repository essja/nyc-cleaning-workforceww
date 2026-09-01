import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workforce.enterprise',
  appName: 'Workforce Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  plugins: {
    Geolocation: {
      enableHighAccuracy: true
    }
  }
};

export default config;
