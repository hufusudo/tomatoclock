import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCelebration } from '../js/celebration.js';

// 注入全部五个假依赖：只断言真实行为（show/playSound 的调用次数与参数），不测 DOM/Web Audio
function setup({ visible = true, remainingMs = 60000 } = {}) {
  const state = { visible, remainingMs };
  const listeners = [];
  const shows = [];
  const sounds = [];
  const celebration = createCelebration({
    isVisible: () => state.visible,
    watchVisibility: (onChange) => {
      listeners.push(onChange);
      return () => {};
    },
    getRemainingMs: () => state.remainingMs,
    show: (args) => shows.push(args),
    playSound: (phase) => sounds.push(phase),
  });
  const fireVisibility = () => [...listeners].forEach((onChange) => onChange());
  return { celebration, state, shows, sounds, fireVisibility };
}

test('隐藏时 play 只记 pending，切回补放恰好一次', () => {
  const s = setup({ visible: false, remainingMs: 4500 });
  s.celebration.play('work-done');
  assert.equal(s.shows.length, 0); // 不显示不发声
  assert.equal(s.sounds.length, 0);

  s.fireVisibility(); // 回调触发但页面仍不可见 → 不补放
  assert.equal(s.shows.length, 0);
  assert.equal(s.sounds.length, 0);

  s.state.visible = true;
  s.fireVisibility(); // 切回可见 → 补放恰好一次
  assert.equal(s.shows.length, 1);
  assert.equal(s.sounds.length, 1);
  assert.equal(s.shows[0].phase, 'work-done');
  assert.equal(s.sounds[0], 'work-done');
  assert.equal(s.shows[0].remainingMs, 4500); // getRemainingMs 在播放时读取
  assert.equal(typeof s.shows[0].onClose, 'function');

  s.fireVisibility(); // 已补放并清 pending → 再触发不重播
  assert.equal(s.shows.length, 1);
  assert.equal(s.sounds.length, 1);
});

test('同一转换重复 play 只播一次', () => {
  const s = setup({ visible: false });
  s.celebration.play('work-done');
  s.celebration.play('work-done');
  s.state.visible = true;
  s.fireVisibility();
  assert.equal(s.shows.length, 1);
  assert.equal(s.sounds.length, 1);
  assert.equal(s.shows[0].phase, 'work-done');
});

test('可见时立即播放且幂等', () => {
  const s = setup({ visible: true });
  s.celebration.play('break-done');
  s.celebration.play('break-done');
  s.celebration.play('work-done'); // 已有未 dismiss 的演出 → 一律忽略
  assert.equal(s.shows.length, 1);
  assert.equal(s.sounds.length, 1);
  assert.equal(s.shows[0].phase, 'break-done');
  assert.equal(s.sounds[0], 'break-done');
});

test('pending 后到覆盖先到', () => {
  const s = setup({ visible: false });
  s.celebration.play('work-done');
  s.celebration.play('break-done');
  s.state.visible = true;
  s.fireVisibility();
  assert.equal(s.shows.length, 1);
  assert.equal(s.shows[0].phase, 'break-done');
  assert.equal(s.sounds.length, 1);
  assert.equal(s.sounds[0], 'break-done');
});

test('dismiss 后新转换可再播', () => {
  const s = setup({ visible: true });
  s.celebration.dismiss(); // 无演出时 no-op
  s.celebration.play('work-done');
  s.celebration.dismiss();
  s.celebration.play('work-done');
  assert.equal(s.shows.length, 2);
  assert.equal(s.sounds.length, 2);
});

test('非法 phase 抛错', () => {
  const s = setup({ visible: true });
  assert.throws(() => s.celebration.play('idle'), Error);
  assert.throws(() => s.celebration.play('WORK-DONE'), Error);
  assert.throws(() => s.celebration.play(''), Error);
  assert.throws(() => s.celebration.play(undefined), Error);
  assert.equal(s.shows.length, 0);
  assert.equal(s.sounds.length, 0);
});

test('用户点掉演出（onClose）后新转换可再播', () => {
  const s = setup({ visible: true });
  s.celebration.play('break-done');
  s.shows[0].onClose();
  s.celebration.play('break-done');
  assert.equal(s.shows.length, 2);
  assert.equal(s.sounds.length, 2);
});

test('无参创建不触碰 document/AudioContext（默认实现惰性）', () => {
  assert.equal(typeof document, 'undefined'); // Node 环境即证明：import 与创建全程未碰 DOM
  assert.equal(typeof AudioContext, 'undefined');
  assert.doesNotThrow(() => createCelebration());
});

test('隐藏 pending 时 dismiss 保留待补放提醒', () => {
  const s = setup({ visible: false });
  s.celebration.play('work-done');
  s.celebration.dismiss();
  s.state.visible = true;
  s.fireVisibility();
  assert.equal(s.shows.length, 1);
  assert.equal(s.shows[0].phase, 'work-done');
});

test('演出未关闭时隐藏页面后再次 play 也不排队重播', () => {
  const s = setup();
  s.celebration.play('work-done');
  s.state.visible = false;
  s.celebration.play('break-done');
  s.state.visible = true;
  s.fireVisibility();
  assert.equal(s.shows.length, 1);
  assert.equal(s.sounds.length, 1);
});

// 外部音频设备在 Node 中不可用，仅替代 Web Audio 边界；执行真正的声音排程代码。
function suspendedAudio(t) {
  const starts = [];
  let finishResume;
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = (extra = {}) => ({ connect: (next) => next, disconnect() {}, ...extra });
  class FakeAudioContext {
    state = 'suspended';
    currentTime = 1;
    destination = node();
    resume() {
      return new Promise((resolve) => {
        finishResume = () => { this.state = 'running'; this.currentTime = 5; resolve(); };
      });
    }
    createOscillator() {
      return node({ frequency: parameter(), start: (at) => starts.push(at), stop() {} });
    }
    createGain() { return node({ gain: parameter() }); }
    createDynamicsCompressor() {
      return node(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map((key) => [key, parameter()])));
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else delete globalThis.AudioContext;
  });
  return { starts, resume: () => finishResume() };
}

test('挂起音频恢复完成后才从新 currentTime 排程，三声不挤压', async (t) => {
  const audio = suspendedAudio(t);
  const { createCelebration: create } = await import('../js/celebration.js?audio-resume');
  const c = create({ isVisible: () => true, watchVisibility: () => {}, show: () => {} });
  c.play('work-done');
  assert.equal(audio.starts.length, 0);
  audio.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(audio.starts.length > 0);
  assert.ok(Math.min(...audio.starts) > 5);
  assert.ok(Math.max(...audio.starts) - Math.min(...audio.starts) >= 0.3);
  c.dismiss();
});

test('恢复音频前关闭演出，恢复后不补发迟到声音', async (t) => {
  const audio = suspendedAudio(t);
  const { createCelebration: create } = await import('../js/celebration.js?audio-cancel');
  let onClose;
  const c = create({
    isVisible: () => true, watchVisibility: () => {},
    show: (args) => { onClose = args.onClose; },
  });
  c.play('work-done');
  onClose();
  audio.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(audio.starts, []);
});
