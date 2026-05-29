/**
 * ShardLoader.ts — Runtime shard loader (Phase 0 T0.3, Phase 2 T2.2)
 *
 * 从 dist/data/ (生产) 或 verification/baseline-shards/ (开发) 异步加载
 * entity-centric shards 给 Stage 2 仿真层用。
 *
 * **加载策略 (T2.2)**：
 *   1. 优先尝试 .bin (FlatBuffers 零拷贝)
 *   2. .bin 不存在或失败 → fallback .json
 *
 * Manifest 提供 sha256 校验 + size + kind，shard sizes 在 KB-MB 量级
 * (swordman.json 2.2MB, goblin 27KB; swordman.bin ~700KB, goblin.bin 2KB)。
 *
 * 2026-05-28 created (Phase 0 T0.3).
 * 2026-05-29 updated (Phase 2 T2.2): FlatBuffers support.
 */

import * as flatbuffers from 'flatbuffers';

export interface ShardManifestEntry {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly kind: string;
  readonly shape_version: string;
}

export interface ShardManifest {
  readonly manifest_version: string;
  readonly exported_at: string;
  readonly pvf_hash: string;
  readonly extractor_version: string;
  readonly files: ShardManifestEntry[];
}

export interface ShardLoaderOptions {
  /**
   * shard 目录 base URL。
   *   - 浏览器开发：`/baseline-shards/` (verification/ mirror via vite static)
   *   - 浏览器生产：`/data/` (dist/data/)
   *   - Node 测试：`file:///abs/path/to/baseline-shards/`
   */
  readonly baseUrl: string;
  /** fetch 实现。默认全局 fetch；测试可注入 mock。 */
  readonly fetchImpl?: typeof fetch;
  /** 强制使用 JSON（跳过 .bin 尝试）。开发/调试用。 */
  readonly forceJson?: boolean;
}

export class ShardLoader {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly forceJson: boolean;
  private manifest: ShardManifest | null = null;
  private readonly cache = new Map<string, unknown>();

  constructor(options: ShardLoaderOptions) {
    this.baseUrl = options.baseUrl.endsWith("/")
      ? options.baseUrl
      : `${options.baseUrl}/`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.forceJson = options.forceJson ?? false;
  }

  /** 加载 manifest。延迟到首次 loadShard / listShards 时触发。 */
  async loadManifest(): Promise<ShardManifest> {
    if (this.manifest !== null) return this.manifest;
    const url = `${this.baseUrl}manifest.json`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`ShardLoader: manifest fetch failed (${res.status} ${res.statusText}) at ${url}`);
    }
    const data = (await res.json()) as ShardManifest;
    this.manifest = data;
    return data;
  }

  /**
   * 加载 shard。如 `loadShard("players/swordman")` → 优先 swordman.bin，fallback swordman.json。
   * 已加载的 shard 缓存在内存中（HOT 数据，重复访问免重 fetch）。
   *
   * @param shardPath manifest 中的 path 前缀（不含扩展名）。例 "players/swordman"
   * @param deserializer FlatBuffers 反序列化函数（可选）。如果提供，.bin 会用此函数解析；否则返回 ByteBuffer。
   */
  async loadShard<T = unknown>(
    shardPath: string,
    deserializer?: (buf: flatbuffers.ByteBuffer) => T
  ): Promise<T> {
    if (this.cache.has(shardPath)) return this.cache.get(shardPath) as T;

    const manifest = await this.loadManifest();
    const jsonEntry = manifest.files.find(
      (f) => f.path === `${shardPath}.json` || f.path === shardPath,
    );
    if (jsonEntry === undefined) {
      throw new Error(
        `ShardLoader: ${shardPath} not in manifest. ` +
          `Available: ${manifest.files.map((f) => f.path).slice(0, 5).join(", ")}...`,
      );
    }

    // Try .bin first (unless forceJson)
    if (!this.forceJson) {
      const binPath = jsonEntry.path.replace(/\.json$/, '.bin');
      const binUrl = `${this.baseUrl}${binPath}`;
      try {
        const res = await this.fetchImpl(binUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const buf = new flatbuffers.ByteBuffer(uint8Array);

          // If deserializer provided, use it; otherwise return raw ByteBuffer
          const data = deserializer ? deserializer(buf) : (buf as unknown as T);
          this.cache.set(shardPath, data);
          return data;
        }
      } catch (err) {
        // .bin fetch failed, fall through to .json
        console.warn(`ShardLoader: .bin fetch failed for ${shardPath}, falling back to .json:`, err);
      }
    }

    // Fallback to .json
    const url = `${this.baseUrl}${jsonEntry.path}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`ShardLoader: shard fetch failed (${res.status}) at ${url}`);
    }
    const data = (await res.json()) as T;
    this.cache.set(shardPath, data);
    return data;
  }

  /** 列出 manifest 中所有 shard 的 path（不含扩展名）。 */
  async listShards(): Promise<string[]> {
    const manifest = await this.loadManifest();
    return manifest.files.map((f) => f.path.replace(/\.json$/, ""));
  }

  /** 按 kind 过滤 shard 列表。例 listShardsByKind("player") → 11 个 player shard。 */
  async listShardsByKind(kind: string): Promise<ShardManifestEntry[]> {
    const manifest = await this.loadManifest();
    return manifest.files.filter((f) => f.kind === kind);
  }

  /** 清除内存缓存（测试或热加载用）。 */
  clearCache(): void {
    this.cache.clear();
    this.manifest = null;
  }
}
