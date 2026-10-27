import AsyncStorage from '@react-native-async-storage/async-storage';

import type {KeyValueStorage} from '../auth/store';
import {
  DEFAULT_MAX_AUDIO_CHANNELS,
  DEFAULT_MAX_BITRATE,
} from '../playback/deviceProfile';

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

/**
 * "Max streaming bitrate" choices, in bits per second, highest first (in the
 * style of androidtv's quality presets). The server transcodes anything
 * above it.
 */
export const MAX_BITRATES: number[] = [
  120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1.5,
  1, 0.72, 0.42,
].map((mbps) => Math.round(mbps * 1_000_000));

/** "100 Mbps", "1.5 Mbps", "720 kbps". */
export const bitrateLabel = (bps: number): string =>
  bps >= 1_000_000 ? `${bps / 1_000_000} Mbps` : `${bps / 1000} kbps`;

export interface Settings {
  audioBehavior: AudioBehavior;
  /** In bits per second. */
  maxStreamingBitrate: number;
}

export const STORAGE_KEY = 'caravela.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  audioBehavior: 'direct',
  maxStreamingBitrate: DEFAULT_MAX_BITRATE,
};

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
  setMaxStreamingBitrate(maxStreamingBitrate: number): Promise<void>;
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

  const save = (patch: Partial<Settings>): Promise<void> => {
    const result = queue.then(async () => {
      const next: Settings = {...(await load()), ...patch};
      await storage.setItem(STORAGE_KEY, JSON.stringify(next));
      cache = next;
    });
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    load,
    current: () => ({...(cache ?? DEFAULT_SETTINGS)}),
    setAudioBehavior: (audioBehavior) => save({audioBehavior}),
    setMaxStreamingBitrate: (maxStreamingBitrate) =>
      save({maxStreamingBitrate}),
  };
}

let defaultStore: SettingsStore | undefined;

/** App-wide store backed by AsyncStorage. */
export function getSettingsStore(): SettingsStore {
  defaultStore ??= createSettingsStore();
  return defaultStore;
}
