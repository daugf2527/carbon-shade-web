import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const config = JSON.parse(readFileSync(resolve(root, 'public/assets/sprites/normalized/sprite-normalization.json'), 'utf8'));

function readPngDimensions(filePath) {
  const buf = readFileSync(filePath);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${filePath}: not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

let passed = true;

for (const [name, entry] of Object.entries(config)) {
  const filePath = resolve(root, 'public/assets/sprites/normalized', entry.sheet);
  let dims;
  try {
    dims = readPngDimensions(filePath);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    passed = false;
    continue;
  }

  const expectedRows = Math.ceil(entry.frames / entry.cols);
  const expectedW = entry.cols * entry.cellW;
  const expectedH = expectedRows * entry.cellH;

  const issues = [];
  if (dims.width !== expectedW) issues.push(`width ${dims.width} !== expected ${expectedW}`);
  if (dims.height !== expectedH) issues.push(`height ${dims.height} !== expected ${expectedH}`);
  if (entry.size[0] !== expectedW || entry.size[1] !== expectedH) {
    issues.push(`JSON size [${entry.size}] !== computed [${expectedW},${expectedH}]`);
  }

  if (issues.length > 0) {
    console.error(`FAIL ${name} (${entry.sheet}): ${issues.join('; ')}`);
    passed = false;
  } else {
    console.log(`OK ${name}: ${dims.width}x${dims.height}, ${entry.frames} frames, ${entry.cols} cols`);
  }
}

if (!passed) {
  console.error('\nSprite sheet validation failed.');
  process.exit(1);
}
console.log('\nAll sprite sheets validated.');
