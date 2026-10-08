export type NetworkKind =
  | 'wifi'
  | '2g'
  | '3g'
  | '4g'
  | '5g'
  | 'ethernet'
  | 'none'
  | 'unknown';

export const NETWORK_KINDS: NetworkKind[] = [
  'wifi',
  '5g',
  '4g',
  '3g',
  '2g',
  'ethernet',
  'none',
  'unknown',
];

export const NETWORK_LABELS: Record<NetworkKind, string> = {
  wifi: 'WiFi',
  '2g': '2G',
  '3g': '3G',
  '4g': '4G/LTE',
  '5g': '5G NR',
  ethernet: 'Ethernet',
  none: 'Sin red',
  unknown: 'Desconocida',
};

export interface NetworkSnapshot {
  kind: NetworkKind;
  /** Tecnología de radio concreta ("LTE", "HSPA+", "NR (NSA)") cuando se conoce. */
  detail: string | null;
  carrier: string | null;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  /** RSSI (WiFi, 2G/3G) o RSRP (LTE/NR) en dBm. */
  signalDbm: number | null;
  /** Nivel de señal normalizado de 0 a 4. */
  signalLevel: number | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
}

export interface PingHost {
  id: string;
  label: string;
  host: string;
  port: number;
}

export interface RttStats {
  sent: number;
  received: number;
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  jitterMs: number | null;
  lossPct: number;
}

export interface PingResult extends RttStats {
  host: PingHost;
  /** RTT de cada sonda en ms; null si la sonda se perdió. */
  samples: (number | null)[];
}

export interface ThroughputResult {
  downMbps: number | null;
  upMbps: number | null;
  downBytes: number;
  upBytes: number;
  error: string | null;
}

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

export type MeasurementSource = 'foreground' | 'background';

export interface Measurement {
  id: string;
  sessionId: string;
  timestamp: number;
  source: MeasurementSource;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  netKind: NetworkKind;
  netDetail: string | null;
  carrier: string | null;
  connected: boolean;
  signalDbm: number | null;
  signalLevel: number | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  rttMin: number | null;
  rttAvg: number | null;
  rttMax: number | null;
  jitter: number | null;
  lossPct: number | null;
  downMbps: number | null;
  upMbps: number | null;
  /** Puntaje de calidad compuesto, de 0 (sin servicio) a 100. */
  quality: number;
  pings: PingResult[];
}

export type SessionKind = 'monitor' | 'single' | 'background';

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  kind: SessionKind;
  label: string;
  count: number;
}

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface HistoryFilter {
  /** Vacío = todos los tipos de red. */
  kinds: NetworkKind[];
  from: number | null;
  to: number | null;
  bounds: GeoBounds | null;
  sessionId?: string | null;
}

export interface DegradationThresholds {
  maxRttMs: number;
  maxLossPct: number;
  minDownMbps: number;
}

export interface Settings {
  hosts: PingHost[];
  backendUrl: string;
  pingCount: number;
  pingTimeoutMs: number;
  /** Intervalo entre muestras de una sesión de monitoreo, en segundos. */
  sampleIntervalSec: number;
  sessionThroughput: boolean;
  downloadMb: number;
  uploadMb: number;
  backgroundEnabled: boolean;
  backgroundIntervalMin: number;
  backgroundThroughput: boolean;
  notifyEnabled: boolean;
  thresholds: DegradationThresholds;
}

export type MeasurePhase =
  | 'idle'
  | 'network'
  | 'location'
  | 'ping'
  | 'download'
  | 'upload'
  | 'saving';
