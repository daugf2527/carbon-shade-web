#!/usr/bin/env node
/**
 * 根因分析脚本 - Walk 速度问题
 *
 * 目的：诊断为什么 Walk 速度只有预期的 26%
 *
 * 问题：
 * - 实际速度：31.63 px/s
 * - 预期速度：121.55 px/s
 * - 差距：-74%
 *
 * 可能原因：
 * 1. holdKey() 不工作 - 输入未传递到 kernel
 * 2. 游戏暂停或 tick 速率异常
 * 3. moveSpeed 计算错误
 * 4. headless 模式下行为不同
 */

import { chromium } from '@playwright/test';

async function diagnoseWalkSpeed() {
  console.log('[DIAGNOSE] Starting Walk speed root cause analysis...\n');

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 加载页面
    console.log('[STEP 1] Loading page...');
    await page.goto('http://localhost:5173/?scene=combat');
    await page.waitForFunction(() => Boolean((window as any).combatLab?.kernelReady), { timeout: 30000 });
    console.log('✓ Page loaded, kernel ready\n');

    // 2. 获取初始状态
    console.log('[STEP 2] Getting initial state...');
    const initialState = await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      const player = kernel?.actors?.find((a: any) => a.id === 'player');
      return {
        position: player?.position,
        velocity: player?.velocity,
        tick: kernel?.tickCount,
        paused: kernel?.simulation?.paused,
      };
    });
    console.log('Initial state:', initialState);
    console.log('');

    // 3. 测试输入传递
    console.log('[STEP 3] Testing input delivery...');
    await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      console.log('[INPUT] Calling keyDown(ArrowRight)');
      kernel?.inputState?.keyDown?.('ArrowRight', false);
    });

    await page.waitForTimeout(100);

    const afterKeyDown = await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      const inputState = kernel?.inputState;
      return {
        keys: inputState?.keys ? Object.keys(inputState.keys) : [],
        ArrowRightPressed: inputState?.keys?.['ArrowRight'],
      };
    });
    console.log('After keyDown:', afterKeyDown);
    console.log('');

    // 4. 持续按住 2 秒
    console.log('[STEP 4] Holding ArrowRight for 2 seconds...');
    const startPos = await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      const player = kernel?.actors?.find((a: any) => a.id === 'player');
      return player?.position?.x;
    });

    await page.waitForTimeout(2000);

    const endPos = await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      const player = kernel?.actors?.find((a: any) => a.id === 'player');
      return player?.position?.x;
    });

    await page.evaluate(() => {
      const kernel = (window as any).combatLab?.kernel;
      kernel?.inputState?.keyUp?.('ArrowRight');
    });

    const distance = Math.abs(endPos - startPos);
    const speed = distance / 2;

    console.log(`Start position: ${startPos}`);
    console.log(`End position: ${endPos}`);
    console.log(`Distance: ${distance.toFixed(2)} px`);
    console.log(`Speed: ${speed.toFixed(2)} px/s`);
    console.log(`Expected: 121.55 px/s`);
    console.log(`Ratio: ${((speed / 121.55) * 100).toFixed(1)}%`);
    console.log('');

    // 5. 检查 tick 速率
    console.log('[STEP 5] Checking tick rate...');
    const startTick = await page.evaluate(() => (window as any).combatLab?.kernel?.tickCount);
    await page.waitForTimeout(1000);
    const endTick = await page.evaluate(() => (window as any).combatLab?.kernel?.tickCount);
    const tickRate = endTick - startTick;
    console.log(`Ticks in 1 second: ${tickRate} (expected: 60)`);
    console.log('');

    // 6. 结论
    console.log('[CONCLUSION]');
    if (speed < 50) {
      console.log('❌ Walk speed is severely reduced');
      console.log('   Likely cause: Input not being processed correctly');
    } else if (tickRate < 55) {
      console.log('❌ Tick rate is too low');
      console.log('   Likely cause: Game is running slowly or paused');
    } else {
      console.log('⚠️  Speed is reduced but tick rate is normal');
      console.log('   Likely cause: moveSpeed calculation or physics issue');
    }

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    await browser.close();
  }
}

diagnoseWalkSpeed().catch(console.error);
