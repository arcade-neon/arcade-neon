import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.daytha.rivals',
  appName: 'Daytha Rivals',
  webDir: 'out', // <--- ASEGÚRATE DE QUE PONGA 'out'
  server: {
    androidScheme: 'https'
  }
};

export default config;