import notifee, { AuthorizationStatus } from '@notifee/react-native';
import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export interface PermissionStatus {
  location: boolean;
  phone: boolean;
  notifications: boolean;
  backgroundLocation: boolean;
}

const A = PermissionsAndroid.PERMISSIONS;

async function notificationsGranted(request: boolean): Promise<boolean> {
  const settings = request
    ? await notifee.requestPermission()
    : await notifee.getNotificationSettings();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

function requestIosLocation(): Promise<boolean> {
  return new Promise(resolve => {
    Geolocation.requestAuthorization(
      () => resolve(true),
      () => resolve(false),
    );
  });
}

export async function checkPermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    return {
      // iOS no expone un "check" sin diálogo en esta librería; se asume
      // concedido y la medición simplemente queda sin coordenadas si no lo está.
      location: true,
      phone: true,
      notifications: await notificationsGranted(false),
      backgroundLocation: true,
    };
  }
  const [location, phone, backgroundLocation] = await Promise.all([
    PermissionsAndroid.check(A.ACCESS_FINE_LOCATION),
    PermissionsAndroid.check(A.READ_PHONE_STATE),
    Platform.Version >= 29
      ? PermissionsAndroid.check(A.ACCESS_BACKGROUND_LOCATION)
      : Promise.resolve(true),
  ]);
  return {
    location,
    phone,
    backgroundLocation,
    notifications: await notificationsGranted(false),
  };
}

/**
 * Pide los permisos que la app necesita en primer plano: ubicación (para
 * georreferenciar), estado del teléfono (tipo de red celular) y notificaciones.
 */
export async function requestForegroundPermissions(): Promise<PermissionStatus> {
  if (Platform.OS === 'android') {
    const wanted: Permission[] = [
      A.ACCESS_FINE_LOCATION,
      A.READ_PHONE_STATE,
    ];
    await PermissionsAndroid.requestMultiple(wanted);
  } else {
    await requestIosLocation();
  }
  await notificationsGranted(true);
  return checkPermissions();
}

/**
 * La ubicación en segundo plano se pide aparte: Android 11+ exige que se
 * solicite después de la de primer plano y lleva al usuario a Ajustes.
 */
export async function requestBackgroundLocation(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 29) {
    return true;
  }
  const result = await PermissionsAndroid.request(
    A.ACCESS_BACKGROUND_LOCATION,
    {
      title: 'Ubicación en segundo plano',
      message:
        'Para georreferenciar los muestreos periódicos con la app cerrada, elegí "Permitir todo el tiempo".',
      buttonPositive: 'Continuar',
      buttonNegative: 'Ahora no',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
