import type { PingResult, RttStats } from '../types';

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Resume una serie de sondas RTT. Cada elemento es el RTT en ms o null si la
 * sonda se perdió (timeout o error de conexión).
 *
 * El jitter es la media de las diferencias absolutas entre RTT consecutivos
 * (variación entre paquetes, en el espíritu de RFC 3550), calculada solo entre
 * sondas respondidas.
 */
export function computeRttStats(samples: (number | null)[]): RttStats {
  const ok = samples.filter((s): s is number => s !== null);
  const sent = samples.length;
  const received = ok.length;
  const lossPct = sent === 0 ? 0 : round(((sent - received) / sent) * 100);

  if (received === 0) {
    return {
      sent,
      received,
      minMs: null,
      avgMs: null,
      maxMs: null,
      jitterMs: null,
      lossPct,
    };
  }

  const sum = ok.reduce((acc, s) => acc + s, 0);
  let jitterMs: number | null = null;
  if (received >= 2) {
    let diffSum = 0;
    for (let i = 1; i < ok.length; i++) {
      diffSum += Math.abs(ok[i] - ok[i - 1]);
    }
    jitterMs = round(diffSum / (ok.length - 1));
  }

  return {
    sent,
    received,
    minMs: round(Math.min(...ok)),
    avgMs: round(sum / received),
    maxMs: round(Math.max(...ok)),
    jitterMs,
    lossPct,
  };
}

/**
 * Combina los resultados por host en una sola figura para la medición:
 * mínimo de mínimos, máximo de máximos, promedio de promedios (cada host pesa
 * igual) y pérdida sobre el total de sondas enviadas.
 */
export function aggregatePing(results: RttStats[]): RttStats {
  const sent = results.reduce((acc, r) => acc + r.sent, 0);
  const received = results.reduce((acc, r) => acc + r.received, 0);
  const lossPct = sent === 0 ? 0 : round(((sent - received) / sent) * 100);
  const answered = results.filter(r => r.avgMs !== null);

  if (answered.length === 0) {
    return {
      sent,
      received,
      minMs: null,
      avgMs: null,
      maxMs: null,
      jitterMs: null,
      lossPct,
    };
  }

  const mean = (values: number[]) =>
    values.reduce((acc, v) => acc + v, 0) / values.length;
  const jitters = answered
    .map(r => r.jitterMs)
    .filter((j): j is number => j !== null);

  return {
    sent,
    received,
    minMs: Math.min(...answered.map(r => r.minMs as number)),
    avgMs: round(mean(answered.map(r => r.avgMs as number))),
    maxMs: Math.max(...answered.map(r => r.maxMs as number)),
    jitterMs: jitters.length > 0 ? round(mean(jitters)) : null,
    lossPct,
  };
}

export function toPingResult(
  host: PingResult['host'],
  samples: (number | null)[],
): PingResult {
  return { host, samples, ...computeRttStats(samples) };
}

/** Mbps a partir de bytes transferidos y milisegundos transcurridos. */
export function toMbps(bytes: number, elapsedMs: number): number | null {
  if (bytes <= 0 || elapsedMs <= 0) {
    return null;
  }
  return round((bytes * 8) / (elapsedMs / 1000) / 1_000_000, 2);
}
