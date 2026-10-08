import { mergeNetworkInfo, wifiLevel } from '../src/engine/network';
import { DEFAULT_SETTINGS, validateSettings } from '../src/settings';
import type { TelephonyInfo } from '../specs/NativeTelephony';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));
jest.mock('../src/db/repository', () => ({
  getValue: jest.fn(),
  setValue: jest.fn(),
}));

const telephony: TelephonyInfo = {
  carrier: 'Operador Nativo',
  mcc: '722',
  mnc: '310',
  networkType: '5g',
  radioTechnology: 'NR (NSA)',
  signalDbm: -98,
  signalLevel: 3,
  rsrp: -98,
  rsrq: -12,
  sinr: 8,
  wifiRssi: -60,
  hasPhonePermission: true,
};

describe('mergeNetworkInfo', () => {
  it('en celular prioriza el módulo nativo sobre NetInfo', () => {
    const snapshot = mergeNetworkInfo(
      {
        type: 'cellular' as never,
        isConnected: true,
        isInternetReachable: true,
        details: { cellularGeneration: '4g', carrier: 'Operador NetInfo' },
      },
      telephony,
    );
    expect(snapshot).toMatchObject({
      kind: '5g',
      detail: 'NR (NSA)',
      carrier: 'Operador Nativo',
      signalDbm: -98,
      rsrp: -98,
      isConnected: true,
    });
  });

  it('sin módulo nativo (o sin permiso) usa la generación de NetInfo', () => {
    const fromNetInfo = mergeNetworkInfo(
      {
        type: 'cellular' as never,
        isConnected: true,
        isInternetReachable: null,
        details: { cellularGeneration: '3g', carrier: 'Operador NetInfo' },
      },
      null,
    );
    expect(fromNetInfo.kind).toBe('3g');
    expect(fromNetInfo.carrier).toBe('Operador NetInfo');
    expect(fromNetInfo.signalDbm).toBeNull();

    const noPermission = mergeNetworkInfo(
      {
        type: 'cellular' as never,
        isConnected: true,
        isInternetReachable: null,
        details: { cellularGeneration: '4g' },
      },
      { ...telephony, networkType: 'unknown', hasPhonePermission: false },
    );
    expect(noPermission.kind).toBe('4g');
  });

  it('en WiFi usa el RSSI de WiFi y no los datos de la celda', () => {
    const snapshot = mergeNetworkInfo(
      {
        type: 'wifi' as never,
        isConnected: true,
        isInternetReachable: true,
        details: {},
      },
      telephony,
    );
    expect(snapshot.kind).toBe('wifi');
    expect(snapshot.signalDbm).toBe(-60);
    expect(snapshot.signalLevel).toBe(3);
    expect(snapshot.rsrp).toBeNull();
  });

  it('sin red queda como "none" y desconectado', () => {
    const snapshot = mergeNetworkInfo(
      {
        type: 'none' as never,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      },
      null,
    );
    expect(snapshot.kind).toBe('none');
    expect(snapshot.isConnected).toBe(false);
  });
});

describe('wifiLevel', () => {
  it('mapea RSSI a 0-4', () => {
    expect([-50, -60, -70, -80, -90].map(wifiLevel)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('validateSettings', () => {
  it('acepta la configuración por defecto', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
  });

  it('exige al menos 3 hosts', () => {
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        hosts: DEFAULT_SETTINGS.hosts.slice(0, 2),
      }),
    ).toMatch(/al menos 3/);
  });

  it('rechaza hosts con esquema o puerto fuera de rango', () => {
    const [first, ...rest] = DEFAULT_SETTINGS.hosts;
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        hosts: [{ ...first, host: 'https://ejemplo.com' }, ...rest],
      }),
    ).toMatch(/sin esquema/);
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        hosts: [{ ...first, port: 70000 }, ...rest],
      }),
    ).toMatch(/Puerto inválido/);
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        hosts: [{ ...first, port: NaN }, ...rest],
      }),
    ).toMatch(/Puerto inválido/);
  });

  it('rechaza URL de backend sin esquema e intervalos de background < 15 min', () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, backendUrl: '192.168.0.10:3000' }),
    ).toMatch(/http/);
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, backgroundIntervalMin: 5 }),
    ).toMatch(/15 minutos/);
  });
});
