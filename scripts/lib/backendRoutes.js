'use strict';

/**
 * Best-effort static route manifest for a gathr-api checkout, as `METHOD /path/:id` strings.
 *
 * Needed because the backend's own `tests/routes.json` only lists the endpoints its `prod-full.js` walkthrough hits
 * (about 95; no /creators, /posts, /parties, /me/*, /vibe-notes, ...), so it under-reports and cannot gate the app alone.
 * Reads `src/routes/index.js` mounts, nested `router.use('/x', require('./y'))` mounts, named routers
 * (`businessHubRoutes.hubs`) and the module mounts in `modules.config.js`. No backend code is executed.
 */

const fs = require('fs');
const path = require('path');

const METHOD_CALL = /\b(\w+)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\3/g;
const MOUNT_CALL = /\b\w+\.use\(\s*'([^']*)'\s*,\s*(?:require\('\.\/([\w.]+)'\)|(\w+)\.(\w+)|(\w+))\s*\)/g;

const normalise = p => ('/' + p.split('/').filter(Boolean).map(s => (s.startsWith(':') ? ':id' : s)).join('/')).replace(/\/$/, '') || '/';
const join = (prefix, sub) => normalise(`${prefix}/${sub}`);

function backendRoutes(backendRoot) {
  const read = file => fs.readFileSync(path.join(backendRoot, file), 'utf8');
  const out = new Set();

  /** Routes declared in a file, grouped by router variable. */
  const declared = file => {
    const source = read(file);
    const byRouter = {};
    for (const [, router, method, , route] of source.matchAll(METHOD_CALL)) {
      (byRouter[router] ||= []).push(`${method.toUpperCase()} ${route}`);
    }
    return {source, byRouter};
  };

  const mountFile = (file, prefix, routerName) => {
    const {source, byRouter} = declared(file);
    const own = routerName ? byRouter[routerName] : Object.values(byRouter).flat();
    for (const entry of own || []) {
      const [method, route] = entry.split(' ');
      out.add(`${method} ${join(prefix, route)}`);
    }
    const dir = path.dirname(file);
    const requires = Object.fromEntries([...source.matchAll(/const (\w+) = require\('\.\/([\w.]+)'\)/g)].map(m => [m[1], m[2]]));
    for (const [, sub, direct, holder, named] of source.matchAll(MOUNT_CALL)) {
      const target = direct || requires[holder];
      if (target && sub && file !== path.join(dir, `${target}.js`)) mountFile(path.join(dir, `${target}.js`), join(prefix, sub), named);
    }
  };

  // Mounts in index.js. `router.use('/', require('./location.routes'))` mounts at the root.
  const index = 'src/routes/index.js';
  const indexSource = read(index);
  const requires = Object.fromEntries([...indexSource.matchAll(/const (\w+) = require\('\.\/([\w.]+)'\)/g)].map(m => [m[1], m[2]]));
  for (const [, sub, direct, holder, named] of indexSource.matchAll(MOUNT_CALL)) {
    const target = direct || requires[holder];
    if (target) mountFile(`src/routes/${target}.js`, normalise(sub), named);
  }
  for (const [, route] of indexSource.matchAll(/router\.get\('([^']+)'/g)) out.add(`GET ${normalise(route)}`);

  // Modules: `name: { ..., mount: '/x' }`. The tickets module serves src/routes/ticket.routes.js.
  const config = read('modules.config.js');
  for (const [, name, mount] of config.matchAll(/^\s*(\w+):\s*\{[^}]*mount: '([^']+)'/gm)) {
    const file = name === 'tickets' ? 'src/routes/ticket.routes.js' : `src/modules/${name}/routes.js`;
    if (fs.existsSync(path.join(backendRoot, file))) mountFile(file, mount);
  }
  return [...out].sort();
}

module.exports = {backendRoutes};
