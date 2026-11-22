const store = new Map<string, unknown>();
export const kvs = {
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => void store.set(key, value),
  delete: async (key: string) => void store.delete(key),
};
export default kvs;
