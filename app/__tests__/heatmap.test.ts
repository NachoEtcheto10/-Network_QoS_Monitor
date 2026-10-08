import {
  boundsAround,
  boundsOfRegion,
  buildHeatmapCells,
  cellSizeForRegion,
  metricValue,
  regionOf,
} from '../src/geo/heatmap';
import type { Measurement } from '../src/types';

function measurement(overrides: Partial<Measurement>): Measurement {
  return {
    id: Math.random().toString(36),
    sessionId: 's1',
    timestamp: 0,
    source: 'foreground',
    latitude: -32.48,
    longitude: -58.23,
    accuracy: 10,
    netKind: '4g',
    netDetail: 'LTE',
    carrier: 'Operador',
    connected: true,
    signalDbm: -90,
    signalLevel: 3,
    rsrp: -90,
    rsrq: -10,
    sinr: 12,
    rttAvg: 40,
    rttMin: 30,
    rttMax: 60,
    jitter: 5,
    lossPct: 0,
    downMbps: 20,
    upMbps: 5,
    quality: 80,
    pings: [],
    ...overrides,
  };
}

describe('buildHeatmapCells', () => {
  it('promedia la métrica de las mediciones que caen en la misma celda', () => {
    const cells = buildHeatmapCells(
      [
        measurement({ quality: 90 }),
        // ~1 m al norte: misma celda de 100 m
        measurement({ latitude: -32.48 + 0.00001, quality: 30 }),
      ],
      'quality',
      100,
    );
    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(2);
    expect(cells[0].value).toBeCloseTo(0.6);
  });

  it('separa en celdas distintas a puntos alejados', () => {
    const cells = buildHeatmapCells(
      [
        measurement({ quality: 90 }),
        // ~1,1 km al norte
        measurement({ latitude: -32.47, quality: 10 }),
      ],
      'quality',
      100,
    );
    expect(cells).toHaveLength(2);
    expect(cells.map(c => c.value).sort()).toEqual([0.1, 0.9]);
  });

  it('muchas mediciones malas no pesan más que una buena (no es densidad)', () => {
    const bad = Array.from({ length: 20 }, () => measurement({ quality: 10 }));
    const cells = buildHeatmapCells(bad, 'quality', 100);
    expect(cells).toHaveLength(1);
    expect(cells[0].value).toBeCloseTo(0.1);
  });

  it('descarta mediciones sin coordenadas o sin valor para la métrica', () => {
    const cells = buildHeatmapCells(
      [
        measurement({ latitude: null, longitude: null }),
        measurement({ signalDbm: null, signalLevel: null }),
      ],
      'signal',
      100,
    );
    expect(cells).toEqual([]);
  });
});

describe('metricValue', () => {
  it('en latencia, sin conexión vale 0 y sin RTT no aporta', () => {
    expect(metricValue(measurement({ connected: false }), 'latency')).toBe(0);
    expect(metricValue(measurement({ rttAvg: null }), 'latency')).toBeNull();
  });
});

describe('helpers geográficos', () => {
  it('cellSizeForRegion escala con el zoom y tiene un piso de 25 m', () => {
    expect(cellSizeForRegion(0.0001)).toBe(25);
    expect(cellSizeForRegion(0.05)).toBeGreaterThan(cellSizeForRegion(0.01));
  });

  it('boundsOfRegion devuelve la caja visible', () => {
    expect(
      boundsOfRegion({
        latitude: 10,
        longitude: 20,
        latitudeDelta: 2,
        longitudeDelta: 4,
      }),
    ).toEqual({ minLat: 9, maxLat: 11, minLon: 18, maxLon: 22 });
  });

  it('boundsAround ensancha la longitud lejos del ecuador', () => {
    const equator = boundsAround(0, 0, 1000);
    const south = boundsAround(-60, 0, 1000);
    const width = (b: { minLon: number; maxLon: number }) => b.maxLon - b.minLon;
    expect(width(south)).toBeCloseTo(width(equator) * 2, 3);
    expect(equator.maxLat - equator.minLat).toBeCloseTo(2000 / 111_320, 6);
  });

  it('regionOf encuadra los puntos y es null si no hay ninguno', () => {
    expect(regionOf([measurement({ latitude: null, longitude: null })])).toBeNull();
    const region = regionOf([
      measurement({ latitude: -32.5, longitude: -58.3 }),
      measurement({ latitude: -32.4, longitude: -58.2 }),
    ]);
    expect(region?.latitude).toBeCloseTo(-32.45);
    expect(region?.longitude).toBeCloseTo(-58.25);
    expect(region?.latitudeDelta).toBeCloseTo(0.14);
  });
});
