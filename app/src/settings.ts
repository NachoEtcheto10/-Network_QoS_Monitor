import { getValue, setValue } from './db/repository';
import type { PingHost, Settings } from './types';

const SETTINGS_KEY = 'settings';

export const MIN_HOSTS = 3;

export const DEFAULT_SETTINGS: Settings = {
  hosts: [
    { id: 'cloudflare', label: 'Cloudflare DNS', host: '1.1.1.1', port: 443 },
    { id: 'google', label: 'Google DNS', host: '8.8.8.8', port: 443 },
    { id: 'quad9', label: 'Quad9 DNS', host: '9.9.9.9', port: 443 },
  ],
  // 10.0.2.2 es el host visto desde el emulador de Android. En un dispositivo
  // físico hay que poner la IP de la máquina (o el servidor) que corre el backend.
  backendUrl: 'http://10.0.2.2:3000',
  pingCount: 5,
  pingTimeoutMs: 2000,
  sampleIntervalSec: 30,
  sessionThroughput: true,
  downloadMb: 2,
  uploadMb: 1,
  backgroundEnabled: false,
  backgroundIntervalMin: 15,
  backgroundThroughput: false,
  notifyEnabled: true,
  thresholds: {
    maxRttMs: 300,
    maxLossPct: 20,
    minDownMbps: 1,
  },
};

/**
 * Valida un host ingresado por el usuario. Devuelve el mensaje de error o null.
 */
export function validateHost(host: PingHost): string | null {
  if (!host.host.trim()) {
    return 'El host no puede estar vacío';
  }
  if (/[\s/:]/.test(host.host.trim())) {
    return `"${host.host}" debe ser un nombre de host o una IP, sin esquema ni puerto`;
  }
  if (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535) {
    return `Puerto inválido para ${host.host}`;
  }
  return null;
}

export function validateSettings(settings: Settings): string | null {
  if (settings.hosts.length < MIN_HOSTS) {
    return `Se necesitan al menos ${MIN_HOSTS} hosts para las sondas de latencia`;
  }
  for (const host of settings.hosts) {
    const error = validateHost(host);
    if (error) {
      return error;
    }
  }
  if (!/^https?:\/\/[^\s/]+/.test(settings.backendUrl.trim())) {
    return 'La URL del backend debe empezar con http:// o https://';
  }
  if (settings.pingCount < 2 || settings.pingCount > 20) {
    return 'La cantidad de sondas debe estar entre 2 y 20';
  }
  if (settings.sampleIntervalSec < 10) {
    return 'El intervalo de muestreo mínimo es de 10 segundos';
  }
  if (settings.downloadMb <= 0 || settings.downloadMb > 100) {
    return 'El tamaño de descarga debe estar entre 0 y 100 MB';
  }
  if (settings.uploadMb <= 0 || settings.uploadMb > 100) {
    return 'El tamaño de subida debe estar entre 0 y 100 MB';
  }
  if (settings.backgroundIntervalMin < 15) {
    return 'El sistema no permite muestreos en segundo plano de menos de 15 minutos';
  }
  return null;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getValue(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  try {
    const stored = JSON.parse(raw) as Partial<Settings>;
    // Se fusiona con los defaults para tolerar claves agregadas en versiones nuevas.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      thresholds: { ...DEFAULT_SETTINGS.thresholds, ...stored.thresholds },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setValue(SETTINGS_KEY, JSON.stringify(settings));
}
