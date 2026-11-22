import api, { route } from '@forge/api';
import { adfToText } from '../engine/claim';

export const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;

export interface IssueData {
  id: string;
  key: string;
  summary: string;
  description: string;
  created: string;
  attachments: string[];
  labels: string[];
  projectId: string;
  url: string;
  remoteLinks: string[];
}

type Actor = 'app' | 'user';

async function jiraJson<T>(path: ReturnType<typeof route>, init?: RequestInit, actor: Actor = 'app'): Promise<T> {
  const client = actor === 'user' ? api.asUser() : api.asApp();
  const res = await client.requestJira(path, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  } as any);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

let cachedBaseUrl: string | undefined;
export async function siteBaseUrl(): Promise<string> {
  if (!cachedBaseUrl) {
    const info = await jiraJson<{ baseUrl: string }>(route`/rest/api/3/serverInfo`);
    cachedBaseUrl = info.baseUrl.replace(/\/$/, '');
  }
  return cachedBaseUrl;
}

export async function getIssue(issueKey: string): Promise<IssueData> {
  const issue = await jiraJson<any>(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,created,attachment,labels,project`,
  );
  let remoteLinks: string[] = [];
  try {
    const links = await jiraJson<any[]>(route`/rest/api/3/issue/${issueKey}/remotelink`);
    remoteLinks = links.map((l) => l?.object?.url).filter((u): u is string => typeof u === 'string');
  } catch {
    remoteLinks = [];
  }
  const base = await siteBaseUrl();
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary ?? '',
    description: issue.fields.description ? adfToText(issue.fields.description) : '',
    created: issue.fields.created,
    attachments: (issue.fields.attachment ?? []).map((a: any) => a.filename as string),
    labels: issue.fields.labels ?? [],
    projectId: issue.fields.project?.id,
    url: `${base}/browse/${issue.key}`,
    remoteLinks,
  };
}

/**
 * Checks a permission for the user who triggered the request, using the user's own credentials.
 * The app reads data as itself, so this keeps users from reaching claims they could not open in Jira.
 */
export async function currentUserCan(issueKey: string, permission: string): Promise<boolean> {
  const result = await jiraJson<{ permissions?: Record<string, { havePermission?: boolean }> }>(
    route`/rest/api/3/mypermissions?issueKey=${issueKey}&permissions=${permission}`,
    undefined,
    'user',
  );
  return result.permissions?.[permission]?.havePermission === true;
}

/** Posts a comment as the current user, so Jira enforces their permission to comment. */
export async function addComment(issueKey: string, body: unknown): Promise<string> {
  const comment = await jiraJson<{ id: string }>(
    route`/rest/api/3/issue/${issueKey}/comment`,
    { method: 'POST', body: JSON.stringify({ body }) },
    'user',
  );
  const base = await siteBaseUrl();
  return `${base}/browse/${issueKey}?focusedCommentId=${comment.id}`;
}

/** Adds a label as the current user, so Jira enforces their permission to edit the issue. */
export async function addLabel(issueKey: string, label: string): Promise<void> {
  await jiraJson(
    route`/rest/api/3/issue/${issueKey}`,
    { method: 'PUT', body: JSON.stringify({ update: { labels: [{ add: label }] } }) },
    'user',
  );
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const page = await jiraJson<{ values: any[] }>(route`/rest/api/3/project/search?maxResults=50&orderBy=name`);
  return page.values.map((p) => ({ id: p.id, key: p.key, name: p.name }));
}

async function pickIssueType(projectId: string): Promise<string> {
  const meta = await jiraJson<{ issueTypes?: any[]; values?: any[] }>(route`/rest/api/3/issue/createmeta/${projectId}/issuetypes`);
  const types = (meta.issueTypes ?? meta.values ?? []).filter((t) => !t.subtask);
  const preferred = types.find((t) => /^(claim|task)$/i.test(t.name)) ?? types.find((t) => !/epic/i.test(t.name)) ?? types[0];
  if (!preferred) throw new Error('No issue type is available in this project.');
  return preferred.id;
}

export async function createIssue(projectId: string, summary: string, description: unknown, labels: string[]): Promise<string> {
  const issueTypeId = await pickIssueType(projectId);
  const created = await jiraJson<{ key: string }>(route`/rest/api/3/issue`, {
    method: 'POST',
    body: JSON.stringify({ fields: { project: { id: projectId }, issuetype: { id: issueTypeId }, summary, description, labels } }),
  });
  return created.key;
}
