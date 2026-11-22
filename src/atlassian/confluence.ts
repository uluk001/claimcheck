import api, { route } from '@forge/api';

export interface PageData {
  id: string;
  title: string;
  storage: string;
  url: string;
}

async function confluenceJson<T>(path: ReturnType<typeof route>, init?: RequestInit): Promise<T> {
  const res = await api.asApp().requestConfluence(path, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  } as any);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confluence request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Extracts a Confluence page id from a page URL, a tiny link with pageId, or a bare id. */
export function pageIdFrom(ref: string | undefined): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (/^\d{3,}$/.test(trimmed)) return trimmed;
  const path = trimmed.match(/\/pages\/(\d+)/);
  if (path) return path[1];
  const query = trimmed.match(/[?&]pageId=(\d+)/);
  return query ? query[1] : null;
}

export async function getPage(pageId: string, siteBase: string): Promise<PageData> {
  const page = await confluenceJson<any>(route`/wiki/api/v2/pages/${pageId}?body-format=storage`);
  const webui: string = page?._links?.webui ?? `/pages/viewpage.action?pageId=${pageId}`;
  return {
    id: String(page.id),
    title: page.title,
    storage: page?.body?.storage?.value ?? '',
    url: `${siteBase}/wiki${webui}`,
  };
}

export interface SpaceSummary {
  id: string;
  key: string;
  name: string;
}

export async function listSpaces(): Promise<SpaceSummary[]> {
  const page = await confluenceJson<{ results: any[] }>(route`/wiki/api/v2/spaces?limit=50&type=global&status=current`);
  return page.results.map((s) => ({ id: String(s.id), key: s.key, name: s.name }));
}

export async function findPageByTitle(spaceId: string, title: string): Promise<string | null> {
  const page = await confluenceJson<{ results: any[] }>(route`/wiki/api/v2/pages?space-id=${spaceId}&title=${title}&limit=1`);
  return page.results[0] ? String(page.results[0].id) : null;
}

export async function createPage(spaceId: string, title: string, storage: string): Promise<string> {
  const existing = await findPageByTitle(spaceId, title);
  if (existing) return existing;
  const page = await confluenceJson<{ id: string }>(route`/wiki/api/v2/pages`, {
    method: 'POST',
    body: JSON.stringify({ spaceId, status: 'current', title, body: { representation: 'storage', value: storage } }),
  });
  return String(page.id);
}
