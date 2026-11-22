import { invoke } from '@forge/bridge';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Calls a resolver and normalises the response, which may be wrapped with metadata. */
export async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const raw: any = await invoke(name, payload);
    const body = raw && typeof raw === 'object' && !('ok' in raw) && 'body' in raw ? raw.body : raw;
    if (!body || typeof body !== 'object' || !('ok' in body)) return { ok: false, error: 'Unexpected response from Claim Check.' };
    return body as Result<T>;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
