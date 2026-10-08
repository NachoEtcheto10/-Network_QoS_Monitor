import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { readTelephony, type TelephonyInfo } from '../native/telephony';
import type { NetworkKind, NetworkSnapshot } from '../types';

const CELL_GENERATIONS: NetworkKind[] = ['2g', '3g', '4g', '5g'];

/** Nivel 0-4 a partir del RSSI de WiFi, con los cortes habituales de Android. */
export function wifiLevel(rssi: number): number {
  if (rssi >= -55) {
    return 4;
  }
  if (rssi >= -67) {
    return 3;
  }
  if (rssi >= -75) {
    return 2;
  }
  if (rssi >= -85) {
    return 1;
  }
  return 0;
}

/**
 * Fusiona NetInfo (estado de conectividad y transporte activo) con el módulo
 * nativo de telefonía (operador, tecnología de radio y señal). NetInfo decide
 * qué transporte está activo; el módulo nativo aporta el detalle.
 */
export function mergeNetworkInfo(
  state: Pick<NetInfoState, 'type' | 'isConnected' | 'isInternetReachable'> & {
    details: unknown;
  },
  telephony: TelephonyInfo | null,
): NetworkSnapshot {
  const details = (state.details ?? {}) as {
    cellularGeneration?: string | null;
    carrier?: string | null;
  };
  const base = {
    isConnected: state.isConnected === true,
    isInternetReachable: state.isInternetReachable ?? null,
    carrier: telephony?.carrier ?? details.carrier ?? null,
    rsrp: null,
    rsrq: null,
    sinr: null,
  };

  if (state.type === 'wifi') {
    const rssi = telephony?.wifiRssi ?? null;
    return {
      ...base,
      kind: 'wifi',
      detail: null,
      signalDbm: rssi,
      signalLevel: rssi !== null ? wifiLevel(rssi) : null,
    };
  }

  if (state.type === 'cellular') {
    const native = telephony?.networkType as NetworkKind | undefined;
    const fromNetInfo = details.cellularGeneration as NetworkKind | undefined;
    const kind =
      native && CELL_GENERATIONS.includes(native)
        ? native
        : fromNetInfo && CELL_GENERATIONS.includes(fromNetInfo)
        ? fromNetInfo
        : 'unknown';
    return {
      ...base,
      kind,
      detail: telephony?.radioTechnology ?? null,
      signalDbm: telephony?.signalDbm ?? null,
      signalLevel: telephony?.signalLevel ?? null,
      rsrp: telephony?.rsrp ?? null,
      rsrq: telephony?.rsrq ?? null,
      sinr: telephony?.sinr ?? null,
    };
  }

  const kind: NetworkKind =
    state.type === 'ethernet'
      ? 'ethernet'
      : state.type === 'none'
      ? 'none'
      : 'unknown';
  return { ...base, kind, detail: null, signalDbm: null, signalLevel: null };
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [state, telephony] = await Promise.all([
    NetInfo.fetch(),
    readTelephony(),
  ]);
  return mergeNetworkInfo(state, telephony);
}

/** Avisa cada vez que cambia el transporte o la conectividad. */
export function subscribeNetwork(
  listener: (snapshot: NetworkSnapshot) => void,
): () => void {
  return NetInfo.addEventListener(async state => {
    listener(mergeNetworkInfo(state, await readTelephony()));
  });
}
