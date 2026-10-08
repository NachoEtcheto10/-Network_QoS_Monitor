import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type TelephonyInfo = {
  /** Nombre del operador de red (o de la SIM si la red no lo informa). */
  carrier: string | null;
  mcc: string | null;
  mnc: string | null;
  /** Generación de la red de datos celular: '2g' | '3g' | '4g' | '5g' | 'unknown'. */
  networkType: string;
  /** Tecnología de radio concreta: 'LTE', 'HSPA+', 'NR', 'NR (NSA)', ... */
  radioTechnology: string | null;
  /** Intensidad de señal celular en dBm (RSSI en 2G/3G, RSRP en LTE/NR). */
  signalDbm: number | null;
  /** Nivel de señal celular normalizado por el sistema, de 0 a 4. */
  signalLevel: number | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  /** RSSI del WiFi asociado en dBm, o null si no hay WiFi. */
  wifiRssi: number | null;
  /** false cuando falta el permiso para leer el tipo de red celular. */
  hasPhonePermission: boolean;
};

export interface Spec extends TurboModule {
  getTelephonyInfo(): Promise<TelephonyInfo>;
}

export default TurboModuleRegistry.get<Spec>('NativeTelephony');
