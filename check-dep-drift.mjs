#!/usr/bin/env node
/**
 * Fails when workspace packages resolve DIFFERENT versions of a dependency that
 * must stay in lockstep across the monorepo.
 *
 * Why this exists
 * ---------------
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
 * TypeScript, and lint/build/tsc were all clean.
 *
 * No package version changed. The whole failure came from the peer hash.
 *
 * We compare RESOLVED versions rather than the declared ranges, because
 * resolution is what pnpm keys on. apps/web pins `~6.0.3` while the packages
 * pin `^6.0.3`; those agree today but are different range operators, so a
 * string comparison of the declarations would be both noisy and unsound.
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dependencies that must resolve to a single version across every workspace
 * package. Add to this list when a dep starts causing cross-package grief —
 * typically anything other packages declare as a *peer*.
 */
const SYNCED_DEPS = ['typescript'];

/** Minimal reader for the `dir/*` glob style used in pnpm-workspace.yaml. */
function readWorkspaceDirs() {
  const file = path.join(repoRoot, 'pnpm-workspace.yaml');
  const patterns = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^['"]|['"]$/g, ''));

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
  return dirs.sort();
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
    return null; // declared but not installed, or not reachable from here
  }
}

const workspaceDirs = readWorkspaceDirs();
let failed = false;

for (const dep of SYNCED_DEPS) {
  const rows = workspaceDirs
    .map((dir) => ({ dir, range: declaredRange(dir, dep), version: resolvedVersion(dir, dep) }))
    .filter((r) => r.range !== null);

  if (rows.length === 0) {
    console.log(`${dep}: not declared by any workspace package — skipping\n`);
    continue;
  }

  const width = Math.max(...rows.map((r) => r.dir.length));
  console.log(`${dep}`);
  for (const { dir, range, version } of rows) {
    console.log(`  ${dir.padEnd(width)}  declared ${String(range).padEnd(10)} resolved ${version ?? 'NOT INSTALLED'}`);
  }

  const missing = rows.filter((r) => r.version === null);
  const versions = [...new Set(rows.filter((r) => r.version).map((r) => r.version))];

  if (missing.length > 0) {
    failed = true;
    console.error(`\n  ✗ ${dep} is declared but not installed in: ${missing.map((m) => m.dir).join(', ')}`);
    console.error(`    Run \`pnpm install\`.`);
  } else if (versions.length > 1) {
    failed = true;
    console.error(`\n  ✗ ${dep} resolves to ${versions.length} different versions: ${versions.join(', ')}`);
    console.error(`    Every workspace package must resolve the SAME version. Split versions fork any`);
    console.error(`    dependency that peers on ${dep}, which fails in ways that look unrelated (see the`);
    console.error(`    header of this file). Align the pins in the package.json files above, then`);
    console.error(`    re-run \`pnpm install\`.`);
  } else {
    console.log(`\n  ✓ ${dep} resolves to ${versions[0]} everywhere`);
  }
  console.log('');
}

process.exit(failed ? 1 : 0);
