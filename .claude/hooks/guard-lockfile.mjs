// .claude/hooks/guard-lockfile.mjs
// PreToolUse hook: block direct edits to package-lock.json
const p = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
if (p === 'package-lock.json' || p.endsWith('/package-lock.json')) {
  process.stdout.write('BLOCK: 不要直接编辑 package-lock.json — 用 npm install 管理');
  process.exit(2);
}
