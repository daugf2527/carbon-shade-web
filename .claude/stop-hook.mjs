// Stop hook: write activity timestamp for idle detection + statusline.
// Heavy analyze stays off the stop path (use pre-push for 8-gate, /verify-all manually).
// Failure does NOT block stop.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const claudeDir = resolve(process.cwd(), '.claude');
try {
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(resolve(claudeDir, '.last-activity-ts'), String(Math.floor(Date.now() / 1000)), 'utf8');
} catch (err) {
  process.stderr.write(`stop-hook: ${err.message}\n`);
}
process.exit(0);
