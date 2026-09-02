#!/usr/bin/env node
/**
 * Guards two invariants for dependencies that must stay in lockstep across the
 * monorepo:
 *
 *   1. VERSION DRIFT  — every package resolves the SAME version.
 *   2. PHANTOM DEPS   — every package that needs it DECLARES it.
 *
 * Why (1)
 * -------
 * `react-i18next` (like many libraries) declares `typescript` as a *peer*
 * dependency. pnpm keys each instance of a peer-dependent package by the
 * versions of its peers, so when apps/web was on TypeScript 6.0.3 while
 * packages/i18n was still on 5.9.3, pnpm created two instances:
 *
 *     react-i18next@16.6.6(...)(typescript@6.0.3)   <- apps/web
 *     react-i18next@16.6.6(...)(typescript@5.9.3)   <- packages/i18n
 *
 * Two instances means two React contexts. The <I18nextProvider> mounted from
 * one was invisible to useTranslation() imported from the other, so every
 * translation silently fell through to its key. That surfaced as 79 failing
 * tests across 25 files, all asserting on rendered copy — nothing pointed at
 * TypeScript, and lint/build/tsc were all clean. (#380)
 *
 * We compare RESOLVED versions rather than declared ranges, because resolution
 * is what pnpm keys on. Declarations cannot answer the question: these deps are
 * declared as `catalog:`, a literal carrying no version at all.
 *
 * This is also why the catalog does not make the check redundant. Catalogs are
 * opt-in per declaration site: a package that writes an explicit version instead
 * of `catalog:` installs cleanly with no warning (verified), and only a
 * resolved-version comparison catches it.
 *
 * Why (2)
 * -------
 * A package that stops declaring a dependency KEEPS WORKING, which is what makes
 * this worth automating. pnpm creates a `node_modules` at the workspace root, and
 * Node's resolver walks up parent directories into it — so `require("typescript")`
 * from packages/utils succeeds even with no local symlink and no declaration.
 * `pnpm exec tsc` likewise finds the root's `node_modules/.bin`.
 *
 * The manifest then lies: the package cannot be built in isolation, moved, or
 * published, and it silently inherits whatever the root happens to pin. The
 * monorepo migration was already bitten by this class of bug — npm's flat
 * hoisting had masked two undeclared @codemirror packages (#376).
 *
 * Declaring a dependency is not what makes it RESOLVABLE. It is what makes it
 * EXPLICIT — and therefore checkable.
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dependencies that must stay in lockstep, and who is required to declare each.
 *
 *   requiredIn: 'all'  — every workspace package must declare it
 *   requiredIn: [...]  — only these must; other packages are ignored entirely
 *
 * The explicit list matters: because of the root-hoisting described above, EVERY
 * package can resolve EVERY root dependency. Flagging all of them would bury the
 * real signal in noise, so we state the expectation instead of inferring it.
 * Adding a package that needs one of these means adding it here — and the check
 * tells you when you forget.
 */
const SYNCED_DEPS = [
  { name: 'typescript', requiredIn: 'all' },
  { name: '@types/node', requiredIn: ['apps/web', 'apps/mobile', 'packages/api'] },
  // Both apps render components from packages/i18n, so all three must agree on
  // React. packages/i18n declares it as a peer (the consumer supplies it at
  // runtime) *and* as a devDependency for its own build — and it was that
  // devDependency, left floating on ^19.2.4, that pulled a second React in.
  { name: 'react', requiredIn: ['apps/web', 'apps/mobile', 'packages/i18n'] },
  // react-dom is listed for packages/i18n too, even though only web renders to
  // the DOM: react-i18next peers on it, so leaving it undeclared there let pnpm
  // satisfy the peer with a different version and fork react-i18next all over
  // again — the same failure as #380, just keyed on react-dom instead of
  // typescript.
  { name: 'react-dom', requiredIn: ['apps/web', 'packages/i18n'] },
];

