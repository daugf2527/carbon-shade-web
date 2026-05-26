// SessionStart / UserPromptSubmit hook.
// (1) Reset .claude/status.json initial placeholder
// (2) CB2 idle detection: emit [auto-detected idle:] sentinel for session-debrief
// (3) H3 SessionStart context echo: git status / log / last-analyze (SessionStart event only)
// (4) Update .claude/.last-activity-ts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = process.cwd();
const claudeDir = resolve(cwd, '.claude');
const statusPath = resolve(claudeDir, 'status.json');
const tsPath = resolve(claudeDir, '.last-activity-ts');
const analyzePath = resolve(claudeDir, '.last-analyze.txt');

function readStdinAsync(ms = 150) {
  return new Promise(res => {
    let buf = '';
    const timer = setTimeout(() => res(buf), ms);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { buf += c; });
    process.stdin.on('end', () => { clearTimeout(timer); res(buf); });
    process.stdin.on('error', () => { clearTimeout(timer); res(buf); });
  });
}

const raw = await readStdinAsync(150);
let event = '';
try { event = (JSON.parse(raw).hook_event_name || ''); } catch { /* ignore */ }

// (1) Reset status.json
try {
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(statusPath, JSON.stringify({ progress: '0/?', confidence: '评估中' }, null, 2) + '\n', 'utf8');
} catch (err) {
  process.stderr.write(`reset-status: ${err.message}\n`);
}

// (2) Idle detection (CB2)
const thresholdSec = parseInt(process.env.CLAUDE_DEBRIEF_IDLE_MIN || '15', 10) * 60;
if (existsSync(tsPath)) {
  try {
    const last = parseInt(readFileSync(tsPath, 'utf8').trim(), 10);
    if (Number.isInteger(last)) {
      const gap = Math.floor(Date.now() / 1000) - last;
      if (gap > thresholdSec) {
        console.log(`[auto-detected idle: previous Claude response ended ${Math.floor(gap / 60)} min ago. Consider running /session-debrief to capture lessons before context fades.]`);
      }
    }
  } catch { /* silent */ }
}

// (3) SessionStart context echo (H3)
if (event === 'SessionStart') {
  try {
    const status = execSync('git status -s', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (status) {
      console.log('=== git status -s ===');
      console.log(status.slice(0, 2000));
    }
    const log = execSync('git log --oneline -3', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (log) {
      console.log('\n=== git log --oneline -3 ===');
      console.log(log);
    }
    if (existsSync(analyzePath)) {
      console.log('\n=== last analyze ===');
      console.log(readFileSync(analyzePath, 'utf8').slice(0, 500));
    }
  } catch { /* silent */ }
}

// (4) Update activity timestamp
try {
  writeFileSync(tsPath, String(Math.floor(Date.now() / 1000)), 'utf8');
} catch { /* silent */ }
