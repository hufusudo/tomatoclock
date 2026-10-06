import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, dayKey, createStorage } from '../js/storage.js';

// 假 backend：Map 包装的 localStorage 形状（getItem/setItem/removeItem）
function makeBackend(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

const DEFAULT_SETTINGS = { workMin: 50, shortAdj: 0, longAdj: 0 };

test('按完成时刻分桶', () => {
  const backend = makeBackend();
  const storage = createStorage({ backend });
  assert.equal(storage.isPersistent, true);

  const result = storage.recordPomodoro({
    completedAt: Date.parse('2026-10-06T10:00:00'),
    workMs: 3000000,
  });
  assert.equal(result.key, '2026-10-06');
  assert.deepStrictEqual(result.day, { pomodoros: 1, studySeconds: 3000 });

  const stored = JSON.parse(backend.getItem(STORAGE_KEY)); // 落盘的真实内容
  assert.deepStrictEqual(stored.days, { '2026-10-06': { pomodoros: 1, studySeconds: 3000 } });
  assert.deepStrictEqual(stored.settings, DEFAULT_SETTINGS); // 入账不改设置
});

test('跨午夜分桶', () => {
  const backend = makeBackend();
  const storage = createStorage({ backend });

  const r1 = storage.recordPomodoro({ completedAt: Date.parse('2026-10-06T23:59:00'), workMs: 60000 });
  const r2 = storage.recordPomodoro({ completedAt: Date.parse('2026-10-07T00:01:00'), workMs: 60000 });

  assert.notEqual(r1.key, r2.key);
  assert.equal(r1.day.pomodoros, 1);
  assert.equal(r2.day.pomodoros, 1);

  const { days } = storage.load();
  assert.deepStrictEqual(days[r1.key], { pomodoros: 1, studySeconds: 60 });
  assert.deepStrictEqual(days[r2.key], { pomodoros: 1, studySeconds: 60 });
});

test('损坏 JSON 容错', () => {
  const backend = makeBackend({ [STORAGE_KEY]: '{oops' });
  const storage = createStorage({ backend });

  const state = storage.load(); // 不抛错
  assert.deepStrictEqual(state, { days: {}, settings: DEFAULT_SETTINGS });
  assert.equal(backend.getItem(STORAGE_KEY), '{oops'); // 不强制写回
});

test('形状不符回退默认', () => {
  const raw = '{"days":[],"settings":5}';
  const backend = makeBackend({ [STORAGE_KEY]: raw });
  const storage = createStorage({ backend });

  assert.deepStrictEqual(storage.load(), { days: {}, settings: DEFAULT_SETTINGS });
  assert.equal(backend.getItem(STORAGE_KEY), raw); // 不强制写回
});

test('设置读写与钳制', () => {
  const backend = makeBackend();
  const storage = createStorage({ backend });

  const saved = storage.saveSettings({ workMin: 999, shortAdj: -99 });
  assert.deepStrictEqual(saved, { workMin: 180, shortAdj: -5, longAdj: 0 });

  const stored = JSON.parse(backend.getItem(STORAGE_KEY));
  assert.deepStrictEqual(stored.settings, { workMin: 180, shortAdj: -5, longAdj: 0 }); // 落盘值

  const reopened = createStorage({ backend }); // 重开
  assert.deepStrictEqual(reopened.load().settings, { workMin: 180, shortAdj: -5, longAdj: 0 });
});

test('存储不可用时内存兜底', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  const storage = createStorage({ backend: broken });

  assert.equal(storage.isPersistent, false);
  storage.recordPomodoro({ completedAt: Date.parse('2026-10-06T10:00:00'), workMs: 60000 });
  assert.equal(storage.load().days['2026-10-06'].pomodoros, 1); // 记录仍可见
});

test('多次入账累加 studySeconds', () => {
  const backend = makeBackend();
  const storage = createStorage({ backend });
  const at = Date.parse('2026-10-06T10:00:00');

  storage.recordPomodoro({ completedAt: at, workMs: 1500000 });
  const r = storage.recordPomodoro({ completedAt: at, workMs: 3000000 });

  assert.deepStrictEqual(r.day, { pomodoros: 2, studySeconds: 4500 });
  assert.deepStrictEqual(storage.load().days['2026-10-06'], { pomodoros: 2, studySeconds: 4500 });
});

test('dayKey 用本地时区而非 UTC', () => {
  const ms = Date.parse('2026-10-06T00:30:00'); // 本地 00:30（UTC+8 下 UTC 仍是前一天）
  assert.equal(dayKey(ms), '2026-10-06');
  assert.notEqual(dayKey(ms), new Date(ms).toISOString().slice(0, 10)); // toISOString 是 UTC，禁用
});