/** Minimal reader for the `dir/*` glob style used in pnpm-workspace.yaml. */
function readWorkspaceDirs() {
  const file = path.join(repoRoot, 'pnpm-workspace.yaml');
  const patterns = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^['"]|['"]$/g, ''))
    // `allowBuilds` and other settings also use list syntax; keep path-like entries.
    .filter((l) => l.includes('/') || existsSync(path.join(repoRoot, l, 'package.json')));

  const dirs = ['.']; // the root workspace itself
  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      if (existsSync(path.join(repoRoot, pattern, 'package.json'))) dirs.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    const parentAbs = path.join(repoRoot, parent);
    if (!existsSync(parentAbs)) continue;
    for (const entry of readdirSync(parentAbs)) {
      const rel = path.join(parent, entry);
      if (existsSync(path.join(repoRoot, rel, 'package.json'))) dirs.push(rel);
    }
  }
  return [...new Set(dirs)].sort();
}

/** The declared range for `dep`, or null if this package doesn't ask for it. */
function declaredRange(dir, dep) {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'));
  return pkg.devDependencies?.[dep] ?? pkg.dependencies?.[dep] ?? null;
}

/** The version `dir` actually resolves for `dep` — what pnpm keys peers on. */
function resolvedVersion(dir, dep) {
  try {
    const require = createRequire(path.join(repoRoot, dir, 'noop.js'));
    return JSON.parse(readFileSync(require.resolve(`${dep}/package.json`), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * True when `dir` has its own symlink for `dep`. pnpm creates one only for
 * declared dependencies, so its absence alongside a successful resolve is the
 * fingerprint of a root-hoisted phantom.
 */
function hasOwnLink(dir, dep) {
  return existsSync(path.join(repoRoot, dir, 'node_modules', dep));
}

const workspaceDirs = readWorkspaceDirs();
const problems = [];

for (const { name: dep, requiredIn } of SYNCED_DEPS) {
  const expected = requiredIn === 'all' ? workspaceDirs : requiredIn;

  // A stale entry in requiredIn is itself a bug — catch renames and typos.
  for (const dir of expected) {
    if (!workspaceDirs.includes(dir)) {
      problems.push(`${dep}: requiredIn lists "${dir}", which is not a workspace package`);
    }
  }

  const rows = workspaceDirs
    .filter((dir) => expected.includes(dir) || declaredRange(dir, dep) !== null)
    .map((dir) => ({
      dir,
      range: declaredRange(dir, dep),
      version: resolvedVersion(dir, dep),
      linked: hasOwnLink(dir, dep),
    }));

  console.log(dep);
  if (rows.length === 0) {
    console.log('  (not required or declared anywhere)\n');
    continue;
  }

  const width = Math.max(...rows.map((r) => r.dir.length));
  for (const { dir, range, version } of rows) {
    const note =
      range === null ? (version ? '  <== PHANTOM (resolved via root, not declared)' : '  <== MISSING') : '';
    const declared = range === null ? '(none)' : String(range);
    console.log(`  ${dir.padEnd(width)}  declared ${declared.padEnd(10)} resolved ${version ?? '-'}${note}`);
  }

  const phantoms = rows.filter((r) => r.range === null && r.version !== null);
  const missing = rows.filter((r) => r.range === null && r.version === null);
  const declaredRows = rows.filter((r) => r.range !== null);
  const unresolved = declaredRows.filter((r) => r.version === null);
  const versions = [...new Set(declaredRows.filter((r) => r.version).map((r) => r.version))];

  if (phantoms.length > 0) {
    problems.push(
      `${dep}: resolved but NOT declared by ${phantoms.map((p) => p.dir).join(', ')} — ` +
        `these work only by falling through to the workspace root, so the manifest is wrong. ` +
        `Add "${dep}": "catalog:" to each.`
    );
  }
  if (missing.length > 0) {
    problems.push(
      `${dep}: required in ${missing.map((m) => m.dir).join(', ')} but neither declared nor resolvable.`
    );
  }
  if (unresolved.length > 0) {
    problems.push(
      `${dep}: declared but not installed in ${unresolved.map((u) => u.dir).join(', ')}. Run \`pnpm install\`.`
    );
  }
  if (versions.length > 1) {
    problems.push(
      `${dep}: resolves to ${versions.length} different versions (${versions.join(', ')}). ` +
        `Split versions fork any package that peers on ${dep}, failing in ways that look unrelated — ` +
        `see the header of this file.`
    );
  }

  if (phantoms.length + missing.length + unresolved.length === 0 && versions.length === 1) {
    console.log(`\n  ✓ ${dep} resolves to ${versions[0]} everywhere, declared by every package that needs it`);
  }
  console.log('');
}

if (problems.length > 0) {
  console.error('Dependency problems found:\n');
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
process.exit(0);
