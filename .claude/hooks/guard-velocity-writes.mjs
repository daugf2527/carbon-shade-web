// .claude/hooks/guard-velocity-writes.mjs
// PreToolUse hook: restrict .velocity writes to allowed files only
import { readFileSync } from 'node:fs';

const p = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
if (/^src\/combat\//.test(p)) {
  const allowed = ['ActorFactory.ts', 'CombatKernel.ts', 'ReactionResolver.ts', 'EnemyAI.ts'];
  const fname = p.split('/').pop();
  if (!allowed.includes(fname)) {
    try {
      const content = readFileSync(process.env.CLAUDE_NEW_CONTENT || p, 'utf8');
      if (/\.velocity\s*[.=]/.test(content)) {
        process.stdout.write('BLOCK: velocity 写入只允许在 ' + allowed.join(', ') + ' 中');
        process.exit(2);
      }
    } catch (e) {
      // file not readable yet — skip check
    }
  }
}
