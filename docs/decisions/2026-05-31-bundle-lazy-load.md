# T-D.5 Bundle Lazy Load 决策

**日期**: 2026-05-31  
**当前状态**: 主 bundle 2.0MB（从 1.7MB 增长 0.3MB）

## 分析

### Bundle 组成
- **主包**: `dist/assets/index-DixLusKy.js` = 2.0MB
- **增长来源**: 
  - `swordman-attacks.json` (233KB)
  - `DualTimelineAction` 类型 + 相关代码
  - `ReactionResolver` 重写

### 阈值评估
- **当前**: 2.0MB
- **优化阈值**: 5MB（roadmap 定义）
- **差距**: 3MB（未达优化条件）

### Lazy Load 成本
- **工程成本**: 3-4h（dynamic import + 加载状态 + 错误处理）
- **运行时成本**: 首次加载延迟 + 网络请求
- **收益**: 减少 ~300KB（15%）

## 决策

**❌ 不实施 lazy load**

**理由**:
1. 未达 5MB 阈值（roadmap D-D.1 决策）
2. 成本/收益比不合理（3-4h 工程成本换 15% 减少）
3. 单职业 prototype，职业扩展后再优化

## 后续建议

**Phase E 或 Stage 4 多职业扩展时重新评估**:
- 预估 11 职业 × 233KB ≈ 2.5MB attacks 数据
- 总 bundle 可能达 4-5MB
- 届时实施 per-job lazy load（按需加载职业数据）

**优化方向**:
1. FlatBuffers 零拷贝（替代 JSON）
2. 按职业拆分 chunk（`import("./swordman-truth.json")`）
3. 压缩算法（Brotli）

---

**决策**: 接受 2.0MB，Phase D 完成
