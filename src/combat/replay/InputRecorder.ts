// ⚠️ ARCH(P4): combat→engine 反向依赖。InputRecorder 物理上在 src/combat/(FROZEN) 但驱动新
// 主线 EngineKernel——迁移过渡产物。此处仅 type-only import(无运行时耦合)。P4 迁移收尾时应
// 整体挪入 src/engine/ 或 src/game/。在此之前 .dependency-cruiser.cjs 用 warn 级规则追踪,不阻断。
import type { EngineKernel } from "../../engine/kernel/EngineKernel.js";

/** 单个输入事件（按键按下或释放） */
export interface InputEvent {
  tick: number;
  type: "keydown" | "keyup";
  code: string;
}

/** 初始场景状态快照 */
export interface InitialSceneState {
  playerPosition: { x: number; y: number; z: number };
  playerHp: number;
  playerFacing: "left" | "right";
  enemies: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    hp: number;
    facing: "left" | "right";
  }>;
}

/** 完整的输入录制数据 */
export interface InputRecording {
  version: string;
  startTick: number;
  endTick: number;
  duration: number; // 总帧数
  initialState: InitialSceneState;
  inputs: InputEvent[];
  metadata: {
    recordedAt: string; // ISO timestamp
    buildHash?: string;
  };
}

export class InputRecorder {
  private recording = false;
  private replaying = false;
  private currentRecording: InputRecording | null = null;
  private recordedInputs: InputEvent[] = [];
  private startTick = 0;
  private initialState: InitialSceneState | null = null;

  // 回放状态
  private replayInputs: InputEvent[] = [];
  private replayStartTick = 0;
  private replayInitialState: InitialSceneState | null = null;
  private nextInputIndex = 0;

  isRecording(): boolean {
    return this.recording;
  }

  isReplaying(): boolean {
    return this.replaying;
  }

  getReplayProgress(): number {
    if (!this.replaying || !this.currentRecording) return 0;
    const elapsed = this.nextInputIndex;
    const total = this.replayInputs.length;
    return total > 0 ? elapsed / total : 0;
  }

  /** 开始录制 */
  startRecording(kernel: EngineKernel): void {
    if (this.recording) return;

    this.recording = true;
    this.recordedInputs = [];
    this.startTick = kernel.tickCount;
    this.initialState = this.captureInitialState(kernel);

    console.log(`[InputRecorder] 开始录制 @ tick ${this.startTick}`);
  }

  /** 停止录制 */
  stopRecording(kernel: EngineKernel): InputRecording | null {
    if (!this.recording) return null;

    this.recording = false;
    const endTick = kernel.tickCount;

    this.currentRecording = {
      version: "1.0.0",
      startTick: this.startTick,
      endTick,
      duration: endTick - this.startTick,
      initialState: this.initialState!,
      inputs: [...this.recordedInputs],
      metadata: {
        recordedAt: new Date().toISOString(),
        buildHash: typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'local-dev',
      },
    };

    console.log(`[InputRecorder] 停止录制 @ tick ${endTick}, 录制了 ${this.recordedInputs.length} 个输入事件`);

    return this.currentRecording;
  }

  /** 录制输入事件（在每帧调用） */
  recordInput(tick: number, type: "keydown" | "keyup", code: string): void {
    if (!this.recording) return;

    this.recordedInputs.push({
      tick: tick - this.startTick, // 相对时间
      type,
      code,
    });
  }

  /** 开始回放 */
  startReplay(kernel: EngineKernel, recording?: InputRecording): boolean {
    const rec = recording ?? this.currentRecording;
    if (!rec) {
      console.warn("[InputRecorder] 没有可回放的录制");
      return false;
    }

    this.replaying = true;
    this.replayInputs = [...rec.inputs];
    this.replayStartTick = kernel.tickCount;
    this.replayInitialState = rec.initialState;
    this.nextInputIndex = 0;

    // 重置场景到初始状态
    this.restoreInitialState(kernel, rec.initialState);

    console.log(`[InputRecorder] 开始回放 @ tick ${this.replayStartTick}, 共 ${this.replayInputs.length} 个输入事件`);

    return true;
  }

  /** 停止回放 */
  stopReplay(): void {
    if (!this.replaying) return;

    this.replaying = false;
    this.nextInputIndex = 0;

    console.log("[InputRecorder] 停止回放");
  }

