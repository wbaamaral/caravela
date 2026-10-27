import type {KeyValueStorage} from '../../src/auth/store';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
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
  it('starts at the defaults: direct audio', async () => {
    const store = createSettingsStore(memoryStorage());
    expect(store.current()).toEqual(DEFAULT_SETTINGS);
    await expect(store.load()).resolves.toEqual({audioBehavior: 'direct'});
  });

  it('saves the audio behavior and reads it back in a new store', async () => {
    const storage = memoryStorage();
    await createSettingsStore(storage).setAudioBehavior('downmix');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual({
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
    await expect(store.load()).resolves.toEqual({audioBehavior: 'downmix'});
  });

  it('maps downmix to 2 channels and direct to the profile default', () => {
    expect(maxAudioChannelsFor('downmix')).toBe(2);
    expect(maxAudioChannelsFor('direct')).toBe(8);
  });
});
