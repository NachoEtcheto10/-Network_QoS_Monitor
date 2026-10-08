import {
  aggregatePing,
  computeRttStats,
  toMbps,
} from '../src/engine/stats';

describe('computeRttStats', () => {
  it('calcula min/avg/max y jitter como media de diferencias consecutivas', () => {
    const stats = computeRttStats([20, 30, 25, 45]);
    expect(stats).toEqual({
      sent: 4,
      received: 4,
      minMs: 20,
      avgMs: 30,
      maxMs: 45,
      // |30-20| + |25-30| + |45-25| = 35; 35 / 3
      jitterMs: 11.7,
      lossPct: 0,
    });
  });

  it('cuenta las sondas perdidas y las excluye de las estadísticas', () => {
    const stats = computeRttStats([40, null, 60, null]);
    expect(stats.sent).toBe(4);
    expect(stats.received).toBe(2);
    expect(stats.lossPct).toBe(50);
    expect(stats.avgMs).toBe(50);
    expect(stats.jitterMs).toBe(20);
  });

  it('no inventa valores cuando ninguna sonda respondió', () => {
    expect(computeRttStats([null, null, null])).toEqual({
      sent: 3,
      received: 0,
      minMs: null,
      avgMs: null,
      maxMs: null,
      jitterMs: null,
      lossPct: 100,
    });
  });

  it('con una sola respuesta no hay jitter', () => {
    const stats = computeRttStats([null, 33.3]);
    expect(stats.jitterMs).toBeNull();
    expect(stats.minMs).toBe(33.3);
    expect(stats.maxMs).toBe(33.3);
  });

  it('tolera una serie vacía', () => {
    expect(computeRttStats([])).toMatchObject({ sent: 0, lossPct: 0, avgMs: null });
  });
});

describe('aggregatePing', () => {
  it('combina hosts: extremos globales, promedio de promedios y pérdida total', () => {
    const a = computeRttStats([10, 20]);
    const b = computeRttStats([100, null, 140, null]);
    const total = aggregatePing([a, b]);
    expect(total.minMs).toBe(10);
    expect(total.maxMs).toBe(140);
    expect(total.avgMs).toBe(67.5); // (15 + 120) / 2
    expect(total.jitterMs).toBe(25); // (10 + 40) / 2
    expect(total.lossPct).toBe(33.3); // 2 de 6
  });

  it('ignora en la latencia a los hosts que no respondieron', () => {
    const total = aggregatePing([
      computeRttStats([50, 50]),
      computeRttStats([null, null]),
    ]);
    expect(total.avgMs).toBe(50);
    expect(total.lossPct).toBe(50);
  });

  it('devuelve nulls si ningún host respondió', () => {
    const total = aggregatePing([computeRttStats([null]), computeRttStats([null])]);
    expect(total.avgMs).toBeNull();
    expect(total.lossPct).toBe(100);
  });
});

describe('toMbps', () => {
  it('convierte bytes y milisegundos a megabits por segundo', () => {
    // 1.250.000 bytes = 10 Mbit, en 1 s
    expect(toMbps(1_250_000, 1000)).toBe(10);
    expect(toMbps(1_250_000, 4000)).toBe(2.5);
  });

  it('devuelve null si no hay transferencia o tiempo medible', () => {
    expect(toMbps(0, 1000)).toBeNull();
    expect(toMbps(1000, 0)).toBeNull();
  });
});
