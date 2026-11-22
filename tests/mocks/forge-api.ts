// Minimal in-memory stand-in for @forge/api used by the integration test.
export const calls: Array<{ product: string; method: string; path: string; body?: any }> = [];
export const state: { jira: Record<string, any>; confluence: Record<string, any>; allow: boolean } = { jira: {}, confluence: {}, allow: true };

export function route(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce((acc, s, i) => acc + s + (i < values.length ? encodeURIComponent(String(values[i])) : ''), '');
}

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

async function jira(path: string, init: any = {}) {
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ product: 'jira', method, path, body });
  if (path === '/rest/api/3/serverInfo') return respond(200, { baseUrl: 'https://demo.atlassian.net' });
  if (path === '/rest/api/3/permissions/check') {
    const issues = state.allow ? body.projectPermissions[0].issues : [];
    return respond(200, { projectPermissions: [{ permission: body.projectPermissions[0].permissions[0], issues }] });
  }
  const remote = path.match(/^\/rest\/api\/3\/issue\/([^/?]+)\/remotelink$/);
  if (remote) return respond(200, state.jira[decodeURIComponent(remote[1])]?.remoteLinks ?? []);
  const comment = path.match(/^\/rest\/api\/3\/issue\/([^/?]+)\/comment$/);
  if (comment && method === 'POST') return respond(201, { id: '10001' });
  const issue = path.match(/^\/rest\/api\/3\/issue\/([^/?]+)(\?.*)?$/);
  if (issue && method === 'PUT') return respond(204, undefined);
  if (issue) {
    const data = state.jira[decodeURIComponent(issue[1])];
    return data ? respond(200, data.issue) : respond(404, { errorMessages: ['Issue does not exist'] });
  }
  return respond(404, { path });
}

async function confluence(path: string, init: any = {}) {
  const method = init.method ?? 'GET';
  calls.push({ product: 'confluence', method, path });
  const page = path.match(/^\/wiki\/api\/v2\/pages\/(\d+)/);
  if (page) {
    const data = state.confluence[page[1]];
    return data ? respond(200, data) : respond(404, { message: 'Not found' });
  }
  return respond(404, { path });
}

const methods = { requestJira: jira, requestConfluence: confluence };
const api = { asApp: () => methods, asUser: () => methods };
export default api;
