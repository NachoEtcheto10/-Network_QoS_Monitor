import { create } from 'zustand';
import { configureBackground } from '../engine/background';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  validateSettings,
} from '../settings';
import type { Settings } from '../types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Valida y persiste. Devuelve el mensaje de error, o null si se guardó. */
  save: (next: Settings) => Promise<string | null>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    const settings = await loadSettings();
    set({ settings, loaded: true });
    await configureBackground(settings).catch(error =>
      console.warn('[settings] no se pudo configurar el background', error),
    );
  },

  save: async next => {
    const error = validateSettings(next);
    if (error) {
      return error;
    }
    const previous = get().settings;
    await saveSettings(next);
    set({ settings: next });

    if (
      previous.backgroundEnabled !== next.backgroundEnabled ||
      previous.backgroundIntervalMin !== next.backgroundIntervalMin
    ) {
      await configureBackground(next).catch(e =>
        console.warn('[settings] no se pudo configurar el background', e),
      );
    }
    return null;
  },
}));
