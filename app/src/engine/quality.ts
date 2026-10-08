import type {
  DegradationThresholds,
  Measurement,
  NetworkKind,
} from '../types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** 1 cuando value <= best, 0 cuando value >= worst, lineal en el medio. */
const lowerIsBetter = (value: number, best: number, worst: number) =>
  clamp01((worst - value) / (worst - best));

/** Escala logarítmica: 0 en `floor`, 1 en `ceiling`. */
const logScale = (value: number, floor: number, ceiling: number) =>
  value <= 0
    ? 0
    : clamp01(Math.log10(value / floor) / Math.log10(ceiling / floor));

export const latencyScore = (rttMs: number) => lowerIsBetter(rttMs, 30, 400);
export const jitterScore = (jitterMs: number) => lowerIsBetter(jitterMs, 5, 100);
export const lossScore = (lossPct: number) => lowerIsBetter(lossPct, 0, 20);
export const downloadScore = (mbps: number) => logScale(mbps, 0.5, 50);
export const uploadScore = (mbps: number) => logScale(mbps, 0.25, 20);

/**
 * Normaliza la intensidad de señal a 0..1. Los rangos dependen de qué mide el
 * dBm en cada tecnología: RSSI en WiFi y 2G/3G, RSRP en LTE/NR (que es
 * típicamente unos 20-30 dB más bajo que el RSSI para la misma cobertura).
 */
export function signalScore(
  dbm: number | null,
  level: number | null,
  kind: NetworkKind,
): number | null {
  if (dbm !== null) {
    if (kind === 'wifi') {
      return clamp01((dbm + 90) / 40);
    }
    if (kind === '4g' || kind === '5g') {
      return clamp01((dbm + 120) / 40);
    }
    return clamp01((dbm + 110) / 40);
  }
  if (level !== null) {
    return clamp01(level / 4);
  }
  return null;
}

export interface QualityInput {
  connected: boolean;
  netKind: NetworkKind;
  rttAvg: number | null;
  jitter: number | null;
  lossPct: number | null;
  downMbps: number | null;
  upMbps: number | null;
  signalDbm: number | null;
  signalLevel: number | null;
}

/**
 * Puntaje compuesto 0..100. Es un promedio ponderado de los componentes que
 * efectivamente se midieron, de modo que una medición sin test de throughput
 * (p. ej. en background) sigue siendo comparable con una completa.
 */
export function computeQuality(input: QualityInput): number {
  if (!input.connected) {
    return 0;
  }
  // Conectado pero ninguna sonda respondió: no hay servicio útil.
  if (input.lossPct !== null && input.lossPct >= 100) {
    return 0;
  }

  const parts: [number | null, number][] = [
    [input.rttAvg !== null ? latencyScore(input.rttAvg) : null, 0.3],
    [input.lossPct !== null ? lossScore(input.lossPct) : null, 0.2],
    [input.jitter !== null ? jitterScore(input.jitter) : null, 0.1],
    [input.downMbps !== null ? downloadScore(input.downMbps) : null, 0.2],
    [input.upMbps !== null ? uploadScore(input.upMbps) : null, 0.1],
    [signalScore(input.signalDbm, input.signalLevel, input.netKind), 0.1],
  ];

  let weighted = 0;
  let totalWeight = 0;
  for (const [score, weight] of parts) {
    if (score !== null) {
      weighted += score * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) {
    return 0;
  }
  return Math.round((weighted / totalWeight) * 100);
}

export interface QualityBand {
  label: string;
  color: string;
}

const BANDS: { min: number; band: QualityBand }[] = [
  { min: 80, band: { label: 'Excelente', color: '#22c55e' } },
  { min: 60, band: { label: 'Buena', color: '#84cc16' } },
  { min: 40, band: { label: 'Regular', color: '#eab308' } },
  { min: 20, band: { label: 'Mala', color: '#f97316' } },
  { min: 0, band: { label: 'Crítica', color: '#ef4444' } },
];

export function qualityBand(quality: number): QualityBand {
  return (BANDS.find(b => quality >= b.min) ?? BANDS[BANDS.length - 1]).band;
}

/**
 * Devuelve los motivos por los que una medición se considera una degradación
 * severa (lista vacía = todo dentro de los umbrales).
 */
export function detectDegradation(
  m: Pick<
    Measurement,
    'connected' | 'rttAvg' | 'lossPct' | 'downMbps'
  >,
  thresholds: DegradationThresholds,
): string[] {
  if (!m.connected) {
    return ['Sin conexión de datos'];
  }
  const reasons: string[] = [];
  if (m.lossPct !== null && m.lossPct >= 100) {
    reasons.push('Ningún host respondió a las sondas');
    return reasons;
  }
  if (m.rttAvg !== null && m.rttAvg > thresholds.maxRttMs) {
    reasons.push(`Latencia ${Math.round(m.rttAvg)} ms`);
  }
  if (m.lossPct !== null && m.lossPct > thresholds.maxLossPct) {
    reasons.push(`Pérdida ${Math.round(m.lossPct)} %`);
  }
  if (m.downMbps !== null && m.downMbps < thresholds.minDownMbps) {
    reasons.push(`Descarga ${m.downMbps} Mbps`);
  }
  return reasons;
}
