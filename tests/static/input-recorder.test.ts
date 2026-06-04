import { assert } from "./test-utils.js";
import { InputRecorder } from "../../src/combat/replay/InputRecorder.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

export function testInputRecorderBasics(): void {
  const recorder = new InputRecorder();
  const kernel = new CombatKernel({ enableReplay: false });

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
  const kernel = new CombatKernel({ enableReplay: false });

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
  const kernel = new CombatKernel({ enableReplay: false });

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
  const kernel = new CombatKernel({ enableReplay: false });

  // 修改玩家状态
  kernel.player.position.x = 500;
  kernel.player.position.z = 20;
  kernel.player.resources.hp = 800;

  // 录制
  recorder.startRecording(kernel);
  const recording = recorder.stopRecording(kernel);

  assert(recording !== null, "应该有录制数据");
  assert.equal(recording!.initialState.playerPosition.x, 500, "应该记录玩家X位置");
  assert.equal(recording!.initialState.playerPosition.z, 20, "应该记录玩家Z位置");
  assert.equal(recording!.initialState.playerHp, 800, "应该记录玩家HP");
}
