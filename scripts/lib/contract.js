'use strict';

/**
 * Static extraction of the backend routes the app calls (`apiRequest` / `apiRequestPage`) and the diff against a
 * backend route manifest. Pure functions only; the CLI lives in `scripts/check-contract.js`.
 *
 * Paths are normalised to `METHOD /a/:id/b`: every interpolated segment becomes `:id`, query strings are dropped.
 * Local helpers are followed (`const base = (id) => ...`, `route[filter] + query`) and thin wrappers such as
 * `const action = (id, path, method) => apiRequest(`/x/${id}${path}`, {method})` are expanded over their call sites.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const CALLEES = new Set(['apiRequest', 'apiRequestPage']);
const UNKNOWN = '\uE000';
const MAX_DEPTH = 10;
const MAX_CANDIDATES = 32;

const uniq = list => [...new Set(list)].slice(0, MAX_CANDIDATES);
const product = (left, right) => uniq(left.flatMap(a => right.map(b => a + b)));

const isFunctionLike = node =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);

/** Initializer of the nearest visible `const/let/var name` or function declaration named `name`, or a parameter. */
function lookup(identifier) {
  const name = identifier.text;
  for (let node = identifier.parent; node; node = node.parent) {
    if (isFunctionLike(node)) {
      const param = node.parameters.find(p => ts.isIdentifier(p.name) && p.name.text === name);
      if (param) return {param, owner: node};
    }
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)) {
      for (const statement of node.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name && statement.name.text === name) return {fn: statement};
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
            return {init: declaration.initializer};
          }
        }
      }
    }
  }
  return null;
}

/** Loads imported modules for type lookups; set per source file by `extractCalls`. */
const importLoaders = new WeakMap();

/** `loadImport(fromFile, specifier)` returns `{fileName, text}` of the module, or null. */
function attachImportLoader(sourceFile, fileName, loadImport) {
  if (!loadImport) return;
  importLoaders.set(sourceFile, specifier => {
    const loaded = loadImport(fileName, specifier);
    if (!loaded) return null;
    const imported = ts.createSourceFile(loaded.fileName, loaded.text, ts.ScriptTarget.Latest, true);
    attachImportLoader(imported, loaded.fileName, loadImport);
    return imported;
  });
}

function findTypeAlias(sourceFile, name, depth) {
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return {alias: statement, sourceFile};
  }
  const load = importLoaders.get(sourceFile);
  if (!load || depth > 3) return null;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause && statement.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const specifier = bindings.elements.find(e => e.name.text === name);
    if (!specifier) continue;
    const imported = load(statement.moduleSpecifier.text);
    return imported ? findTypeAlias(imported, (specifier.propertyName || specifier.name).text, depth + 1) : null;
  }
  return null;
}

/** Values of a string-literal union type (`'posts' | 'parties'`), following local and relative-import aliases; else null. */
function literalUnion(typeNode, sourceFile, depth = 0) {
  if (depth > 4) return null;
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) return [typeNode.literal.text];
  if (ts.isParenthesizedTypeNode(typeNode)) return literalUnion(typeNode.type, sourceFile, depth + 1);
  if (ts.isUnionTypeNode(typeNode)) {
    const parts = typeNode.types.map(t => literalUnion(t, sourceFile, depth + 1));
    return parts.every(Boolean) ? uniq(parts.flat()) : null;
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const found = findTypeAlias(sourceFile, typeNode.typeName.text, depth);
    return found ? literalUnion(found.alias.type, found.sourceFile, depth + 1) : null;
  }
  return null;
}

function functionResult(fn) {
  if (!fn.body) return null;
  if (!ts.isBlock(fn.body)) return fn.body;
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  return returns.length === 1 && fn.body.statements.length === 1 ? returns[0].expression : null;
}

function bindArguments(fn, args, env, depth) {
  const bound = new Map(env);
  fn.parameters.forEach((param, index) => {
    if (!ts.isIdentifier(param.name)) return;
    const source = args[index] || param.initializer;
    bound.set(param.name.text, source ? evalString(source, env, depth + 1) : [UNKNOWN]);
  });
  return bound;
}

