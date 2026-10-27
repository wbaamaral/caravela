import {
  enableFreeze,
  enableScreens,
} from '@amazon-devices/react-native-screens';
import React from 'react';

import {RootNavigator} from './navigation/RootNavigator';
import {getSettingsStore} from './settings/store';

enableScreens();
enableFreeze();

// Early, so the player's resolve (which can't wait) sees the saved values.
getSettingsStore()
  .load()
  .catch((reason) => console.warn('Loading the settings failed', reason));

export const App = () => <RootNavigator />;
