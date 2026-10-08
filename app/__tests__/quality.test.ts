import {
  computeQuality,
  detectDegradation,
  qualityBand,
  signalScore,
  type QualityInput,
} from '../src/engine/quality';

const good: QualityInput = {
  connected: true,
  netKind: '4g',
  rttAvg: 25,
  jitter: 3,
  lossPct: 0,
  downMbps: 80,
  upMbps: 30,
  signalDbm: -75,
  signalLevel: 4,
};

describe('computeQuality', () => {
  it('da 100 a una conexión que está en el óptimo de todas las métricas', () => {
    expect(computeQuality(good)).toBe(100);
  });

  it('da 0 sin conexión o cuando ninguna sonda respondió', () => {
    expect(computeQuality({ ...good, connected: false })).toBe(0);
    expect(computeQuality({ ...good, lossPct: 100, rttAvg: null })).toBe(0);
  });

  it('empeora de forma monótona con la latencia', () => {
    const q = (rttAvg: number) => computeQuality({ ...good, rttAvg });
    expect(q(50)).toBeGreaterThan(q(150));
    expect(q(150)).toBeGreaterThan(q(350));
  });

  it('promedia solo lo medido: sin throughput sigue siendo comparable', () => {
    const withoutThroughput = computeQuality({
      ...good,
      downMbps: null,
      upMbps: null,
    });
    expect(withoutThroughput).toBe(100);
  });

  it('una conexión mala queda en la banda baja', () => {
    const bad = computeQuality({
      connected: true,
      netKind: '3g',
      rttAvg: 380,
      jitter: 90,
      lossPct: 18,
      downMbps: 0.6,
      upMbps: 0.3,
      signalDbm: -108,
      signalLevel: 1,
    });
    expect(bad).toBeLessThan(20);
  });
});

describe('signalScore', () => {
  it('usa rangos distintos según qué mide el dBm en cada tecnología', () => {
    // -90 dBm es pésimo como RSSI de WiFi pero bueno como RSRP de LTE.
    expect(signalScore(-90, null, 'wifi')).toBe(0);
    expect(signalScore(-90, null, '4g')).toBe(0.75);
  });

  it('cae al nivel 0-4 si no hay dBm, y a null si no hay nada', () => {
    expect(signalScore(null, 2, '4g')).toBe(0.5);
    expect(signalScore(null, null, '4g')).toBeNull();
  });
});

describe('qualityBand', () => {
  it('asigna la banda por umbral inferior', () => {
    expect(qualityBand(80).label).toBe('Excelente');
    expect(qualityBand(79).label).toBe('Buena');
    expect(qualityBand(40).label).toBe('Regular');
    expect(qualityBand(20).label).toBe('Mala');
    expect(qualityBand(0).label).toBe('Crítica');
  });
});

describe('detectDegradation', () => {
  const thresholds = { maxRttMs: 300, maxLossPct: 20, minDownMbps: 1 };

  it('no reporta nada dentro de los umbrales', () => {
    expect(
      detectDegradation(
        { connected: true, rttAvg: 300, lossPct: 20, downMbps: 1 },
        thresholds,
      ),
    ).toEqual([]);
  });

  it('lista cada umbral superado', () => {
    const reasons = detectDegradation(
      { connected: true, rttAvg: 450, lossPct: 40, downMbps: 0.4 },
      thresholds,
    );
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain('450');
  });

  it('no alerta por throughput si no se midió', () => {
    expect(
      detectDegradation(
        { connected: true, rttAvg: 50, lossPct: 0, downMbps: null },
        thresholds,
      ),
    ).toEqual([]);
  });

  it('trata la falta de conexión y la pérdida total como degradación', () => {
    expect(
      detectDegradation(
        { connected: false, rttAvg: null, lossPct: null, downMbps: null },
        thresholds,
      ),
    ).toEqual(['Sin conexión de datos']);
    expect(
      detectDegradation(
        { connected: true, rttAvg: null, lossPct: 100, downMbps: null },
        thresholds,
      ),
    ).toHaveLength(1);
  });
});
