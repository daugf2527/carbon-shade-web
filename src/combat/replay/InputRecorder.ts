import type { Actor } from "../types.js";
import type { CombatKernel } from "../kernel/CombatKernel.js";

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
  startRecording(kernel: CombatKernel): void {
    if (this.recording) return;

    this.recording = true;
    this.recordedInputs = [];
    this.startTick = kernel.tickCount;
    this.initialState = this.captureInitialState(kernel);

    console.log(`[InputRecorder] 开始录制 @ tick ${this.startTick}`);
  }

  /** 停止录制 */
  stopRecording(kernel: CombatKernel): InputRecording | null {
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
  startReplay(kernel: CombatKernel, recording?: InputRecording): boolean {
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
  tickReplay(kernel: CombatKernel): void {
    if (!this.replaying) return;

    const relativeTick = kernel.tickCount - this.replayStartTick;

    // 应用所有应该在当前帧触发的输入
    while (this.nextInputIndex < this.replayInputs.length) {
      const input = this.replayInputs[this.nextInputIndex];

      if (input.tick > relativeTick) break; // 还没到时间

      // 应用输入
      if (input.type === "keydown") {
        kernel.inputState.keyDown(input.code);
      } else {
        kernel.inputState.keyUp(input.code);
      }

      this.nextInputIndex++;
    }

    // 回放结束
    if (this.nextInputIndex >= this.replayInputs.length) {
      console.log(`[InputRecorder] 回放完成 @ tick ${kernel.tickCount}`);
      this.stopReplay();
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
  private captureInitialState(kernel: CombatKernel): InitialSceneState {
    const player = kernel.player;

    return {
      playerPosition: { ...player.position },
      playerHp: player.resources.hp,
      playerFacing: player.facing,
      enemies: kernel.actors
        .filter(a => a.faction === "enemy" && !a.flags.dead)
        .map(a => ({
          id: a.id,
          type: a.type,
          position: { ...a.position },
          hp: a.resources.hp,
          facing: a.facing,
        })),
    };
  }

  /** 恢复初始场景状态 */
  private restoreInitialState(kernel: CombatKernel, state: InitialSceneState): void {
    // 重置 kernel
    kernel.reset();

    // 恢复玩家状态
    const player = kernel.player;
    player.position = { ...state.playerPosition };
    player.resources.hp = state.playerHp;
    player.facing = state.playerFacing;

    // 恢复敌人状态
    for (const enemyState of state.enemies) {
      const enemy = kernel.actors.find(a => a.id === enemyState.id);
      if (enemy) {
        enemy.position = { ...enemyState.position };
        enemy.resources.hp = enemyState.hp;
        enemy.facing = enemyState.facing;
      }
    }
  }
}
