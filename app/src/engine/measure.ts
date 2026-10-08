import { insertMeasurement, newId } from '../db/repository';
import { getLocation } from '../geo/location';
import type {
  MeasurePhase,
  Measurement,
  MeasurementSource,
  NetworkSnapshot,
  PingResult,
  Settings,
} from '../types';
import { getNetworkSnapshot } from './network';
import { notifyDegradation } from './notifications';
import { pingAll } from './ping';
import { computeQuality, detectDegradation } from './quality';
import { aggregatePing, toPingResult } from './stats';
import { runThroughputTest } from './throughput';

export interface MeasureCallbacks {
  onPhase?: (phase: MeasurePhase) => void;
  onNetwork?: (snapshot: NetworkSnapshot) => void;
  onPingProgress?: (results: PingResult[]) => void;
  onThroughputProgress?: (phase: 'download' | 'upload', mbps: number) => void;
}

export interface MeasureOptions extends MeasureCallbacks {
  sessionId: string;
  source: MeasurementSource;
  settings: Settings;
  withThroughput: boolean;
}

/**
 * Ejecuta una medición completa y la persiste:
 * red -> ubicación -> sondas de latencia -> throughput -> guardado -> alerta.
 *
 * No depende de React ni del store: la usan tanto la UI (a través del store)
 * como la tarea headless de background.
 */
export async function runMeasurement(
  options: MeasureOptions,
): Promise<Measurement> {
  const { settings } = options;
  const timestamp = Date.now();

  options.onPhase?.('network');
  const network = await getNetworkSnapshot();
  options.onNetwork?.(network);

  options.onPhase?.('location');
  const fix = await getLocation(
    options.source === 'background'
      ? // En background el GPS puede no estar disponible: se acepta un fix más
        // viejo antes que perder la georreferenciación.
        { timeoutMs: 6000, staleFallbackMs: 10 * 60 * 1000 }
      : {},
  );

  let pings: PingResult[] = [];
  let downMbps: number | null = null;
  let upMbps: number | null = null;

  if (network.isConnected) {
    options.onPhase?.('ping');
    // Resultados parciales por host, para que la UI se actualice sonda a sonda.
    const partial = new Map<string, (number | null)[]>();
    pings = await pingAll(settings.hosts, {
      count: settings.pingCount,
      timeoutMs: settings.pingTimeoutMs,
      onSample: options.onPingProgress
        ? (host, samples) => {
            partial.set(host.id, samples);
            options.onPingProgress?.(
              settings.hosts
                .filter(h => partial.has(h.id))
                .map(h =>
                  toPingResult(h, partial.get(h.id) as (number | null)[]),
                ),
            );
          }
        : undefined,
    });

    const reachable = pings.some(p => p.received > 0);
    if (options.withThroughput && reachable) {
      const throughput = await runThroughputTest(settings.backendUrl, {
        downloadMb: settings.downloadMb,
        uploadMb: settings.uploadMb,
        onPhase: options.onPhase,
        onProgress: options.onThroughputProgress,
      });
      downMbps = throughput.downMbps;
      upMbps = throughput.upMbps;
    }
  }

  const rtt = pings.length > 0 ? aggregatePing(pings) : null;
  const measurement: Measurement = {
    id: newId(),
    sessionId: options.sessionId,
    timestamp,
    source: options.source,
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    accuracy: fix?.accuracy ?? null,
    netKind: network.kind,
    netDetail: network.detail,
    carrier: network.carrier,
    connected: network.isConnected,
    signalDbm: network.signalDbm,
    signalLevel: network.signalLevel,
    rsrp: network.rsrp,
    rsrq: network.rsrq,
    sinr: network.sinr,
    rttMin: rtt?.minMs ?? null,
    rttAvg: rtt?.avgMs ?? null,
    rttMax: rtt?.maxMs ?? null,
    jitter: rtt?.jitterMs ?? null,
    lossPct: rtt?.lossPct ?? null,
    downMbps,
    upMbps,
    quality: 0,
    pings,
  };
  measurement.quality = computeQuality({
    connected: measurement.connected,
    netKind: measurement.netKind,
    rttAvg: measurement.rttAvg,
    jitter: measurement.jitter,
    lossPct: measurement.lossPct,
    downMbps: measurement.downMbps,
    upMbps: measurement.upMbps,
    signalDbm: measurement.signalDbm,
    signalLevel: measurement.signalLevel,
  });

  options.onPhase?.('saving');
  await insertMeasurement(measurement);

  if (settings.notifyEnabled) {
    const reasons = detectDegradation(measurement, settings.thresholds);
    if (reasons.length > 0) {
      // Una falla al notificar (p. ej. permiso denegado) no invalida la medición.
      await notifyDegradation(measurement, reasons).catch(() => false);
    }
  }

  options.onPhase?.('idle');
  return measurement;
}
