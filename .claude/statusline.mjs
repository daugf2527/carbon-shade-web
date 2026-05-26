#!/usr/bin/env node
// .claude/statusline.mjs — emits one-line status for Claude Code statusline.
// Format: [branch*] az:PASS/FAIL/?  <task>  idle:Nm
//   branch — current git branch (* = dirty tree)
//   az    — last analyze status from .claude/.last-analyze.txt (PASS/FAIL/?)
//   task  — .claude/status.json `task` field (optional)
//   idle  — minutes since .claude/.last-activity-ts (only if >1m)
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let input = '';
for await (const c of process.stdin) input += c;

let cwd = process.cwd();
const m = input.match(/"(?:current_dir|cwd)"\s*:\s*"([^"]*)"/);
if (m) cwd = m[1];
try { process.chdir(cwd); } catch { /* keep current cwd */ }

let branch = '?';
try { branch = execSync('git branch --show-current', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || '?'; } catch {}

let dirty = '';
try {
  const s = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (s) dirty = '*';
} catch {}

let analyze = '?';
if (existsSync('.claude/.last-analyze.txt')) {
  try {
    const t = readFileSync('.claude/.last-analyze.txt', 'utf8');
    if (/^PASS/m.test(t) || /ALL PASS|✓|GREEN/.test(t)) analyze = 'PASS';
    else if (/^FAIL/m.test(t) || /FAIL|✗|RED/.test(t)) analyze = 'FAIL';
  } catch {}
}

let task = '';
if (existsSync('.claude/status.json')) {
  try {
    const s = JSON.parse(readFileSync('.claude/status.json', 'utf8'));
    if (s.task) task = ` ${s.task}`;
    else if (s.progress && s.progress !== '0/?') task = ` ${s.progress}`;
  } catch {}
}

let idle = '';
if (existsSync('.claude/.last-activity-ts')) {
  try {
    const last = parseInt(readFileSync('.claude/.last-activity-ts', 'utf8').trim(), 10);
    if (Number.isInteger(last)) {
      const gap = Math.floor(Date.now() / 1000) - last;
      if (gap > 60) idle = ` idle:${Math.floor(gap / 60)}m`;
    }
  } catch {}
}

process.stdout.write(`[${branch}${dirty}] az:${analyze}${task}${idle}`);
