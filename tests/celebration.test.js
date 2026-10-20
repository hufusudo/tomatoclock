import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCelebration} from '../js/celebration.js';
function setup(visible=true){const state={visible},sounds=[],listeners=[];const c=createCelebration({isVisible:()=>state.visible,watchVisibility:cb=>listeners.push(cb),playSound:phase=>{sounds.push(phase);}});return {c,state,sounds,fire:()=>listeners.forEach(cb=>cb())};}
test('visible phases play once and never create a visual overlay',()=>{const s=setup();s.c.play('work-done');s.c.play('work-done');s.c.play('break-done');assert.deepEqual(s.sounds,['work-done','break-done']);});
test('hidden phases sound immediately once and never replay on restore',()=>{const s=setup(false);s.c.play('work-done');s.c.play('work-done');assert.deepEqual(s.sounds,['work-done']);s.c.play('break-done');s.c.play('break-done');assert.deepEqual(s.sounds,['work-done','break-done']);s.state.visible=true;s.fire();s.fire();assert.deepEqual(s.sounds,['work-done','break-done']);});
test('reset cancels playing sound and lets the next completion sound in background',()=>{let stops=0;const sounds=[];const c=createCelebration({isVisible:()=>false,watchVisibility:()=>{},playSound:phase=>{sounds.push(phase);return ()=>stops++;}});c.play('work-done');c.dismiss();assert.equal(stops,1);c.play('work-done');assert.deepEqual(sounds,['work-done','work-done']);});
test('unknown phases are rejected and audio failures do not block a transition',()=>{const s=setup();assert.throws(()=>s.c.play('idle'));const c=createCelebration({isVisible:()=>true,watchVisibility:()=>{},playSound:()=>{throw new Error('device');}});assert.doesNotThrow(()=>c.play('work-done'));});
test('import and construction need neither DOM nor audio device',()=>{assert.equal(typeof document,'undefined');assert.doesNotThrow(()=>createCelebration());});
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
  return { starts, get resumeRequested() { return typeof finishResume === 'function'; }, resume: () => finishResume() };
}

test('挂起音频恢复完成后才从新 currentTime 排程，三声不挤压', async (t) => {
  const audio = suspendedAudio(t);
  const { createCelebration: create } = await import('../js/celebration.js?audio-resume');
  const c = create({ isVisible: () => false, watchVisibility: () => {} });
  c.play('work-done');
  assert.equal(audio.starts.length, 0);
  assert.equal(audio.resumeRequested, true, 'background completion resumes the audio device immediately');
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
  const c = create({ isVisible: () => true, watchVisibility: () => {}, show: () => {} });
  c.play('work-done');
  c.dismiss();
  audio.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(audio.starts, []);
});
