// TomatoClock 计时状态机：纯逻辑，无 DOM / storage 依赖。
// 时间只来自注入的 now()（默认 Date.now），deadline 判定不依赖 Date.now 轮询。

const MINUTE_MS = 60000;

function clampInt(value, fallback, min, max) {
  const rounded = Math.round(Number(value));
  const n = Number.isFinite(rounded) ? rounded : fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSettings(raw) {
  const src = raw ?? {};
  return {
    workMin: clampInt(src.workMin, 50, 1, 180),
    shortAdj: clampInt(src.shortAdj, 0, -5, 5),
    longAdj: clampInt(src.longAdj, 0, -5, 5),
  };
}

export function effectiveDurations(settings) {
  const workMs = settings.workMin * MINUTE_MS;
  return {
    workMs,
    shortBreakMs: Math.max(MINUTE_MS, workMs / 5 + settings.shortAdj * MINUTE_MS),
    longBreakMs: Math.max(MINUTE_MS, workMs * 0.6 + settings.longAdj * MINUTE_MS),
  };
}

export function createTimer({ settings, now = () => Date.now() }) {
  let current = sanitizeSettings(settings);

  let state = 'ready'; // 'ready' | 'working' | 'paused' | 'break'
  let segment = null; // 'work' | 'short-break' | 'long-break' | null
  let completedInRound = 0; // 0–3
  let deadline = null; // 当前段截止时刻（工作段=起跑算出，休息段=归零时 now()+duration）
  let pausedRemainingMs = null;
  let segmentDurations = null; // 起跑时的有效时长快照

  function assertState(expected, action) {
    if (state !== expected) {
      throw new Error(`${action}() 需要 ${expected} 态，当前为 ${state} 态`);
    }
  }

  function remainingMs() {
    if (state === 'ready') return effectiveDurations(current).workMs;
    if (state === 'paused') return pausedRemainingMs;
    return Math.max(0, deadline - now());
  }

  function start() {
    assertState('ready', 'start');
    segmentDurations = effectiveDurations(current);
    deadline = now() + segmentDurations.workMs;
    segment = 'work';
    state = 'working';
    return [];
  }

  function pause() {
    assertState('working', 'pause');
    pausedRemainingMs = Math.max(0, deadline - now());
    deadline = null;
    state = 'paused';
    return [];
  }

  function resume() {
    assertState('paused', 'resume');
    deadline = now() + pausedRemainingMs;
    pausedRemainingMs = null;
    state = 'working';
    return [];
  }

  function reset() {
    // 只放弃当前段：回 ready、清段与截止时刻；轮次计数不动，不产生事件
    state = 'ready';
    segment = null;
    deadline = null;
    pausedRemainingMs = null;
    segmentDurations = null;
    return [];
  }

  function tick() {
    if (state === 'working') {
      if (now() < deadline) return [];
      // completedAt 取 deadline（实时与补记同口径）；入账在前、开休在后
      const events = [{ type: 'work-done', completedAt: deadline, workMs: segmentDurations.workMs }];
      completedInRound += 1;
      const kind = completedInRound >= 4 ? 'long' : 'short';
      if (kind === 'long') completedInRound = 0;
      const durationMs = kind === 'long' ? segmentDurations.longBreakMs : segmentDurations.shortBreakMs;
      events.push({ type: 'break-started', kind, durationMs });
      // 新段 deadline 从 now() 起算 → 至多走一格，结构上不连锁
      segment = kind === 'long' ? 'long-break' : 'short-break';
      state = 'break';
      deadline = now() + durationMs;
      return events;
    }
    if (state === 'break') {
      if (now() < deadline) return [];
      state = 'ready';
      segment = null;
      deadline = null;
      segmentDurations = null;
      return [{ type: 'break-done' }];
    }
    return []; // ready / paused：paused 恒返回 []
  }

  function setSettings(next) {
    assertState('ready', 'setSettings');
    current = sanitizeSettings(next);
  }

  return {
    get state() {
      return state;
    },
    get segment() {
      return segment;
    },
    get completedInRound() {
      return completedInRound;
    },
    remainingMs,
    start,
    pause,
    resume,
    reset,
    tick,
    setSettings,
  };
}
