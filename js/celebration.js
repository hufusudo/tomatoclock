// TomatoClock 到点演出接缝：对外只承诺 play(phase) / dismiss()（接口冻结）。
// pending/幂等状态机与占位 DOM、Web Audio 实现都在本文件内；除本文件外任何模块不得感知演出细节。
// 默认实现全部惰性——模块 import 与 createCelebration() 都不碰 document / AudioContext（Node 测试才能 import）。

const PHRASES = {
  'work-done': '该休息了',
  'break-done': '该开工了',
};

// 三声提示音：work-done 上行 C5-E5-G5，break-done 上行 E5-G5-C6
const CHIME_NOTES = {
  'work-done': [523.25, 659.25, 783.99],
  'break-done': [659.25, 783.99, 1046.5],
};

// MM:SS：分钟不进位到小时（180 分显示 180:00）；秒向上取整，倒计时归零才显示 00:00
function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function defaultWatchVisibility(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

let audioContext = null; // AudioContext 单例惰性创建（默认 playSound 首次调用时）

function defaultPlaySound(phase) {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return;
    }
  }
  if (audioContext.state === 'suspended') {
    const resumed = audioContext.resume();
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {}); // 自动播放策略拒绝也不留未处理 rejection
  }
  const startAt = audioContext.currentTime + 0.05;
  CHIME_NOTES[phase].forEach((freq, index) => {
    const when = startAt + index * 0.16;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.15, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(when);
    oscillator.stop(when + 0.35);
  });
}

export function createCelebration(deps = {}) {
  const isVisible = deps.isVisible ?? (() => document.visibilityState === 'visible');
  const watchVisibility = deps.watchVisibility ?? defaultWatchVisibility;
  const getRemainingMs = deps.getRemainingMs ?? (() => 0);
  const playSound = deps.playSound ?? defaultPlaySound;

  let pending = null; // 待页面可见后补放的 phase（最多一条，后到覆盖先到）
  let playing = false; // 是否有未关闭的演出
  let watching = false; // 可见性监听只注册一次
  let closeOverlay = null; // 占位遮罩的关闭动作：占位 show 写入，dismiss() 用它移除 DOM

  // 占位 show：全屏遮罩（role="dialog"）+ 大字文案 + 每秒刷新的倒计时，点任意处调 onClose
  function placeholderShow({ phase, remainingMs, onClose }) {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', PHRASES[phase]);
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      cursor: 'pointer',
      textAlign: 'center',
      background: 'rgba(17, 24, 39, 0.94)',
      color: '#ffffff',
      fontFamily: 'system-ui, sans-serif',
    });

    const phrase = document.createElement('p');
    phrase.textContent = PHRASES[phase];
    Object.assign(phrase.style, { margin: '0', fontSize: 'clamp(2rem, 8vw, 4.5rem)', fontWeight: '700' });

    const clock = document.createElement('div');
    clock.textContent = formatClock(remainingMs);
    Object.assign(clock.style, { fontSize: 'clamp(1.5rem, 6vw, 3rem)', fontVariantNumeric: 'tabular-nums' });

    overlay.append(phrase, clock);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      overlay.remove();
      if (closeOverlay === close) closeOverlay = null;
      onClose();
    }

    const timer = setInterval(() => {
      clock.textContent = formatClock(getRemainingMs());
    }, 1000);
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    closeOverlay = close;
  }

  const show = deps.show ?? placeholderShow;

  function handleShowClosed() {
    playing = false;
  }

  function perform(phase) {
    playing = true;
    show({ phase, remainingMs: getRemainingMs(), onClose: handleShowClosed });
    playSound(phase);
  }

  function handleVisibilityChange() {
    if (pending === null || !isVisible()) return; // 仍不可见 → pending 保留
    const phase = pending;
    pending = null; // 补放恰好一次
    perform(phase);
  }

  function play(phase) {
    if (!Object.hasOwn(PHRASES, phase)) throw new Error(`未知 phase：${String(phase)}`);
    if (playing) return; // 已有未关闭的演出 → 幂等忽略
    if (!watching) {
      watching = true;
      watchVisibility(handleVisibilityChange);
    }
    if (!isVisible()) {
      pending = phase; // 只记 pending，不显示不发声；后到覆盖先到
      return;
    }
    pending = null;
    perform(phase);
  }

  function dismiss() {
    if (!playing) return; // 无演出 → no-op
    playing = false;
    const close = closeOverlay;
    closeOverlay = null;
    if (close) close(); // 占位遮罩在此移除；注入的 show 未注册则只结束幂等状态
  }

  return { play, dismiss };
}