/** Candidate string values of an expression; `UNKNOWN` marks the parts that are only known at runtime. */
function evalString(node, env, depth = 0) {
  if (depth > MAX_DEPTH) return [UNKNOWN];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    return evalString(node.expression, env, depth + 1);
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce(
      (acc, span) => product(product(acc, evalString(span.expression, env, depth + 1)), [span.literal.text]),
      [node.head.text],
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return product(evalString(node.left, env, depth + 1), evalString(node.right, env, depth + 1));
  }
  if (ts.isConditionalExpression(node)) {
    return uniq([...evalString(node.whenTrue, env, depth + 1), ...evalString(node.whenFalse, env, depth + 1)]);
  }
  if (ts.isIdentifier(node)) {
    if (env.has(node.text)) return env.get(node.text);
    const found = lookup(node);
    if (found && found.init && !isFunctionLike(found.init)) return evalString(found.init, env, depth + 1);
    // A parameter typed as a union of string literals (`tab: ProfileTab`) can only be one of those values.
    const values = found && found.param && found.param.type && literalUnion(found.param.type, node.getSourceFile());
    return values || [UNKNOWN];
  }
  if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
    // `route[filter]` / `route.all` where `route` is a local object literal of strings: every value is possible.
    if (ts.isIdentifier(node.expression)) {
      const found = lookup(node.expression);
      if (found && found.init && ts.isObjectLiteralExpression(found.init)) {
        const wanted = ts.isPropertyAccessExpression(node) ? node.name.text : null;
        const values = found.init.properties
          .filter(p => ts.isPropertyAssignment(p) && (!wanted || (p.name.text ?? p.name.getText()) === wanted))
          .flatMap(p => evalString(p.initializer, env, depth + 1));
        if (values.length) return uniq(values);
      }
    }
    return [UNKNOWN];
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const found = lookup(node.expression);
    const fn = found && (found.fn || (found.init && isFunctionLike(found.init) ? found.init : null));
    const result = fn && functionResult(fn);
    if (result) return evalString(result, bindArguments(fn, node.arguments, env, depth), depth + 1);
  }
  return [UNKNOWN];
}

/** HTTP methods of an options argument; `null` when it cannot be determined. */
function evalMethods(options, env, depth = 0) {
  if (!options) return ['GET'];
  if (depth > MAX_DEPTH) return null;
  if (ts.isParenthesizedExpression(options)) return evalMethods(options.expression, env, depth + 1);
  if (ts.isObjectLiteralExpression(options)) {
    const property = options.properties.find(p => p.name && p.name.getText() === 'method');
    if (!property) return ['GET'];
    const value = ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
    const methods = evalString(value, env, depth + 1);
    return methods.some(m => m.includes(UNKNOWN)) ? null : methods.map(m => m.toUpperCase());
  }
  if (ts.isCallExpression(options) && ts.isIdentifier(options.expression)) {
    const found = lookup(options.expression);
    const fn = found && (found.fn || (found.init && isFunctionLike(found.init) ? found.init : null));
    const result = fn && functionResult(fn);
    if (result) return evalMethods(result, bindArguments(fn, options.arguments, env, depth), depth + 1);
  }
  if (ts.isIdentifier(options)) {
    const found = lookup(options);
    if (found && found.init) return evalMethods(found.init, env, depth + 1);
  }
  return null;
}

/**
 * Turns a candidate with `UNKNOWN` holes into `/a/:id/b`.
 * A hole after `/` is a path parameter; a hole glued to a segment at the very end is a query-string builder;
 * anything else cannot be mapped to a route and returns null.
 */
function toRoutePath(candidate) {
  const query = candidate.indexOf('?');
  let value = query === -1 ? candidate : candidate.slice(0, query);
  if (!value.startsWith('/')) return null;
  value = value.replace(/\/\uE000+/g, '/:id').replace(/\uE000+$/, '');
  if (value.includes(UNKNOWN)) return null;
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

function findCallSites(sourceFile, name, skip) {
  const sites = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name && node !== skip) sites.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

/** Enclosing function bound to a name (`const action = (...) => ...` / `function action(...)`), if any. */
function enclosingNamedFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!isFunctionLike(current)) continue;
    if (ts.isFunctionDeclaration(current) && current.name) return {fn: current, name: current.name.text};
    if (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) return {fn: current, name: current.parent.name.text};
  }
  return null;
}

