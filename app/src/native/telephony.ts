import NativeTelephony, { type TelephonyInfo } from '../../specs/NativeTelephony';

export type { TelephonyInfo };

/**
 * Lee el módulo nativo de telefonía. Devuelve null si el módulo no está
 * enlazado (tests, plataforma sin implementación) o si la lectura falla, para
 * que el motor de medición pueda degradar a lo que informa NetInfo.
 */
export async function readTelephony(): Promise<TelephonyInfo | null> {
  if (!NativeTelephony) {
    return null;
  }
  try {
    return await NativeTelephony.getTelephonyInfo();
  } catch {
    return null;
  }
}
