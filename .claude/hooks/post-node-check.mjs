// .claude/hooks/post-node-check.mjs
// PostToolUse hook: 编辑 .mjs/.js 后跑 node --check 检查语法
// 抓: 缺括号 / 多余 } / 拼错关键字 / 缺逗号 等纯解析错误。秒级，零依赖。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const raw = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
if (!raw) process.exit(0);

// 只检 .mjs / .js / .cjs，跳过 .ts (post-typecheck.mjs 管)、tmp、node_modules
if (!/\.(mjs|cjs|js)$/.test(raw)) process.exit(0);
if (raw.startsWith('.tmp/') || raw.includes('/node_modules/') || raw.includes('/dist/')) process.exit(0);
if (!existsSync(raw)) process.exit(0);  // 文件已被删

const r = spawnSync('node', ['--check', raw], { encoding: 'utf8', timeout: 10000 });
if (r.status !== 0) {
  process.stdout.write(`⚠️ node --check 失败 (${raw}):\n${(r.stderr || r.stdout || '').slice(0, 800)}`);
  process.exit(1);
}
