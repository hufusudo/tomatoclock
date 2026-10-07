// TomatoClock 存储：单键 localStorage 分日入账 + 设置持久化。
// 派生值（有效短休/长休）不落盘；写入时机只有两处：recordPomodoro 与 saveSettings。
import { sanitizeSettings } from './timer.js';

export const STORAGE_KEY = 'tomatoclock:v1';

// 本地时区日期 YYYY-MM-DD（toISOString 是 UTC，禁用）
export function dayKey(ms) {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultState() {
  return { days: {}, settings: sanitizeSettings({}) };
}

// 只认 { pomodoros, studySeconds }，脏字段归 0；非对象的天整条丢弃
function normalizeDay(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    pomodoros: Number.isFinite(raw.pomodoros) ? raw.pomodoros : 0,
    studySeconds: Number.isFinite(raw.studySeconds) ? raw.studySeconds : 0,
  };
}

// JSON 损坏 / 顶层形状不符 → null（调用方回退默认值）；未知字段忽略
function parseState(raw) {
  if (typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.days)) {
    return null;
  }
  const days = {};
  for (const [key, value] of Object.entries(parsed.days)) {
    const day = normalizeDay(value);
    if (day) days[key] = day;
  }
  // settings 字段损坏/缺失只回退 settings，已解析的有效 days 保留（不连带抹掉天数据）
  const settings = isPlainObject(parsed.settings)
    ? sanitizeSettings(parsed.settings)
    : sanitizeSettings({});
  return { days, settings };
}

// localStorage 不可用时的内存兜底（同样形状）
function memoryBackend() {
  const store = new Map();
  return {
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

// 构造时探测：访问 / 读 / 写任一抛错 → 不可用。探测写不改动已有数据。
function probeBackend(backend) {
  if (!backend || typeof backend.getItem !== 'function' || typeof backend.setItem !== 'function') {
    return false;
  }
  try {
    const existing = backend.getItem(STORAGE_KEY);
    if (existing === null) {
      backend.setItem(STORAGE_KEY, ''); // 无数据时探测写，随后还原为“无”
      if (typeof backend.removeItem === 'function') backend.removeItem(STORAGE_KEY);
    } else {
      backend.setItem(STORAGE_KEY, existing);
    }
    return true;
  } catch {
    return false;
  }
}

export function createStorage({ backend } = {}) {
  let target = backend;
  if (target === undefined) {
    try {
      target = globalThis.localStorage; // 浏览器隐私模式下访问可能抛错
    } catch {
      target = null;
    }
  }
  let persistent = probeBackend(target);
  let store = persistent ? target : memoryBackend();

  // 读失败或形状不符 → 默认值，不写回
  function readState() {
    let raw = null;
    try {
      raw = store.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    return parseState(raw) ?? defaultState();
  }

  function writeState(state) {
    const serialized = JSON.stringify(state);
    try {
      store.setItem(STORAGE_KEY, serialized);
    } catch {
      // 运行期写失败（配额满等）：切内存后端保住本次入账，番茄完成的入账/通知/演出不被打断
      store = memoryBackend();
      store.setItem(STORAGE_KEY, serialized);
      persistent = false;
    }
  }

  function load() {
    return readState();
  }

  function saveSettings(settings) {
    const next = sanitizeSettings(settings);
    const state = readState(); // 保留既有分日数据
    state.settings = next;
    writeState(state);
    return next;
  }

  function recordPomodoro({ completedAt, workMs }) {
    const key = dayKey(completedAt);
    const state = readState();
    const day = state.days[key] ?? { pomodoros: 0, studySeconds: 0 };
    day.pomodoros += 1;
    day.studySeconds += Number.isFinite(workMs) ? Math.round(workMs / 1000) : 0;
    state.days[key] = day;
    writeState(state);
    return { key, day: { pomodoros: day.pomodoros, studySeconds: day.studySeconds } };
  }

  return {
    get isPersistent() {
      return persistent; // 运行期写失败后置 false（getter 恒取当前值）
    },
    load,
    saveSettings,
    recordPomodoro,
  };
}
