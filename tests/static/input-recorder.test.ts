import { assert } from "./test-utils.js";
import { InputRecorder } from "../../src/engine/replay/InputRecorder.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { Actor } from "../../src/engine/core/Actor.js";

// P3.1: InputRecorder now drives EngineKernel (was CombatKernel before runtime switch).
function buildKernel(): EngineKernel {
  const kernel = new EngineKernel(0);
  const player = new Actor("player", "player", { hpMax: 180, mpMax: 100, moveSpeed: 300, physicalAttack: 45, physicalDefense: 20 });
  kernel.addActor(player, true);
  const grunt = new Actor("grunt", "monster", { hpMax: 70, mpMax: 0, moveSpeed: 300, physicalAttack: 10, physicalDefense: 5 });
  kernel.addActor(grunt, false);
  return kernel;
}

export function testInputRecorderBasics(): void {
  const recorder = new InputRecorder();
  const kernel = buildKernel();

  // 初始状态
  assert(!recorder.isRecording(), "初始状态不应该在录制");
  assert(!recorder.isReplaying(), "初始状态不应该在回放");
  assert.equal(recorder.getCurrentRecording(), null, "初始状态没有录制");

  // 开始录制
  recorder.startRecording(kernel);
  assert(recorder.isRecording(), "应该在录制中");

  // 录制一些输入
  recorder.recordInput(1, "keydown", "KeyX");
  recorder.recordInput(5, "keyup", "KeyX");
  recorder.recordInput(10, "keydown", "ArrowRight");

  // 停止录制
  const recording = recorder.stopRecording(kernel);
  assert(recording !== null, "应该返回录制数据");
  assert(!recorder.isRecording(), "停止后不应该在录制");
  assert.equal(recording!.inputs.length, 3, "应该录制了3个输入事件");
  assert.equal(recording!.inputs[0].code, "KeyX", "第一个输入应该是KeyX");
  assert.equal(recording!.inputs[0].type, "keydown", "第一个输入应该是keydown");
}

export function testInputRecorderReplay(): void {
  const recorder = new InputRecorder();
  const kernel = buildKernel();

  // 录制
  recorder.startRecording(kernel);
  recorder.recordInput(0, "keydown", "KeyX");
  recorder.recordInput(1, "keyup", "KeyX");
  const recording = recorder.stopRecording(kernel);

  assert(recording !== null, "应该有录制数据");

  // 回放
  const success = recorder.startReplay(kernel, recording!);
  assert(success, "回放应该成功启动");
  assert(recorder.isReplaying(), "应该在回放中");

  // 停止回放
  recorder.stopReplay();
  assert(!recorder.isReplaying(), "停止后不应该在回放");
}

export function testInputRecorderExportImport(): void {
  const recorder = new InputRecorder();
  const kernel = buildKernel();

  // 录制
  recorder.startRecording(kernel);
  recorder.recordInput(0, "keydown", "KeyX");
  recorder.recordInput(5, "keyup", "KeyX");
  recorder.stopRecording(kernel);

  // 导出
  const json = recorder.exportToJson();
  assert(json !== null, "应该能导出JSON");
  assert(json!.includes("KeyX"), "导出的JSON应该包含输入数据");

  // 导入
  const newRecorder = new InputRecorder();
  const imported = newRecorder.importFromJson(json!);
  assert(imported !== null, "应该能导入JSON");
  assert.equal(imported!.inputs.length, 2, "导入的录制应该有2个输入");
  assert.equal(imported!.inputs[0].code, "KeyX", "导入的输入应该正确");
}

export function testInputRecorderInitialState(): void {
  const recorder = new InputRecorder();
  const kernel = buildKernel();

  // 修改玩家状态 (P3.1: engine Actor uses flat x/y/z + hp)
  kernel.player.x = 500;
  kernel.player.z = 20;
  kernel.player.hp = 800;

  // 录制
  recorder.startRecording(kernel);
  const recording = recorder.stopRecording(kernel);

  assert(recording !== null, "应该有录制数据");
  assert.equal(recording!.initialState.playerPosition.x, 500, "应该记录玩家X位置");
  assert.equal(recording!.initialState.playerPosition.z, 20, "应该记录玩家Z位置");
  assert.equal(recording!.initialState.playerHp, 800, "应该记录玩家HP");
}
