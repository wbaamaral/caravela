import AsyncStorage from '@react-native-async-storage/async-storage';

import type {KeyValueStorage} from '../auth/store';
import {DEFAULT_MAX_AUDIO_CHANNELS} from '../playback/deviceProfile';

/**
 * The app's local settings (androidtv's `UserPreferences`), kept on the
 * device in AsyncStorage next to the auth store.
 */

/**
 * androidtv's "Audio behavior": send the track as it is, or have the server
 * downmix it to stereo (for a 2.0 TV, whose own downmix buries dialogue).
 */
export type AudioBehavior = 'direct' | 'downmix';

/** The choices as Settings and the player list them. */
export const AUDIO_BEHAVIORS: {value: AudioBehavior; label: string}[] = [
  {value: 'direct', label: 'Direct'},
  {value: 'downmix', label: 'Downmix to stereo'},
];

export interface Settings {
  audioBehavior: AudioBehavior;
}

export const STORAGE_KEY = 'caravela.settings.v1';

export const DEFAULT_SETTINGS: Settings = {audioBehavior: 'direct'};

/** The channel cap each behavior sends in the device profile. */
export const maxAudioChannelsFor = (behavior: AudioBehavior): number =>
  behavior === 'downmix' ? 2 : DEFAULT_MAX_AUDIO_CHANNELS;

export interface SettingsStore {
  /** Reads the saved settings once; later calls return the same values. */
  load(): Promise<Settings>;
  /**
   * The settings now, for code that can't wait (the player's resolve): the
   * defaults until {@link load} finishes.
   */
  current(): Settings;
  setAudioBehavior(audioBehavior: AudioBehavior): Promise<void>;
}

export function createSettingsStore(
  storage: KeyValueStorage = AsyncStorage,
): SettingsStore {
  let cache: Settings | undefined;
  let loading: Promise<Settings> | undefined;
  // Serializes writes so a slow save can't land after a newer one.
  let queue: Promise<unknown> = Promise.resolve();

  const load = (): Promise<Settings> => {
    if (cache) {
      return Promise.resolve({...cache});
    }
    if (!loading) {
      loading = storage.getItem(STORAGE_KEY).then(
        (raw) => {
          const loaded: Settings = {
            ...DEFAULT_SETTINGS,
            ...(raw ? JSON.parse(raw) : {}),
          };
          cache = loaded;
          return {...loaded};
        },
        (reason) => {
          // The next call tries again.
          loading = undefined;
          throw reason;
        },
      );
    }
    return loading;
  };

  return {
    load,
    current: () => ({...(cache ?? DEFAULT_SETTINGS)}),
    setAudioBehavior: (audioBehavior) => {
      const result = queue.then(async () => {
        const next: Settings = {...(await load()), audioBehavior};
        await storage.setItem(STORAGE_KEY, JSON.stringify(next));
        cache = next;
      });
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

let defaultStore: SettingsStore | undefined;

/** App-wide store backed by AsyncStorage. */
export function getSettingsStore(): SettingsStore {
  defaultStore ??= createSettingsStore();
  return defaultStore;
}
