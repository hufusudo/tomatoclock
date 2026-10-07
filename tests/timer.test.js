import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings, effectiveDurations, createTimer } from '../js/timer.js';

const SETTINGS = { workMin: 50, shortAdj: 0, longAdj: 0 };
const WORK_MS = 3000000;
const SHORT_MS = 600000;
const LONG_MS = 1800000;

test('ready→working→break 全路径', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });

  assert.equal(timer.state, 'ready');
  assert.equal(timer.segment, null);
  assert.equal(timer.completedInRound, 0);
  assert.equal(timer.remainingMs(), WORK_MS);

  assert.deepStrictEqual(timer.start(), []); // 转换方法同样返回 Event[]
  assert.equal(timer.state, 'working');
  assert.equal(timer.segment, 'work');
  assert.equal(timer.remainingMs(), WORK_MS);

  t += 3000000;
  const events = timer.tick();
  assert.deepStrictEqual(events, [
    { type: 'work-done', completedAt: 3000000, workMs: 3000000 },
    { type: 'break-started', kind: 'short', durationMs: 600000 },
  ]);
  assert.equal(timer.state, 'break');
  assert.equal(timer.segment, 'short-break');
  assert.equal(timer.completedInRound, 1);
});

test('第 4 个番茄进长休', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });

  const rounds = [];
  const breakStarts = [];
  for (let i = 0; i < 4; i++) {
    timer.start();
    t += WORK_MS;
    const events = timer.tick();
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'work-done');
    rounds.push(timer.completedInRound);
    breakStarts.push(events[1]);
    if (i === 3) assert.equal(timer.segment, 'long-break');
    t += events[1].durationMs;
    assert.deepStrictEqual(timer.tick(), [{ type: 'break-done' }]);
  }

  assert.deepStrictEqual(rounds, [1, 2, 3, 0]);
  assert.deepStrictEqual(breakStarts.slice(0, 3), [
    { type: 'break-started', kind: 'short', durationMs: SHORT_MS },
    { type: 'break-started', kind: 'short', durationMs: SHORT_MS },
    { type: 'break-started', kind: 'short', durationMs: SHORT_MS },
  ]);
  assert.deepStrictEqual(breakStarts[3], { type: 'break-started', kind: 'long', durationMs: 1800000 });
  assert.equal(timer.completedInRound, 0);
  assert.equal(timer.state, 'ready');
});

test('暂停/恢复不漂移', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });
  timer.start();

  t = 1000000;
  assert.deepStrictEqual(timer.pause(), []);
  assert.equal(timer.state, 'paused');
  assert.equal(timer.segment, 'work');
  assert.equal(timer.remainingMs(), 2000000);
  assert.deepStrictEqual(timer.tick(), []); // paused 态 tick 恒返回 []

  t += 3600000; // 暂停了 1 小时
  assert.deepStrictEqual(timer.resume(), []);
  assert.equal(timer.state, 'working');
  assert.equal(timer.remainingMs(), 2000000); // 恢复不漂移

  t += 1999999;
  assert.deepStrictEqual(timer.tick(), []);
  t += 1;
  const events = timer.tick();
  assert.equal(events[0].type, 'work-done');
  assert.equal(events[0].completedAt, 6600000);
  assert.equal(events[0].workMs, 3000000);
});

test('唤醒补记最多一格', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });
  timer.start();

  t = 3 * 3600000; // 睡了 3 小时
  const events = timer.tick();
  assert.deepStrictEqual(events, [
    { type: 'work-done', completedAt: 3000000, workMs: 3000000 },
    { type: 'break-started', kind: 'short', durationMs: 600000 },
  ]);
  assert.equal(timer.remainingMs(), effectiveDurations(SETTINGS).shortBreakMs); // 新段从 now 起算，剩余=完整短休
  assert.deepStrictEqual(timer.tick(), []); // 不连锁走第二格
});

test('break 归零回 ready 且不自动开工', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });

  timer.start();
  t += WORK_MS;
  timer.tick(); // → break
  t += SHORT_MS;
  assert.deepStrictEqual(timer.tick(), [{ type: 'break-done' }]);
  assert.equal(timer.state, 'ready');
  assert.equal(timer.segment, null);

  t += 1000000; // 再怎么过点也不自动开工
  assert.deepStrictEqual(timer.tick(), []);
  assert.equal(timer.state, 'ready');
});

test('重置不回滚轮次且不入账', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });

  for (let i = 0; i < 2; i++) {
    timer.start();
    t += WORK_MS;
    timer.tick();
    t += SHORT_MS;
    timer.tick();
  }
  assert.equal(timer.completedInRound, 2);

  timer.start(); // 第 3 轮中途
  t += 1000000;
  assert.deepStrictEqual(timer.reset(), []); // 无事件

  assert.equal(timer.state, 'ready');
  assert.equal(timer.segment, null);
  assert.equal(timer.completedInRound, 2); // 轮次不回滚

  t += WORK_MS; // 过了原 deadline 也不补记
  assert.deepStrictEqual(timer.tick(), []);
  assert.equal(timer.completedInRound, 2);
});

test('sanitizeSettings 钳制边界', () => {
  assert.deepStrictEqual(sanitizeSettings({ workMin: 0 }), { workMin: 1, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ workMin: 181 }), { workMin: 180, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ workMin: 25.7 }), { workMin: 26, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ workMin: 'abc' }), { workMin: 50, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ shortAdj: 99, longAdj: -99 }), { workMin: 50, shortAdj: 5, longAdj: -5 });
});

test('sanitizeSettings 缺失值走 fallback 而非 Number() 归 0', () => {
  // Number('')/Number(null) 归 0 再钳 1 会击穿“缺失 → 50”回退，输入框清空必须回 50
  assert.deepStrictEqual(sanitizeSettings({ workMin: '' }), { workMin: 50, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ workMin: null }), { workMin: 50, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ workMin: undefined }), { workMin: 50, shortAdj: 0, longAdj: 0 });
  assert.deepStrictEqual(sanitizeSettings({ shortAdj: '', longAdj: null }), { workMin: 50, shortAdj: 0, longAdj: 0 });
});

test('有效休息 1 分钟下限与 ±5', () => {
  assert.equal(effectiveDurations({ workMin: 1, shortAdj: -5 }).shortBreakMs, 60000);
  assert.equal(effectiveDurations({ workMin: 25, shortAdj: 5 }).shortBreakMs, 600000); // 控制器裁定 A：原 480000 为简报算术笔误，公式权威
  assert.equal(effectiveDurations({ workMin: 25, longAdj: -5 }).longBreakMs, 600000);
});

test('WORKING 中 setSettings 抛错', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });
  timer.start();
  assert.throws(() => timer.setSettings({ workMin: 10 }), Error);
});

test('非法转换一律抛错', () => {
  let t = 0;
  const now = () => t;
  const timer = createTimer({ settings: SETTINGS, now });

  assert.throws(() => timer.resume(), Error); // ready → resume 非 paused
  assert.throws(() => timer.pause(), Error); // ready → pause 非 working

  timer.start();
  assert.throws(() => timer.start(), Error); // working → start 非 ready
  assert.throws(() => timer.resume(), Error); // working → resume 非 paused
  assert.throws(() => timer.setSettings({ workMin: 5 }), Error); // 非 ready → setSettings

  timer.pause();
  assert.throws(() => timer.pause(), Error); // paused → pause 非 working
  assert.throws(() => timer.start(), Error); // paused → start 非 ready
});
