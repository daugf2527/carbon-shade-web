/**
 * ShardLoader.ts — Runtime shard loader (Phase 0 T0.3)
 *
 * 从 dist/data/ (生产) 或 verification/baseline-shards/ (开发) 异步加载
 * entity-centric JSON shards 给 Stage 2 仿真层用。
 *
 * **当前模式**：JSON fetch → JSON.parse （FlatBuffers 就绪前 fallback）
 * **后续 (T2.2)**：优先读 .bin (FlatBuffers 零拷贝), JSON 退化 fallback
 *
 * Manifest 提供 sha256 校验 + size + kind，shard sizes 在 KB-MB 量级
 * (swordman.json 2.2MB, goblin 27KB)。
 *
 * 2026-05-28 created (Phase 0 T0.3).
 */

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
}

export class ShardLoader {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private manifest: ShardManifest | null = null;
  private readonly cache = new Map<string, unknown>();

  constructor(options: ShardLoaderOptions) {
    this.baseUrl = options.baseUrl.endsWith("/")
      ? options.baseUrl
      : `${options.baseUrl}/`;
    this.fetchImpl = options.fetchImpl ?? fetch;
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
   * 加载 shard。如 `loadShard("players/swordman")` → 解析 swordman.json。
   * 已加载的 shard 缓存在内存中（HOT 数据，重复访问免重 fetch）。
   *
   * @param shardPath manifest 中的 path 前缀（不含 .json）。例 "players/swordman"
   */
  async loadShard<T = unknown>(shardPath: string): Promise<T> {
    if (this.cache.has(shardPath)) return this.cache.get(shardPath) as T;

    const manifest = await this.loadManifest();
    const entry = manifest.files.find(
      (f) => f.path === `${shardPath}.json` || f.path === shardPath,
    );
    if (entry === undefined) {
      throw new Error(
        `ShardLoader: ${shardPath} not in manifest. ` +
          `Available: ${manifest.files.map((f) => f.path).slice(0, 5).join(", ")}...`,
      );
    }

    const url = `${this.baseUrl}${entry.path}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`ShardLoader: shard fetch failed (${res.status}) at ${url}`);
    }
    const data = (await res.json()) as T;
    this.cache.set(shardPath, data);
    return data;
  }

  /** 列出 manifest 中所有 shard 的 path（不含 .json 后缀）。 */
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
