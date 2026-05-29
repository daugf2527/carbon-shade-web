/**
 * shard-loader-bin.test.mjs — 简化版 FlatBuffers 加载测试
 *
 * 直接用 .mjs 避免 TypeScript 编译问题。
 *
 * 2026-05-29 created.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

// Import ShardLoader
const { ShardLoader } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine', 'loader', 'ShardLoader.js')).href);

// Import generated FlatBuffers types
const GEN_DIR = path.join(ROOT, 'src', 'engine', 'schema', 'carbon-shade', 'engine', 'schema');
const { PhysicsConstants } = await import(pathToFileURL(path.join(GEN_DIR, 'physics-constants.js')).href);

// Mock fetch for file:// URLs
function createFileFetch(baseDir) {
  return async (url) => {
    const filePath = url.replace(/^file:\/\/\//, '').replace(/^\//, '');
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(baseDir, filePath);

    try {
      const content = readFileSync(fullPath);

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async json() {
          return JSON.parse(content.toString('utf-8'));
        },
        async arrayBuffer() {
          return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
        },
      };
    } catch (err) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
    }
  };
}

// Test: Load .bin (PhysicsConstants)
const loader = new ShardLoader({
  baseUrl: `file:///${path.join(ROOT, 'public', 'data')}`,
  fetchImpl: createFileFetch(path.join(ROOT, 'public', 'data')),
});

const buf = await loader.loadShard('shared/physics');
assert.ok(buf instanceof flatbuffers.ByteBuffer, 'Should return ByteBuffer');

const physics = PhysicsConstants.getRootAsPhysicsConstants(buf);
assert.equal(physics.schemaVersion(), 1, 'schema_version should be 1');
assert.equal(physics.defaultGravityAccel(), -1500, 'defaultGravityAccel should be -1500');

console.log('✅ ShardLoader .bin loading test passed');
