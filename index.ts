import 'react-native-get-random-values';
import 'tslib';
import './src/services/firebase'; // Ensure Firebase is initialized before everything else
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
