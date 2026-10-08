import { create } from 'zustand';
import {
  createSession,
  endSession,
  ensureDailySession,
} from '../db/repository';
import { runMeasurement } from '../engine/measure';
import { getNetworkSnapshot } from '../engine/network';
import type {
  MeasurePhase,
  Measurement,
  NetworkSnapshot,
  PingResult,
} from '../types';
import { formatDateTime } from '../ui/format';
import { useHistoryStore } from './historyStore';
import { useSettingsStore } from './settingsStore';

interface MonitorState {
  network: NetworkSnapshot | null;
  phase: MeasurePhase;
  /** Resultados parciales de la medición en curso. */
  livePings: PingResult[];
  liveDownMbps: number | null;
  liveUpMbps: number | null;
  last: Measurement | null;
  /** true mientras hay una sesión de monitoreo continuo activa. */
  monitoring: boolean;
  sessionId: string | null;
  sessionSamples: number;
  nextSampleAt: number | null;
  error: string | null;

  setNetwork: (network: NetworkSnapshot) => void;
  refreshNetwork: () => Promise<void>;
  measureOnce: () => Promise<void>;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Store reactivo entre el motor de medición y la UI. El motor publica fase y
 * resultados parciales por callbacks; las pantallas solo se suscriben.
 */
export const useMonitorStore = create<MonitorState>((set, get) => {
  const measure = async (sessionId: string, withThroughput: boolean) => {
    set({
      error: null,
      livePings: [],
      liveDownMbps: null,
      liveUpMbps: null,
    });
    try {
      const measurement = await runMeasurement({
        sessionId,
        source: 'foreground',
        settings: useSettingsStore.getState().settings,
        withThroughput,
        onPhase: phase => set({ phase }),
        onNetwork: network => set({ network }),
        onPingProgress: livePings => set({ livePings }),
        onThroughputProgress: (phase, mbps) =>
          set(phase === 'download' ? { liveDownMbps: mbps } : { liveUpMbps: mbps }),
      });
      set(state => ({
        last: measurement,
        sessionSamples: state.monitoring ? state.sessionSamples + 1 : 0,
      }));
      await useHistoryStore.getState().reload();
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ phase: 'idle' });
    }
  };

  const loop = async () => {
    const { sessionId, monitoring } = get();
    if (!monitoring || !sessionId) {
      return;
    }
    const settings = useSettingsStore.getState().settings;
    await measure(sessionId, settings.sessionThroughput);
    // La sesión pudo detenerse (o reemplazarse) mientras se medía.
    if (!get().monitoring || get().sessionId !== sessionId) {
      return;
    }
    const waitMs = settings.sampleIntervalSec * 1000;
    set({ nextSampleAt: Date.now() + waitMs });
    timer = setTimeout(loop, waitMs);
  };

  return {
    network: null,
    phase: 'idle',
    livePings: [],
    liveDownMbps: null,
    liveUpMbps: null,
    last: null,
    monitoring: false,
    sessionId: null,
    sessionSamples: 0,
    nextSampleAt: null,
    error: null,

    setNetwork: network => set({ network }),

    refreshNetwork: async () => {
      // Durante una medición el motor ya publica el snapshot.
      if (get().phase !== 'idle') {
        return;
      }
      set({ network: await getNetworkSnapshot() });
    },

    measureOnce: async () => {
      if (get().phase !== 'idle' || get().monitoring) {
        return;
      }
      set({ phase: 'network' });
      try {
        const sessionId = await ensureDailySession('single');
        await measure(sessionId, true);
      } catch (error) {
        set({ error: (error as Error).message, phase: 'idle' });
      }
    },

    startMonitoring: async () => {
      if (get().monitoring || get().phase !== 'idle') {
        return;
      }
      const sessionId = await createSession(
        'monitor',
        `Sesión ${formatDateTime(Date.now())}`,
      );
      set({ monitoring: true, sessionId, sessionSamples: 0, nextSampleAt: null });
      loop();
    },

    stopMonitoring: async () => {
      const { sessionId } = get();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      set({ monitoring: false, sessionId: null, nextSampleAt: null });
      if (sessionId) {
        await endSession(sessionId);
        await useHistoryStore.getState().reload();
      }
    },
  };
});
