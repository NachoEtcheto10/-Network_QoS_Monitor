import notifee, { AndroidImportance } from '@notifee/react-native';
import { getValue, setValue } from '../db/repository';
import { NETWORK_LABELS, type Measurement } from '../types';

const CHANNEL_ID = 'qos-degradation';
const LAST_ALERT_KEY = 'lastAlertAt';
/** Tiempo mínimo entre alertas, para no notificar en cada muestra de una zona mala. */
export const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

async function ensureChannel(): Promise<string> {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Degradación de red',
    description: 'Avisos cuando la calidad de la conexión cae por debajo de los umbrales',
    importance: AndroidImportance.HIGH,
  });
}

/**
 * Muestra una notificación local de degradación severa, respetando el
 * cooldown. Devuelve true si efectivamente notificó.
 */
export async function notifyDegradation(
  measurement: Measurement,
  reasons: string[],
): Promise<boolean> {
  const last = Number((await getValue(LAST_ALERT_KEY)) ?? 0);
  if (Date.now() - last < ALERT_COOLDOWN_MS) {
    return false;
  }

  const channelId = await ensureChannel();
  const network = NETWORK_LABELS[measurement.netKind];
  await notifee.displayNotification({
    title: 'Degradación severa de la red',
    body: `${network}${measurement.carrier ? ` · ${measurement.carrier}` : ''}: ${reasons.join(', ')}`,
    android: {
      channelId,
      pressAction: { id: 'default' },
    },
  });
  await setValue(LAST_ALERT_KEY, String(Date.now()));
  return true;
}
