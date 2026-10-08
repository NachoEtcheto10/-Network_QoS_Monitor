import BackgroundFetch from 'react-native-background-fetch';
import { ensureDailySession } from '../db/repository';
import { loadSettings } from '../settings';
import type { Settings } from '../types';
import { runMeasurement } from './measure';

/**
 * Una muestra de background: lee la configuración persistida (el contexto
 * headless no comparte memoria con la UI), mide y guarda.
 *
 * Android/iOS conceden unos 30 s por evento, por eso el test de throughput
 * está apagado por defecto en background y las sondas usan pocos intentos.
 */
async function sampleInBackground(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.backgroundEnabled) {
    return;
  }
  const sessionId = await ensureDailySession('background');
  await runMeasurement({
    sessionId,
    source: 'background',
    settings: {
      ...settings,
      pingCount: Math.min(settings.pingCount, 4),
    },
    withThroughput: settings.backgroundThroughput,
  });
}

async function handleEvent(taskId: string): Promise<void> {
  try {
    await sampleInBackground();
  } catch (error) {
    console.warn('[background] la muestra falló', error);
  } finally {
    // Siempre hay que avisar al SO que la tarea terminó, o penaliza a la app.
    BackgroundFetch.finish(taskId);
  }
}

/**
 * Tarea headless (Android): se ejecuta con la app cerrada o el dispositivo
 * bloqueado, sin UI. Se registra en index.js.
 */
export async function headlessTask(event: {
  taskId: string;
  timeout: boolean;
}): Promise<void> {
  if (event.timeout) {
    BackgroundFetch.finish(event.taskId);
    return;
  }
  await handleEvent(event.taskId);
}

/**
 * Configura (o detiene) el muestreo periódico según los ajustes. Se llama al
 * iniciar la app y cada vez que cambian los ajustes de background.
 */
export async function configureBackground(settings: Settings): Promise<number> {
  const status = await BackgroundFetch.configure(
    {
      minimumFetchInterval: settings.backgroundIntervalMin,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      // Sin requisito de red: registrar "sin cobertura" también es un dato.
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_NONE,
    },
    handleEvent,
    taskId => BackgroundFetch.finish(taskId),
  );

  if (settings.backgroundEnabled) {
    await BackgroundFetch.start();
  } else {
    await BackgroundFetch.stop();
  }
  return status;
}
