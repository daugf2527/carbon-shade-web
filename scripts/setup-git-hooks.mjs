#!/usr/bin/env node
// One-time setup: point git core.hooksPath at scripts/hooks/ so tracked scripts
// (pre-commit/pre-push) become active for this clone.
// Run once after clone: node scripts/setup-git-hooks.mjs
import { execSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
console.log('[setup-git-hooks] repo root:', repoRoot);

execSync('git config core.hooksPath scripts/hooks', { stdio: 'inherit' });
console.log('[setup-git-hooks] core.hooksPath = scripts/hooks');

for (const hook of ['pre-commit', 'pre-push']) {
  const p = resolve(repoRoot, 'scripts/hooks', hook);
  if (existsSync(p)) {
    try { chmodSync(p, 0o755); console.log(`[setup-git-hooks] +x ${hook}`); } catch {}
  }
}
console.log('[setup-git-hooks] done. Hooks active for this clone.');
