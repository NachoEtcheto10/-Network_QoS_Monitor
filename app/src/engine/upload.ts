import TcpSocket from 'react-native-tcp-socket';
import { now } from './clock';
import { toMbps } from './stats';
import type { TransferResult } from './throughput';

const CHUNK_BYTES = 64 * 1024;

export interface ParsedUrl {
  https: boolean;
  host: string;
  port: number;
  /** Prefijo de ruta sin barra final ("" si la URL no tiene ruta). */
  basePath: string;
}

/** Descompone la URL del backend. Devuelve null si no es http(s)://host[:puerto][/ruta]. */
export function parseBackendUrl(url: string): ParsedUrl | null {
  const match = /^(https?):\/\/([^/:\s]+)(?::(\d+))?(\/[^\s?#]*)?$/i.exec(url.trim());
  if (!match) {
    return null;
  }
  const https = match[1].toLowerCase() === 'https';
  const port = match[3] ? Number(match[3]) : https ? 443 : 80;
  if (port < 1 || port > 65535) {
    return null;
  }
  return {
    https,
    host: match[2],
    port,
    basePath: (match[4] ?? '').replace(/\/+$/, ''),
  };
}

/** Código de estado y bytes confirmados de una respuesta HTTP de /upload. */
export function parseUploadResponse(
  raw: string,
): { status: number; receivedBytes: number | null } | null {
  const status = /^HTTP\/1\.[01] (\d{3})/.exec(raw);
  if (!status || !raw.includes('\r\n\r\n')) {
    return null;
  }
  const received = /"receivedBytes"\s*:\s*(\d+)/.exec(raw);
  // Un 200 todavía sin el cuerpo JSON: la respuesta no terminó de llegar.
  if (status[1] === '200' && !received) {
    return null;
  }
  return {
    status: Number(status[1]),
    receivedBytes: received ? Number(received[1]) : null,
  };
}

function buildChunk(): string {
  // ASCII pseudoaleatorio: 1 char = 1 byte en el cable.
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let block = '';
  for (let i = 0; i < 1024; i++) {
    block += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return block.repeat(CHUNK_BYTES / 1024);
}

/**
 * Sube `bytes` a POST /upload escribiendo el request HTTP sobre un socket TCP.
 *
 * No se usa XMLHttpRequest/fetch: en Android, React Native envuelve todo
 * cuerpo de subida en ProgressRequestBody, cuyo FilterOutputStream escribe de
 * a un byte y notifica progreso por cada uno. Eso limita la subida por CPU
 * (1 MB tardaba ~10 s en un enlace que lo mueve en 0,25 s) y el test mediría
 * al cliente HTTP en lugar del enlace.
 *
 * El reloj corre desde el primer byte escrito hasta que el servidor confirma
 * la recepción (responde recién al consumir todo el cuerpo); el handshake
 * queda afuera. Los Mbps se calculan sobre los bytes que informa el servidor.
 */
export function measureUpload(
  baseUrl: string,
  bytes: number,
  timeoutMs: number,
): Promise<TransferResult> {
  return new Promise((resolve, reject) => {
    const target = parseBackendUrl(baseUrl);
    if (!target) {
      reject(new Error('La URL del backend no es válida'));
      return;
    }

    let settled = false;
    let startedAt = 0;
    let response = '';
    let socket: ReturnType<typeof TcpSocket.createConnection> | null = null;

    const finish = (error: Error | null, result?: TransferResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // el socket ya estaba cerrado
      }
      if (error) {
        reject(error);
      } else {
        resolve(result as TransferResult);
      }
    };

    const timer = setTimeout(
      () => finish(new Error('El test de subida excedió el tiempo límite')),
      timeoutMs,
    );

    const chunk = buildChunk();
    const send = () => {
      const active = socket;
      if (!active) {
        return;
      }
      const head =
        `POST ${target.basePath}/upload HTTP/1.1\r\n` +
        `Host: ${target.host}:${target.port}\r\n` +
        'Content-Type: text/plain\r\n' +
        `Content-Length: ${bytes}\r\n` +
        'Connection: close\r\n\r\n';

      startedAt = now();
      active.write(head, 'ascii');
      // Cada trozo se escribe cuando el anterior ya salió hacia el socket
      // nativo: mantiene acotada la memoria y respeta la contrapresión.
      let remaining = bytes;
      const writeNext = (error?: Error) => {
        if (settled) {
          return;
        }
        if (error) {
          finish(new Error('Se cortó la conexión durante la subida'));
          return;
        }
        if (remaining <= 0) {
          return;
        }
        const size = Math.min(remaining, CHUNK_BYTES);
        remaining -= size;
        active.write(
          size === CHUNK_BYTES ? chunk : chunk.slice(0, size),
          'ascii',
          writeNext,
        );
      };
      writeNext();
    };

    try {
      const options = {
        host: target.host,
        port: target.port,
        connectTimeout: timeoutMs,
      };
      socket = target.https
        ? TcpSocket.connectTLS(options, send)
        : TcpSocket.createConnection(options, send);

      socket.on('data', data => {
        response += typeof data === 'string' ? data : data.toString('utf8');
        const parsed = parseUploadResponse(response);
        if (!parsed) {
          return;
        }
        if (parsed.status !== 200) {
          finish(new Error(`El backend respondió HTTP ${parsed.status}`));
          return;
        }
        const elapsedMs = now() - startedAt;
        const received = parsed.receivedBytes ?? bytes;
        finish(null, {
          mbps: toMbps(received, elapsedMs),
          bytes: received,
          elapsedMs,
        });
      });
      socket.on('error', () =>
        finish(new Error('No se pudo conectar con el backend')),
      );
      socket.on('close', () =>
        finish(new Error('El backend cerró la conexión sin responder')),
      );
    } catch {
      finish(new Error('No se pudo conectar con el backend'));
    }
  });
}
