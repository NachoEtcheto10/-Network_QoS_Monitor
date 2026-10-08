/**
 * @format
 */

import { AppRegistry } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import App from './App';
import { name as appName } from './app.json';
import { headlessTask } from './src/engine/background';

AppRegistry.registerComponent(appName, () => App);

// Android: permite que el muestreo periódico corra con la app cerrada.
BackgroundFetch.registerHeadlessTask(headlessTask);
