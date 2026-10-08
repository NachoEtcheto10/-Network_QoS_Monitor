import { create } from 'zustand';
import {
  deleteAllMeasurements,
  listSessions,
  queryMeasurements,
} from '../db/repository';
import type { HistoryFilter, Measurement, Session } from '../types';

/** Tope de filas que se cargan en memoria para lista y mapa. */
const MAX_ROWS = 3000;

export const EMPTY_FILTER: HistoryFilter = {
  kinds: [],
  from: null,
  to: null,
  bounds: null,
};

interface HistoryState {
  filter: HistoryFilter;
  /** Mediciones que cumplen el filtro, de la más reciente a la más antigua. */
  measurements: Measurement[];
  sessions: Session[];
  loading: boolean;
  reload: () => Promise<void>;
  setFilter: (patch: Partial<HistoryFilter>) => Promise<void>;
  resetFilter: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  filter: EMPTY_FILTER,
  measurements: [],
  sessions: [],
  loading: false,

  reload: async () => {
    set({ loading: true });
    try {
      const [measurements, sessions] = await Promise.all([
        queryMeasurements(get().filter, MAX_ROWS),
        listSessions(),
      ]);
      set({ measurements, sessions });
    } finally {
      set({ loading: false });
    }
  },

  setFilter: async patch => {
    set({ filter: { ...get().filter, ...patch } });
    await get().reload();
  },

  resetFilter: async () => {
    set({ filter: EMPTY_FILTER });
    await get().reload();
  },

  clearAll: async () => {
    await deleteAllMeasurements();
    await get().reload();
  },
}));

export function isFilterActive(filter: HistoryFilter): boolean {
  return (
    filter.kinds.length > 0 ||
    filter.from !== null ||
    filter.to !== null ||
    filter.bounds !== null
  );
}
