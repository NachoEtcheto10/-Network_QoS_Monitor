import { latencyScore, signalScore } from '../engine/quality';
import type { GeoBounds, Measurement } from '../types';

export type HeatmapMetric = 'quality' | 'signal' | 'latency';

export const METRIC_LABELS: Record<HeatmapMetric, string> = {
  quality: 'Calidad',
  signal: 'Señal',
  latency: 'Latencia',
};

const METERS_PER_DEGREE_LAT = 111_320;

export interface HeatmapCell {
  latitude: number;
  longitude: number;
  /** Promedio de la métrica en la celda, normalizado: 0 = peor, 1 = mejor. */
  value: number;
  count: number;
}

/** Valor normalizado 0..1 de una medición para la métrica, o null si no aplica. */
export function metricValue(
  m: Measurement,
  metric: HeatmapMetric,
): number | null {
  switch (metric) {
    case 'quality':
      return m.quality / 100;
    case 'signal':
      return signalScore(m.signalDbm, m.signalLevel, m.netKind);
    case 'latency':
      if (!m.connected) {
        return 0;
      }
      return m.rttAvg !== null ? latencyScore(m.rttAvg) : null;
  }
}

/**
 * Agrupa las mediciones en una grilla de celdas de `cellMeters` de lado y
 * promedia la métrica dentro de cada celda.
 *
 * El overlay de heatmap suma intensidades: sin este paso, una zona con muchas
 * mediciones malas se vería más "caliente" que una con una sola medición
 * buena. Promediar por celda hace que el color represente calidad y no
 * densidad de muestras.
 */
export function buildHeatmapCells(
  measurements: Measurement[],
  metric: HeatmapMetric,
  cellMeters: number,
): HeatmapCell[] {
  const latStep = cellMeters / METERS_PER_DEGREE_LAT;
  const cells = new Map<
    string,
    { sum: number; count: number; latSum: number; lonSum: number }
  >();

  for (const m of measurements) {
    if (m.latitude === null || m.longitude === null) {
      continue;
    }
    const value = metricValue(m, metric);
    if (value === null) {
      continue;
    }
    const row = Math.floor(m.latitude / latStep);
    // El ancho en grados de una celda depende de la latitud de su fila.
    const rowLat = (row + 0.5) * latStep;
    const lonStep =
      cellMeters /
      (METERS_PER_DEGREE_LAT * Math.max(0.01, Math.cos((rowLat * Math.PI) / 180)));
    const col = Math.floor(m.longitude / lonStep);
    const key = `${row}:${col}`;

    const cell = cells.get(key) ?? { sum: 0, count: 0, latSum: 0, lonSum: 0 };
    cell.sum += value;
    cell.count += 1;
    cell.latSum += m.latitude;
    cell.lonSum += m.longitude;
    cells.set(key, cell);
  }

  return [...cells.values()].map(cell => ({
    latitude: cell.latSum / cell.count,
    longitude: cell.lonSum / cell.count,
    value: cell.sum / cell.count,
    count: cell.count,
  }));
}

/**
 * Tamaño de celda acorde al zoom: ~1/30 del alto visible del mapa, con un piso
 * de 25 m (por debajo de eso domina el error del GPS).
 */
export function cellSizeForRegion(latitudeDelta: number): number {
  const visibleMeters = latitudeDelta * METERS_PER_DEGREE_LAT;
  return Math.max(25, Math.round(visibleMeters / 30));
}

export function boundsOfRegion(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): GeoBounds {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLon: region.longitude - region.longitudeDelta / 2,
    maxLon: region.longitude + region.longitudeDelta / 2,
  };
}

/** Caja de `radiusMeters` alrededor de un punto. */
export function boundsAround(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): GeoBounds {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const dLon =
    radiusMeters /
    (METERS_PER_DEGREE_LAT * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
  return {
    minLat: latitude - dLat,
    maxLat: latitude + dLat,
    minLon: longitude - dLon,
    maxLon: longitude + dLon,
  };
}

/** Región que encuadra todas las mediciones georreferenciadas, con margen. */
export function regionOf(measurements: Measurement[]) {
  const located = measurements.filter(
    m => m.latitude !== null && m.longitude !== null,
  );
  if (located.length === 0) {
    return null;
  }
  const lats = located.map(m => m.latitude as number);
  const lons = located.map(m => m.longitude as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.005, (maxLon - minLon) * 1.4),
  };
}