  /** 回放输入（在每帧调用） */
  tickReplay(kernel: EngineKernel): void {
    if (!this.replaying) return;

    const relativeTick = kernel.tickCount - this.replayStartTick;

    // 应用所有应该在当前帧触发的输入
    while (this.nextInputIndex < this.replayInputs.length) {
      const input = this.replayInputs[this.nextInputIndex];

      if (input.tick > relativeTick) break; // 还没到时间

      // P3.1: 应用输入到 player.intent / requestAction（取代 inputState）
      this.applyReplayInput(kernel, input.type, input.code);

      this.nextInputIndex++;
    }

    // 回放结束
    if (this.nextInputIndex >= this.replayInputs.length) {
      console.log(`[InputRecorder] 回放完成 @ tick ${kernel.tickCount}`);
      this.stopReplay();
    }
  }

  /** P3.1: 把录制的输入码翻译成 engine ActorIntent / requestAction。 */
  private applyReplayInput(kernel: EngineKernel, type: "keydown" | "keyup", code: string): void {
    const player = kernel.player;
    if (!player) return;
    if (type === "keydown") {
      switch (code) {
        case "ArrowLeft":  player.intent = { ...player.intent, dir: -1 }; break;
        case "ArrowRight": player.intent = { ...player.intent, dir: 1 }; break;
        case "KeyX":
        case "KeyJ":       player.intent = { ...player.intent, attack: true }; break;
        case "KeyC":       kernel.requestAction("player", "Backstep"); break;
        case "KeyZ":       kernel.requestAction("player", "QuickRebound"); break;
        case "KeyA":       kernel.requestAction("player", "UpwardSlash"); break;
        case "KeyK":       kernel.requestAction("player", "Bloodlust"); break;
        default: break;
      }
    } else {
      switch (code) {
        case "ArrowLeft":
        case "ArrowRight": player.intent = { ...player.intent, dir: 0 }; break;
        case "KeyX":
        case "KeyJ":       player.intent = { ...player.intent, attack: false }; break;
        default: break;
      }
    }
  }

  /** 导出录制到 JSON */
  exportToJson(): string | null {
    if (!this.currentRecording) return null;
    return JSON.stringify(this.currentRecording, null, 2);
  }

  /** 从 JSON 导入录制 */
  importFromJson(json: string): InputRecording | null {
    try {
      const recording = JSON.parse(json) as InputRecording;

      // 基本验证
      if (!recording.version || !recording.initialState || !Array.isArray(recording.inputs)) {
        console.error("[InputRecorder] 无效的录制格式");
        return null;
      }

      this.currentRecording = recording;
      console.log(`[InputRecorder] 导入录制成功: ${recording.inputs.length} 个输入事件, 时长 ${recording.duration} 帧`);

      return recording;
    } catch (error) {
      console.error("[InputRecorder] 导入失败:", error);
      return null;
    }
  }

  /** 获取当前录制 */
  getCurrentRecording(): InputRecording | null {
    return this.currentRecording;
  }

  /** 捕获初始场景状态 */
  private captureInitialState(kernel: EngineKernel): InitialSceneState {
    const player = kernel.player;

    return {
      playerPosition: { x: player.x, y: player.y, z: player.z },
      playerHp: player.hp,
      playerFacing: player.facing === 1 ? "right" : "left",
      enemies: kernel.actors
        .filter(a => a.kind === "monster" && !a.isDead)
        .map(a => ({
          id: a.id,
          type: a.kind,
          position: { x: a.x, y: a.y, z: a.z },
          hp: a.hp,
          facing: a.facing === 1 ? "right" : "left",
        })),
    };
  }

  /** 恢复初始场景状态 */
  private restoreInitialState(kernel: EngineKernel, state: InitialSceneState): void {
    // P3.1: engine reset() rebuilds the roster; here we restore existing actors' fields
    // directly (replay starts from current scene, only positions/hp/facing reset).
    const player = kernel.player;
    player.x = state.playerPosition.x;
    player.y = state.playerPosition.y;
    player.z = state.playerPosition.z;
    player.hp = state.playerHp;
    player.facing = state.playerFacing === "right" ? 1 : -1;
    player.intent = { attack: false, dir: 0 };
    player.reaction = null;
    player.airborne = null;

    // 恢复敌人状态
    for (const enemyState of state.enemies) {
      const enemy = kernel.actors.find(a => a.id === enemyState.id);
      if (enemy) {
        enemy.x = enemyState.position.x;
        enemy.y = enemyState.position.y;
        enemy.z = enemyState.position.z;
        enemy.hp = enemyState.hp;
        enemy.facing = enemyState.facing === "right" ? 1 : -1;
        enemy.intent = { attack: false, dir: 0 };
        enemy.reaction = null;
        enemy.airborne = null;
      }
    }
  }
}
