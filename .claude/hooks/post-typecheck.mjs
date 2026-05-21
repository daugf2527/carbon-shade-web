// .claude/hooks/post-typecheck.mjs
// PostToolUse hook: auto typecheck after .ts file edits
import { spawnSync } from 'node:child_process';

const p = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
if (p.endsWith('.ts') && !p.startsWith('.tmp')) {
  const r = spawnSync('node', ['scripts/run-tsc.mjs', '-p', 'tsconfig.json', '--noEmit'], {
    encoding: 'utf8',
    timeout: 30000
  });
  if (r.status !== 0) {
    process.stdout.write('⚠️ TypeCheck 失败:\n' + (r.stdout || '').slice(0, 800));
    process.exit(1);
  }
}
