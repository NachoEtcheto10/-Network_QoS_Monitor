import TcpSocket from 'react-native-tcp-socket';
import type { PingHost, PingResult } from '../types';
import { now } from './clock';
import { round, toPingResult } from './stats';

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Una sonda de latencia: mide el tiempo del handshake TCP (SYN -> SYN/ACK)
 * contra host:port y cierra el socket sin enviar datos. Es el equivalente a un
 * "TCP ping": ICMP no está disponible para apps sin privilegios.
 *
 * Devuelve el RTT en ms, o null si la conexión falla o vence el timeout.
 * El socket vive en un hilo nativo; JS solo recibe el evento de conexión, así
 * que la espera no bloquea el hilo de JavaScript.
 */
export function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise(resolve => {
    let settled = false;
    let socket: ReturnType<typeof TcpSocket.createConnection> | null = null;

    const finish = (rtt: number | null) => {
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
      resolve(rtt);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const start = now();
    try {
      socket = TcpSocket.createConnection(
        { host, port, connectTimeout: timeoutMs },
        () => finish(round(now() - start, 1)),
      );
      socket.on('error', () => finish(null));
      socket.on('timeout', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

export interface PingOptions {
  count: number;
  timeoutMs: number;
  /** Pausa entre sondas consecutivas al mismo host. */
  intervalMs?: number;
  onSample?: (host: PingHost, samples: (number | null)[]) => void;
}

export async function pingHost(
  host: PingHost,
  options: PingOptions,
): Promise<PingResult> {
  const samples: (number | null)[] = [];
  for (let i = 0; i < options.count; i++) {
    samples.push(await tcpProbe(host.host, host.port, options.timeoutMs));
    options.onSample?.(host, [...samples]);
    if (i < options.count - 1) {
      await sleep(options.intervalMs ?? 150);
    }
  }
  return toPingResult(host, samples);
}

/**
 * Sondea todos los hosts. Los hosts corren en paralelo (acota la duración
 * total del muestreo) y las sondas a un mismo host son secuenciales, para que
 * el jitter refleje variación entre paquetes consecutivos.
 */
export function pingAll(
  hosts: PingHost[],
  options: PingOptions,
): Promise<PingResult[]> {
  return Promise.all(hosts.map(host => pingHost(host, options)));
}
