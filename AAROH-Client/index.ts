import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent wraps AppRegistry.registerComponent and additionally
// ensures the app works correctly in both Expo Go and a native Dev Client build.
registerRootComponent(App);
