import type { ThroughputResult } from '../types';
import { now } from './clock';
import { toMbps } from './stats';
import { measureUpload } from './upload';

const MB = 1024 * 1024;

export interface TransferResult {
  mbps: number | null;
  bytes: number;
  elapsedMs: number;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Descarga `bytes` desde GET /download y calcula el throughput.
 *
 * El reloj arranca cuando llegan los headers de respuesta, no al abrir la
 * conexión: así el resultado mide la tasa de transferencia del payload y no
 * incluye DNS + handshake + latencia del request. Los Mbps se calculan sobre
 * los bytes efectivamente recibidos (no los pedidos).
 */
export function measureDownload(
  baseUrl: string,
  bytes: number,
  timeoutMs: number,
  onProgress?: (mbps: number) => void,
): Promise<TransferResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let startedAt: number | null = null;
    let loaded = 0;

    xhr.open(
      'GET',
      `${normalizeBaseUrl(baseUrl)}/download?bytes=${bytes}&nocache=${Date.now()}`,
    );
    xhr.responseType = 'text';
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Cache-Control', 'no-store');

    xhr.onreadystatechange = () => {
      if (xhr.readyState === xhr.HEADERS_RECEIVED && startedAt === null) {
        startedAt = now();
      }
    };
    xhr.onprogress = event => {
      loaded = event.loaded;
      if (startedAt !== null && onProgress) {
        const mbps = toMbps(loaded, now() - startedAt);
        if (mbps !== null) {
          onProgress(mbps);
        }
      }
    };
    xhr.onload = () => {
      if (xhr.status !== 200) {
        reject(new Error(`El backend respondió HTTP ${xhr.status}`));
        return;
      }
      const elapsedMs = now() - (startedAt ?? now());
      // El payload es ASCII: la longitud del texto coincide con los bytes.
      const received = loaded || xhr.responseText.length || bytes;
      resolve({
        mbps: toMbps(received, elapsedMs),
        bytes: received,
        elapsedMs,
      });
    };
    xhr.onerror = () => reject(new Error('No se pudo conectar con el backend'));
    xhr.ontimeout = () => reject(new Error('El test de descarga excedió el tiempo límite'));
    xhr.send();
  });
}

export interface ThroughputOptions {
  downloadMb: number;
  uploadMb: number;
  timeoutMs?: number;
  onPhase?: (phase: 'download' | 'upload') => void;
  onProgress?: (phase: 'download' | 'upload', mbps: number) => void;
}

/** Test completo: descarga y luego subida. Un fallo no descarta la otra mitad. */
export async function runThroughputTest(
  baseUrl: string,
  options: ThroughputOptions,
): Promise<ThroughputResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const result: ThroughputResult = {
    downMbps: null,
    upMbps: null,
    downBytes: 0,
    upBytes: 0,
    error: null,
  };

  try {
    options.onPhase?.('download');
    const down = await measureDownload(
      baseUrl,
      Math.round(options.downloadMb * MB),
      timeoutMs,
      mbps => options.onProgress?.('download', mbps),
    );
    result.downMbps = down.mbps;
    result.downBytes = down.bytes;
    // Valor final: no todas las plataformas emiten progreso durante la descarga.
    if (down.mbps !== null) {
      options.onProgress?.('download', down.mbps);
    }
  } catch (error) {
    result.error = (error as Error).message;
  }

  try {
    options.onPhase?.('upload');
    const up = await measureUpload(
      baseUrl,
      Math.round(options.uploadMb * MB),
      timeoutMs,
    );
    result.upMbps = up.mbps;
    result.upBytes = up.bytes;
    if (up.mbps !== null) {
      options.onProgress?.('upload', up.mbps);
    }
  } catch (error) {
    result.error = result.error ?? (error as Error).message;
  }

  return result;
}

export async function checkBackend(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
