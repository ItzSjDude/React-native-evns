const fs = require('fs');
const os = require('os');
const path = require('path');
const {extractCalls, routeMatches, diffContract} = require('../lib/contract');
const {backendRoutes} = require('../lib/backendRoutes');

const extract = (source, loadImport) => {
  const {calls, unresolved} = extractCalls(`import {apiRequest, apiRequestPage} from './api';\n${source}`, 'fixture.ts', loadImport);
  return {routes: calls.map(c => `${c.method} ${c.path}`).sort(), unresolved};
};

describe('extractCalls', () => {
  it('reads plain string paths, defaulting to GET and honouring the method option', () => {
    const {routes} = extract(`
      export const a = () => apiRequest('/auth/me', {auth: 'required'});
      export const b = () => apiRequest<void>("/auth/me", {method: 'DELETE'});
      export const c = () => apiRequestPage<X[]>('/notifications');
    `);
    expect(routes).toEqual(['DELETE /auth/me', 'GET /auth/me', 'GET /notifications']);
  });

  it('turns template interpolations into :id and drops query strings', () => {
    const {routes} = extract(`
      export const a = (id: string) => apiRequest(\`/workspaces/\${encodeURIComponent(id)}/credits?limit=\${20}&offset=\${0}\`);
      export const b = (a: string, b: string) => apiRequest(\`/workspaces/\${a}/events/\${b}/stats\`);
    `);
    expect(routes).toEqual(['GET /workspaces/:id/credits', 'GET /workspaces/:id/events/:id/stats']);
  });

  it('drops a trailing query-builder interpolation glued to the path', () => {
    const {routes, unresolved} = extract(`
      const qs = (x: number) => '?limit=' + x;
      export const a = (x: number) => apiRequest(\`/nearby\${qs(x)}\`);
      export const b = (extra: string) => apiRequest(\`/nearby?radius=1\${extra}\`);
      export const c = (extra: string) => apiRequest('/events' + extra);
    `);
    expect(unresolved).toEqual([]);
    expect(routes).toEqual(['GET /events', 'GET /nearby', 'GET /nearby']);
  });

  it('follows local path helpers and constant prefixes', () => {
    const {routes} = extract(`
      const base = '/host-studio';
      const user = (id: string) => \`/users/\${encodeURIComponent(id)}\`;
      const net = (eventId: string) => \`/events/\${eventId}/networking\`;
      export const a = () => apiRequest(\`\${base}/templates\`);
      export const b = (id: string) => apiRequest(\`\${user(id)}/follow\`, {method: 'POST'});
      export const c = (id: string) => apiRequest(\`\${net(id)}/me\`);
    `);
    expect(routes).toEqual(['GET /events/:id/networking/me', 'GET /host-studio/templates', 'POST /users/:id/follow']);
  });

  it('keeps module prefixes (/waitlist, /tiers, /scanner, /transfers) as written', () => {
    const {routes} = extract(`
      export const a = (e: string) => apiRequest(\`/waitlist/events/\${e}/join\`, {method: 'POST'});
      export const b = (e: string) => apiRequest(\`/tiers/events/\${e}\`);
      export const c = (w: string) => apiRequest(\`/scanner/workspaces/\${w}/devices\`);
      export const d = () => apiRequest('/transfers/mine');
    `);
    expect(routes).toEqual(['GET /scanner/workspaces/:id/devices', 'GET /tiers/events/:id', 'GET /transfers/mine', 'POST /waitlist/events/:id/join']);
  });

  it('expands every value of a route lookup object', () => {
    const {routes} = extract(`
      const route: Record<string, string> = {all: '/parties/discover', hot: '/parties/discover/trending'};
      export const a = (f: string) => apiRequest(route[f] + '?limit=20', {auth: 'required'});
    `);
    expect(routes).toEqual(['GET /parties/discover', 'GET /parties/discover/trending']);
  });

  it('expands a path segment typed as a string-literal union, including imported aliases', () => {
    const types = {fileName: 'types.ts', text: "export type Kind = 'followers' | 'following';"};
    const {routes, unresolved} = extract(`
      import type {Kind} from './types';
      type Tab = 'posts' | 'events';
      export const a = (id: string, tab: Tab) => apiRequest(\`/users/\${id}/\${tab}?limit=20\`);
      export const b = (id: string, kind: Kind) => apiRequest(\`/users/\${id}/\${kind}\`);
    `, () => types);
    expect(unresolved).toEqual([]);
    expect(routes).toEqual(['GET /users/:id/events', 'GET /users/:id/followers', 'GET /users/:id/following', 'GET /users/:id/posts']);
  });

  it('resolves method helpers such as json(method, body)', () => {
    const {routes} = extract(`
      const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      export const a = () => apiRequest('/me/discovery-presets', json('POST', {}));
      export const b = (id: string) => apiRequest(\`/me/discovery-presets/\${id}\`, json('PATCH', {}));
    `);
    expect(routes).toEqual(['PATCH /me/discovery-presets/:id', 'POST /me/discovery-presets']);
  });

  it('expands thin wrappers over their call sites (path suffix and method)', () => {
    const {routes, unresolved} = extract(`
      const action = (id: string, path: string, method = 'POST') => apiRequest(\`/parties/\${id}\${path}\`, {auth: 'required', method});
      export const end = (id: string) => action(id, '/end');
      export const leave = (id: string, seat: string) => action(id, \`/seat-requests/\${seat}\`, 'DELETE');
    `);
    expect(unresolved).toEqual([]);
    expect(routes).toEqual(['DELETE /parties/:id/seat-requests/:id', 'POST /parties/:id/end']);
  });

  it('reports calls it cannot resolve instead of dropping them', () => {
    const {routes, unresolved} = extract(`
      export const a = (url: string) => apiRequest(url);
      export const b = (id: string) => apiRequest(\`/x/\${id}\`, options);
    `);
    expect(routes).toEqual([]);
    expect(unresolved).toHaveLength(2);
    expect(unresolved.map(u => u.line)).toEqual([3, 4]);
  });

  it('ignores same-named identifiers that are not apiRequest calls', () => {
    const {routes} = extract(`const x = other.apiRequest('/nope'); const y = () => '/also-no';`);
    expect(routes).toEqual([]);
  });
});

