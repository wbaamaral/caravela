import type {KeyValueStorage} from '../../src/auth/store';
import {DEFAULT_MAX_BITRATE} from '../../src/playback/deviceProfile';
import {
  DEFAULT_SETTINGS,
  MAX_BITRATES,
  STORAGE_KEY,
  bitrateLabel,
  createSettingsStore,
  maxAudioChannelsFor,
} from '../../src/settings/store';

const memoryStorage = (): KeyValueStorage & {data: Map<string, string>} => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
};

describe('settings store', () => {
  it('starts at the defaults: direct audio, the profile bitrate', async () => {
    const store = createSettingsStore(memoryStorage());
    expect(store.current()).toEqual(DEFAULT_SETTINGS);
    await expect(store.load()).resolves.toEqual({
      audioBehavior: 'direct',
      maxStreamingBitrate: DEFAULT_MAX_BITRATE,
    });
  });

  it('fills a setting missing from an older save with its default', async () => {
    const storage = memoryStorage();
    storage.data.set(STORAGE_KEY, JSON.stringify({audioBehavior: 'downmix'}));
    await expect(createSettingsStore(storage).load()).resolves.toEqual({
      audioBehavior: 'downmix',
      maxStreamingBitrate: DEFAULT_MAX_BITRATE,
    });
  });

  it('saves the bitrate cap without touching the audio setting', async () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    await store.setAudioBehavior('downmix');
    await store.setMaxStreamingBitrate(3_000_000);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual({
      audioBehavior: 'downmix',
      maxStreamingBitrate: 3_000_000,
    });
  });

  it('saves the audio behavior and reads it back in a new store', async () => {
    const storage = memoryStorage();
    await createSettingsStore(storage).setAudioBehavior('downmix');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toMatchObject({
      audioBehavior: 'downmix',
    });

    const reopened = createSettingsStore(storage);
    expect(reopened.current().audioBehavior).toBe('direct');
    await reopened.load();
    expect(reopened.current().audioBehavior).toBe('downmix');
  });

  it('keeps the last of two quick saves', async () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    await Promise.all([
      store.setAudioBehavior('downmix'),
      store.setAudioBehavior('direct'),
    ]);
    expect(store.current().audioBehavior).toBe('direct');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).audioBehavior).toBe(
      'direct',
    );
  });

  it('keeps the old value when a save fails', async () => {
    const storage = memoryStorage();
    storage.setItem = jest.fn().mockRejectedValue(new Error('disk full'));
    const store = createSettingsStore(storage);
    await expect(store.setAudioBehavior('downmix')).rejects.toThrow(
      'disk full',
    );
    expect(store.current().audioBehavior).toBe('direct');
  });

  it('loads again after a failed read', async () => {
    const storage = memoryStorage();
    storage.data.set(STORAGE_KEY, JSON.stringify({audioBehavior: 'downmix'}));
    const getItem = storage.getItem;
    storage.getItem = jest
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockImplementation(getItem);
    const store = createSettingsStore(storage);
    await expect(store.load()).rejects.toThrow('busy');
    await expect(store.load()).resolves.toMatchObject({
      audioBehavior: 'downmix',
    });
  });

  it('maps downmix to 2 channels and direct to the profile default', () => {
    expect(maxAudioChannelsFor('downmix')).toBe(2);
    expect(maxAudioChannelsFor('direct')).toBe(8);
  });

  it('lists the bitrates highest first, the default among them', () => {
    expect(MAX_BITRATES[0]).toBe(120_000_000);
    expect([...MAX_BITRATES].sort((a, b) => b - a)).toEqual(MAX_BITRATES);
    expect(MAX_BITRATES).toContain(DEFAULT_MAX_BITRATE);
    expect(MAX_BITRATES).toContain(3_000_000);
  });

  it('labels bitrates in Mbps, and in kbps below 1 Mbps', () => {
    expect(bitrateLabel(100_000_000)).toBe('100 Mbps');
    expect(bitrateLabel(1_500_000)).toBe('1.5 Mbps');
    expect(bitrateLabel(720_000)).toBe('720 kbps');
  });
});
