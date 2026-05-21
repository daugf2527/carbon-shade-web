// .claude/hooks/guard-generated-dirs.mjs
// PreToolUse hook: block edits to dist/.tmp/verification/node_modules
const p = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
const blocked = /^(dist|\.tmp|verification|node_modules)\//;
if (blocked.test(p)) {
  const dir = p.split('/')[0];
  process.stdout.write(`BLOCK: 禁止编辑生成目录 ${dir}/ — 这些是构建产物`);
  process.exit(2);
}