describe('routeMatches / diffContract', () => {
  it('matches parameters by position regardless of name, and methods exactly', () => {
    expect(routeMatches('GET /tickets/:id', 'GET /tickets/:ticketId')).toBe(true);
    expect(routeMatches('POST /tickets/:id', 'GET /tickets/:id')).toBe(false);
    expect(routeMatches('GET /tickets/:id/x', 'GET /tickets/:id')).toBe(false);
  });

  it('does not let an app parameter satisfy a literal backend segment', () => {
    expect(routeMatches('GET /users/:id', 'GET /users/me')).toBe(false);
    expect(routeMatches('GET /users/me', 'GET /users/:id')).toBe(true);
  });

  it('reports missing, allowlisted and stale entries', () => {
    const app = new Map([
      ['GET /a', ['f.ts:1']],
      ['GET /b', ['f.ts:2']],
      ['GET /c', ['f.ts:3']],
    ]);
    const result = diffContract(app, ['GET /a'], [
      {route: 'GET /b', reason: 'not built'},
      {route: 'GET /a', reason: 'backend has it now'},
      {route: 'GET /gone', reason: 'no longer called'},
    ]);
    expect(result.missing.map(m => m.route)).toEqual(['GET /c']);
    expect(result.allowed.map(m => m.route)).toEqual(['GET /b']);
    expect(result.stale.map(m => m.route)).toEqual(['GET /a', 'GET /gone']);
  });
});

describe('backendRoutes', () => {
  it('joins mounts, nested mounts, named routers and module mounts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gathr-'));
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), content);
    };
    write('src/routes/index.js', `
      const hubRoutes = require('./hubs.routes');
      router.get('/health', h);
      router.use('/chat', require('./chat.routes'));
      router.use('/hubs', hubRoutes.hubs);
      router.use('/me/settings', require('./settings.routes'));
      router.use('/', require('./location.routes'));
    `);
    write('src/routes/chat.routes.js', `router.use('/inbox', require('./inbox.routes'));\nrouter.get('/:conversationId', c);`);
    write('src/routes/inbox.routes.js', `router.patch('/:id/state', c);`);
    write('src/routes/hubs.routes.js', `const hubs = Router(); const other = Router();\nhubs.post('/:hubId/invites', c);\nother.get('/ignored', c);`);
    write('src/routes/settings.routes.js', `router.get('/', c);\nrouter.patch('/', c);`);
    write('src/routes/location.routes.js', `router.post('/me/location', c);`);
    write('modules.config.js', `  waitlist: { datasource: 'core', mount: '/waitlist', enabled: true },`);
    write('src/modules/waitlist/routes.js', `router.delete(\n '/events/:eventId/leave',\n v);`);

    expect(backendRoutes(root)).toEqual([
      'DELETE /waitlist/events/:id/leave',
      'GET /chat/:id',
      'GET /health',
      'GET /me/settings',
      'PATCH /chat/inbox/:id/state',
      'PATCH /me/settings',
      'POST /hubs/:id/invites',
      'POST /me/location',
    ]);
  });
});
