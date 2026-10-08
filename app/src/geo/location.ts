import Geolocation from '@react-native-community/geolocation';
import { getValue, setValue } from '../db/repository';
import type { GeoFix } from '../types';

const LAST_FIX_KEY = 'lastLocation';

let cached: GeoFix | null = null;
let configured = false;

function configure() {
  if (configured) {
    return;
  }
  // Los permisos los pide la app de forma explícita (src/permissions.ts).
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    locationProvider: 'auto',
  });
  configured = true;
}

function requestFix(timeoutMs: number, highAccuracy: boolean): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          timestamp: position.timestamp || Date.now(),
        }),
      error => reject(new Error(error.message)),
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 5000 },
    );
  });
}

export interface LocationOptions {
  /** Edad máxima de un fix cacheado para reutilizarlo sin consultar el GPS. */
  maxAgeMs?: number;
  timeoutMs?: number;
  /** Edad máxima de un fix cacheado para usarlo como respaldo si el GPS falla. */
  staleFallbackMs?: number;
}

/**
 * Ubicación para georreferenciar una medición.
 *
 * 1. Si hay un fix reciente en memoria, se reutiliza (evita encender el GPS en
 *    cada muestra de una sesión con intervalo corto).
 * 2. Si no, se pide una posición nueva y se cachea en memoria y en la base.
 * 3. Si el GPS falla o no hay permiso, se devuelve el último fix conocido
 *    siempre que no sea demasiado viejo; si no, null (la medición se guarda
 *    igual, sin coordenadas, y no aparece en el mapa).
 */
export async function getLocation(
  options: LocationOptions = {},
): Promise<GeoFix | null> {
  const maxAgeMs = options.maxAgeMs ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 8000;
  const staleFallbackMs = options.staleFallbackMs ?? 120_000;

  configure();
  if (cached && Date.now() - cached.timestamp <= maxAgeMs) {
    return cached;
  }

  try {
    const fix = await requestFix(timeoutMs, true);
    cached = fix;
    setValue(LAST_FIX_KEY, JSON.stringify(fix)).catch(() => {});
    return fix;
  } catch {
    const last = cached ?? (await readPersistedFix());
    if (last && Date.now() - last.timestamp <= staleFallbackMs) {
      return last;
    }
    return null;
  }
}

async function readPersistedFix(): Promise<GeoFix | null> {
  try {
    const raw = await getValue(LAST_FIX_KEY);
    return raw ? (JSON.parse(raw) as GeoFix) : null;
  } catch {
    return null;
  }
}

/** Último fix conocido, sin consultar el GPS (para centrar el mapa). */
export async function getLastKnownLocation(): Promise<GeoFix | null> {
  return cached ?? readPersistedFix();
}