/**
 * Every `apiRequest`/`apiRequestPage` call in one source file.
 * @returns {{calls: {method: string, path: string, line: number}[], unresolved: {line: number, reason: string, text: string}[]}}
 */
function extractCalls(sourceText, fileName = 'file.ts', loadImport = null) {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const calls = [];
  const unresolved = [];
  attachImportLoader(sourceFile, fileName, loadImport);

  const lineOf = node => sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const record = (node, env, line) => {
    const [pathArg, options] = node.arguments;
    const paths = evalString(pathArg, env).map(toRoutePath);
    const methods = evalMethods(options, env);
    if (!methods || paths.some(p => p === null)) return false;
    for (const method of methods) for (const p of paths) calls.push({method, path: p, line});
    return true;
  };

  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALLEES.has(node.expression.text) && node.arguments.length) {
      const line = lineOf(node);
      if (!record(node, new Map(), line)) {
        // Possibly a thin wrapper whose path/method come from its own parameters: expand over its call sites.
        const wrapper = enclosingNamedFunction(node);
        const sites = wrapper ? findCallSites(sourceFile, wrapper.name, node) : [];
        const expanded = sites.length > 0 && sites.every(site => record(node, bindArguments(wrapper.fn, site.arguments, new Map(), 0), line));
        if (!expanded) unresolved.push({line, reason: 'path or method is not statically resolvable', text: node.getText().slice(0, 120)});
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const seen = new Set();
  return {
    calls: calls.filter(c => {
      const key = `${c.method} ${c.path} ${c.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    unresolved,
  };
}

function listSourceFiles(root) {
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec|d)\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Extracts the app's API surface: `{routes: Map<"METHOD /path", sites[]>, unresolved}` over every source file in `srcRoot`. */
function extractApp(srcRoot, projectRoot = path.dirname(srcRoot)) {
  const loadImport = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    const file = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate));
    return file ? {fileName: file, text: fs.readFileSync(file, 'utf8')} : null;
  };
  const routes = new Map();
  const unresolved = [];
  for (const file of listSourceFiles(srcRoot)) {
    const relative = path.relative(projectRoot, file);
    const result = extractCalls(fs.readFileSync(file, 'utf8'), file, loadImport);
    for (const call of result.calls) {
      const key = `${call.method} ${call.path}`;
      if (!routes.has(key)) routes.set(key, []);
      routes.get(key).push(`${relative}:${call.line}`);
    }
    for (const item of result.unresolved) unresolved.push({...item, file: relative});
  }
  return {routes, unresolved};
}

const splitRoute = route => {
  const [method, ...rest] = route.trim().split(/\s+/);
  return {method: method.toUpperCase(), segments: rest.join(' ').split('/').filter(Boolean)};
};
const isParam = segment => segment.startsWith(':');

/**
 * App route matches a manifest route when methods are equal and every segment is equal, or the manifest segment is a
 * parameter (any `:name`). An app `:id` never matches a literal manifest segment, so `/x/:id` is not satisfied by `/x/me`.
 */
function routeMatches(appRoute, manifestRoute) {
  const a = splitRoute(appRoute);
  const m = splitRoute(manifestRoute);
  return a.method === m.method && a.segments.length === m.segments.length
    && a.segments.every((segment, i) => (isParam(m.segments[i]) ? true : !isParam(segment) && segment === m.segments[i]));
}

/**
 * @param {Map<string, string[]>} appRoutes from `extractApp`
 * @param {string[]} manifest backend routes as `METHOD /path/:id`
 * @param {{route: string, reason: string}[]} allowlist
 */
function diffContract(appRoutes, manifest, allowlist = []) {
  const missing = [];
  const allowed = [];
  const allowedByRoute = new Map(allowlist.map(entry => [entry.route, entry]));
  for (const [route, sites] of [...appRoutes].sort(([x], [y]) => x.localeCompare(y))) {
    if (manifest.some(candidate => routeMatches(route, candidate))) continue;
    (allowedByRoute.has(route) ? allowed : missing).push({route, sites});
  }
  const stale = allowlist.filter(entry => !appRoutes.has(entry.route) || manifest.some(candidate => routeMatches(entry.route, candidate)));
  return {missing, allowed, stale};
}

module.exports = {extractCalls, extractApp, routeMatches, diffContract, toRoutePath, UNKNOWN};
