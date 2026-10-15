#!/usr/bin/env node
'use strict';

/**
 * Contract drift check: every route the app calls through `apiRequest` / `apiRequestPage` must exist in the
 * backend route manifest (`tests/routes.json` in the gathr-api repo) or be listed in `scripts/contract-allowlist.json`
 * with a justification.
 *
 *   npm run check:contract -- --routes ../gathr-api/tests/routes.json
 *   GATHR_ROUTES_JSON=../gathr-api/tests/routes.json npm run check:contract
 *
 * `tests/routes.json` only lists the ~95 endpoints the backend's prod-full walkthrough hits (no /creators, /posts, /parties,
 * /me/*, /vibe-notes), so on its own it reports ~130 false gaps. `--backend <gathr-api checkout>` (or GATHR_API_DIR) scans
 * the backend's route files instead (scripts/lib/backendRoutes.js); with both, the two manifests are merged.
 *
 *   npm run check:contract -- --backend ../gathr-api
 *
 * Exit code 1 when an app route has no backend route, an allowlist entry is stale, or a call cannot be resolved.
 * Not wired into CI: the backend repo is private, so CI needs a token to fetch the manifest (see docs/TASKS.md F-09.1).
 */

const fs = require('fs');
const path = require('path');
const {extractApp, diffContract} = require('./lib/contract');
const {backendRoutes} = require('./lib/backendRoutes');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: check-contract.js [--routes <gathr-api tests/routes.json>] [--backend <gathr-api checkout>] [--allowlist <path> | --no-allowlist] [--json]\n       or set GATHR_ROUTES_JSON / GATHR_API_DIR');
  process.exit(0);
}

const routesPath = flag('--routes') || process.env.GATHR_ROUTES_JSON;
const backendDir = flag('--backend') || process.env.GATHR_API_DIR;
if (!routesPath && !backendDir) {
  console.error('Missing backend routes. Pass --routes <tests/routes.json> or --backend <gathr-api checkout> (env GATHR_ROUTES_JSON / GATHR_API_DIR).');
  process.exit(2);
}
const allowlistPath = flag('--allowlist') || path.join(__dirname, 'contract-allowlist.json');
const useAllowlist = !args.includes('--no-allowlist');

const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
let manifest;
let allowlist;
try {
  manifest = routesPath ? readJson(routesPath) : [];
  allowlist = useAllowlist && fs.existsSync(allowlistPath) ? readJson(allowlistPath).allow : [];
} catch (error) {
  console.error(`Cannot read inputs: ${error.message}`);
  process.exit(2);
}
if (!Array.isArray(manifest) || !manifest.every(route => typeof route === 'string' && /^[A-Z]+ \//.test(route))) {
  console.error('Route manifest must be a JSON array of "METHOD /path" strings (gathr-api tests/routes.json).');
  process.exit(2);
}
if (backendDir) {
  try {
    manifest = [...new Set([...manifest, ...backendRoutes(path.resolve(backendDir))])];
  } catch (error) {
    console.error(`Cannot scan backend at ${backendDir}: ${error.message}`);
    process.exit(2);
  }
}
if (!Array.isArray(allowlist) || !allowlist.every(entry => entry.route && entry.reason)) {
  console.error('Every allowlist entry needs "route" and "reason".');
  process.exit(2);
}

const {routes, unresolved} = extractApp(path.join(root, 'src'), root);
const {missing, allowed, stale} = diffContract(routes, manifest, allowlist);

if (args.includes('--json')) {
  console.log(JSON.stringify({appRoutes: routes.size, missing, allowed, stale, unresolved}, null, 2));
} else {
  const format = ({route, sites}) => `  ${route}\n${sites.map(site => `      ${site}`).join('\n')}`;
  console.log(`App routes: ${routes.size}, backend manifest routes: ${manifest.length}`);
  if (allowed.length) console.log(`\nAllowlisted (${allowed.length}):\n${allowed.map(item => `${format(item)}\n      reason: ${allowlist.find(a => a.route === item.route).reason}`).join('\n')}`);
  if (missing.length) console.log(`\nMISSING from backend (${missing.length}):\n${missing.map(format).join('\n')}`);
  if (stale.length) console.log(`\nSTALE allowlist entries (route is no longer called, or the backend now has it) (${stale.length}):\n${stale.map(a => `  ${a.route}`).join('\n')}`);
  if (unresolved.length) console.log(`\nUNRESOLVED calls (${unresolved.length}):\n${unresolved.map(u => `  ${u.file}:${u.line}  ${u.reason}\n      ${u.text}`).join('\n')}`);
}

const failed = missing.length + stale.length + unresolved.length > 0;
if (!args.includes('--json')) console.log(failed ? '\ncheck:contract FAILED' : '\ncheck:contract passed');
process.exit(failed ? 1 : 0);
