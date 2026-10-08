// 到点演出：冻结 createCelebration(deps) → { play, dismiss } 与五个可选依赖。
// DOM / AudioContext 均在播放时惰性创建，import 和无参创建可直接在 Node 中运行。
const PHRASES = { 'work-done': '该休息了', 'break-done': '该开工了' };
const CHIME_NOTES = {
  'work-done': [523.25, 659.25, 783.99],
  'break-done': [659.25, 783.99, 1046.5],
};

function formatClock(ms) {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const STYLES = `
.tc-celebration {
  --tc-ink: #263e36; --tc-leaf: #3f7462; --tc-gold: #efbb55;
  position: fixed; inset: 0; z-index: 9999; overflow: hidden;
  display: grid; place-items: center; isolation: isolate; cursor: pointer;
  color: var(--tc-ink); background: #fff8ed;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  text-align: center; animation: tc-reveal .45s ease-out both;
}
.tc-celebration *, .tc-celebration *::before, .tc-celebration *::after { box-sizing: border-box; }
.tc-celebration:focus { outline: none; }
.tc-celebration::before {
  content: ''; position: absolute; inset: -20%; z-index: -2;
  background: radial-gradient(ellipse at 25% 20%, #d9eee0 0, transparent 45%),
    radial-gradient(ellipse at 80% 72%, #ffe4b8 0, transparent 40%),
    radial-gradient(ellipse at 50% 48%, #ffffff 0, #fff8ed 65%);
  animation: tc-sky 16s ease-in-out infinite alternate;
}
.tc-celebration.is-break-done::before {
  background: radial-gradient(ellipse at 20% 30%, #ffe7ac 0, transparent 45%),
    radial-gradient(ellipse at 80% 65%, #ffd8cf 0, transparent 40%),
    radial-gradient(ellipse at 50% 48%, #ffffff 0, #fff8ed 65%);
}
.tc-celebration::after {
  content: ''; position: absolute; inset: 0; z-index: -1; opacity: .15; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23807860' opacity='.25' filter='url(%23n)' d='M0 0h180v180H0z'/%3E%3C/svg%3E");
}
.tc-scene { position: relative; width: min(92vw, 640px); padding: 20px; }
.tc-stage { position: relative; width: 340px; height: 300px; margin: 0 auto 16px; }
.tc-halo { position: absolute; left: 50%; top: 46%; width: 430px; height: 430px; transform: translate(-50%, -50%); pointer-events: none; }
.tc-halo::before, .tc-halo::after, .tc-orbit {
  content: ''; position: absolute; border-radius: 50%; inset: 0;
  border: 1px solid #3f746224; animation: tc-ring 5.6s ease-in-out 1s infinite;
}
.tc-halo::after { inset: 30px; border-color: #efbb5540; animation-delay: 1.5s; }
.tc-orbit { inset: 60px; border: 0; background: radial-gradient(circle, #ffffffb0 0, #dbeddd70 55%, transparent 70%); animation-delay: 2s; }
.is-break-done .tc-orbit { background: radial-gradient(circle, #ffffff 0, #ffe1a880 55%, transparent 70%); }
.tc-shadow { position: absolute; width: 160px; height: 20px; border-radius: 50%; background: #3f746223; filter: blur(5px); left: 90px; bottom: 17px; animation: tc-shadow 5.6s ease-in-out 2s infinite; }
.tc-arrival { position: relative; width: 340px; height: 300px; animation: tc-arrive 1.1s cubic-bezier(.22,.7,.25,1) both; }
.tc-character { width: 100%; height: 100%; overflow: visible; }
.tc-figure { transform-origin: 170px 176px; animation: tc-breathe 5.6s ease-in-out 2.2s infinite; }
.tc-crown { transform-origin: 171px 88px; animation: tc-leaves 5.6s ease-in-out 1.7s infinite; }
.tc-arm-left { transform-origin: 99px 172px; animation: tc-stretch-left 7s ease-in-out 1.1s infinite; }
.tc-arm-right { transform-origin: 242px 172px; animation: tc-stretch-right 7s ease-in-out 1.1s infinite; }
.tc-eye { transform-origin: center; transform-box: fill-box; animation: tc-blink 6s 3s infinite; }
.tc-eyes-rest { display: none; }
.is-work-done .tc-eyes-open { display: none; }
.is-work-done .tc-eyes-rest { display: inline; }
.is-break-done .tc-figure { animation: tc-hop 3.4s ease-in-out 1.2s infinite; }
.is-break-done .tc-arm-right { animation: tc-wave 2.6s ease-in-out 1.1s infinite; }
.is-break-done .tc-arm-left { animation: tc-stretch-left 7s ease-in-out 1.1s infinite; }
.tc-burst, .tc-stars { position: absolute; inset: 0; pointer-events: none; }
.tc-confetti { position: absolute; top: 48%; left: 50%; width: 9px; height: 15px; background: var(--color); border-radius: 2px; opacity: 0; animation: tc-burst 1.9s ease-out var(--delay) both; }
.tc-confetti.is-leaf { width: 17px; height: 8px; border-radius: 100% 0 100% 0; }
.tc-star { position: absolute; width: var(--size); height: var(--size); background: var(--color); opacity: .55; border-radius: 50%; animation: tc-float var(--duration) ease-in-out var(--delay) infinite alternate; }
.tc-star.is-star { border-radius: 0; clip-path: polygon(50% 0, 62% 37%, 100% 50%, 62% 63%, 50% 100%, 38% 63%, 0 50%, 38% 37%); }
.tc-celebration .tc-title { position: relative; margin: 0; font-size: clamp(2.8rem, 6vw, 4.7rem); font-weight: 650; line-height: 1.2; letter-spacing: .1em; text-indent: .1em; animation: tc-type-in .7s .3s ease-out both; }
.tc-details { position: relative; min-height: 84px; margin-top: 22px; animation: tc-type-in .7s .55s ease-out both; }
.tc-celebration .tc-clock-label { margin: 0 0 4px; color: #527163; font-size: .85rem; letter-spacing: .12em; }
.tc-clock { font: 500 2.4rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--tc-leaf); }
.tc-celebration .tc-start-hint { margin: 0; color: #527163; font-size: 1rem; line-height: 1.7; }
.tc-celebration .tc-exit-hint { position: absolute; left: 0; right: 0; bottom: 30px; margin: 0; font-size: .8rem; color: #587264; }
.tc-celebration .tc-close { position: absolute; right: 28px; top: 24px; width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid #3f74622e; border-radius: 50%; background: #ffffff80; color: var(--tc-ink); font: 300 1.8rem/1 sans-serif; cursor: pointer; }
.tc-close:hover { background: #fff; }
.tc-close:focus-visible { outline: 2px solid var(--tc-leaf); outline-offset: 4px; }
@keyframes tc-reveal { from { opacity: 0; } to { opacity: 1; } }
@keyframes tc-sky { to { transform: translate(4%, 3%) rotate(6deg); } }
@keyframes tc-ring { 0%,100% { transform: scale(.92); opacity: .65; } 50% { transform: scale(1.07); opacity: 1; } }
@keyframes tc-arrive { 0% { opacity: 0; transform: translateY(-160px) scale(.5) rotate(-12deg); } 52% { opacity: 1; transform: translateY(12px) scale(1.07,.9) rotate(3deg); } 73% { transform: translateY(-15px) scale(.96,1.04) rotate(-2deg); } 100% { transform: none; } }
@keyframes tc-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-9px) scale(1.035,1.055); } }
@keyframes tc-leaves { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(4deg); } }
@keyframes tc-stretch-left { 0%,65%,100% { transform: rotate(0); } 15%,38% { transform: rotate(62deg); } }
@keyframes tc-stretch-right { 0%,65%,100% { transform: rotate(0); } 15%,38% { transform: rotate(-62deg); } }
@keyframes tc-wave { 0%,100% { transform: rotate(-40deg); } 25%,65% { transform: rotate(-85deg); } 45%,80% { transform: rotate(-56deg); } }
@keyframes tc-hop { 0%,35%,100% { transform: translateY(0) scale(1); } 10% { transform: translateY(-24px) rotate(-3deg); } 24% { transform: translateY(3px) scale(1.035,.96); } }
@keyframes tc-shadow { 0%,100% { transform: scale(1); opacity: .8; } 50% { transform: scale(.85); opacity: .55; } }
@keyframes tc-blink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(.12); } }
@keyframes tc-burst { 0% { opacity: 0; transform: translate(0,0) rotate(0) scale(.2); } 12% { opacity: .9; } 65% { opacity: .8; } 100% { opacity: 0; transform: translate(var(--x),var(--y)) rotate(var(--spin)) scale(.6); } }
@keyframes tc-float { from { transform: translateY(0) rotate(-15deg); opacity: .3; } to { transform: translateY(-22px) rotate(35deg); opacity: .7; } }
@keyframes tc-type-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (max-height: 650px) { .tc-stage { transform: scale(.8); margin-top: -35px; margin-bottom: -25px; } .tc-details { margin-top: 12px; } .tc-celebration .tc-exit-hint { bottom: 16px; } }
@media (max-width: 440px) { .tc-stage { width: 300px; margin-left: calc(50% - 150px); } .tc-arrival { margin-left: -20px; } .tc-celebration .tc-close { right: 16px; top: 16px; } }
@media (prefers-reduced-motion: reduce) {
  .tc-celebration, .tc-celebration::before, .tc-celebration *, .tc-celebration *::before, .tc-celebration *::after { animation: none !important; }
  .tc-burst, .tc-stars { display: none; }
}
`;

// 原创内联矢量角色，轮廓/高光/肢体独立分组，避免外部图片和动画运行库。
function tomatoMarkup(id) {
  return `<svg class="tc-character" viewBox="0 0 340 300" aria-hidden="true">
    <defs>
      <radialGradient id="${id}-skin" cx="34%" cy="25%" r="85%"><stop stop-color="#ff8063"/><stop offset=".55" stop-color="#ee503e"/><stop offset="1" stop-color="#c8372e"/></radialGradient>
      <linearGradient id="${id}-leaf" x2=".8" y2="1"><stop stop-color="#83ae64"/><stop offset="1" stop-color="#326a50"/></linearGradient>
    </defs>
    <g class="tc-figure">
      <g fill="none" stroke="#b74632" stroke-width="9" stroke-linecap="round">
        <path d="M142 239q-10 24-25 23"/><path d="M196 239q9 24 25 23"/>
      </g>
      <g class="tc-arm-left" fill="none" stroke="#3f7462" stroke-width="8" stroke-linecap="round">
        <path d="M103 172q-45 23-77-10"/><path d="m28 163-7-10m7 10-12-3"/>
      </g>
      <g class="tc-arm-right" fill="none" stroke="#3f7462" stroke-width="8" stroke-linecap="round">
        <path d="M238 172q45 23 77-10"/><path d="m313 163 7-10m-7 10 12-3"/>
      </g>
      <path d="M170 91c-28-17-72-6-86 31-23 61 4 123 63 129 15 2 20-2 23-2 5 0 14 5 27 2 55-8 86-67 61-128-16-38-59-49-88-32Z" fill="url(#${id}-skin)"/>
      <path d="M112 126q-18 22-17 43" fill="none" stroke="#ffc7a1" stroke-width="9" stroke-linecap="round" opacity=".7"/>
      <ellipse cx="127" cy="185" rx="16" ry="9" fill="#ffa088" opacity=".55"/>
      <ellipse cx="215" cy="185" rx="16" ry="9" fill="#ffa088" opacity=".55"/>
      <g class="tc-eyes-open" fill="#513a2d"><ellipse class="tc-eye" cx="143" cy="164" rx="5" ry="7"/><ellipse class="tc-eye" cx="197" cy="164" rx="5" ry="7"/></g>
      <g class="tc-eyes-rest" fill="none" stroke="#513a2d" stroke-width="4" stroke-linecap="round"><path d="M133 168q10-10 20 0"/><path d="M187 168q10-10 20 0"/></g>
      <path d="M158 185q12 15 24 0" fill="none" stroke="#513a2d" stroke-width="4" stroke-linecap="round"/>
      <g class="tc-crown" fill="url(#${id}-leaf)">
        <path d="M171 94q-29-46-53-40 8 27 42 42-46-9-60 9 30 15 66-2-12 25-2 34 19-14 20-35 31 19 58 4-18-21-51-13 32-24 26-43-33 5-46 44Z"/>
        <path d="M174 91q-9-25 5-39" fill="none" stroke="#3f7462" stroke-width="7" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}

function decorations() {
  const colors = ['#efbb55', '#72a282', '#ee8066', '#b1cabc'];
  const burst = Array.from({ length: 22 }, (_, i) => {
    const angle = i * Math.PI * 2 / 22;
    const distance = 180 + (i % 4) * 32;
    return `<i class="tc-confetti ${i % 3 === 0 ? 'is-leaf' : ''}" style="--x:${Math.round(Math.cos(angle) * distance)}px;--y:${Math.round(Math.sin(angle) * distance + 40)}px;--spin:${i * 57 - 420}deg;--delay:${.45 + (i % 5) * .035}s;--color:${colors[i % 4]}"></i>`;
  }).join('');
  const positions = [[16,18],[78,16],[8,47],[90,43],[22,77],[82,80],[37,9],[66,89],[7,82],[93,13]];
  const stars = positions.map(([x,y], i) => `<i class="tc-star ${i % 2 === 0 ? 'is-star' : ''}" style="left:${x}%;top:${y}%;--size:${i % 2 === 0 ? 14 : 6}px;--color:${colors[i % 4]};--duration:${4 + i % 4}s;--delay:${-(i % 5)}s"></i>`).join('');
  return { burst, stars };
}

function defaultWatchVisibility(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

let audioContext = null;
function defaultPlaySound(phase) {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return;
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new Ctor();
  } catch { return; }
  const context = audioContext;
  let cancelled = false;
  let compressor;
  let master;
  const voices = new Set();
  function releaseOutput() { master?.disconnect(); compressor?.disconnect(); }
  function cancel() {
    cancelled = true;
    for (const voice of voices) {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch { /* 已结束的节点无需再次停止 */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
    releaseOutput();
  }
  async function schedule() {
    if (context.state === 'suspended') await context.resume();
    if (cancelled || context.state !== 'running') return;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = .005;
    compressor.release.value = .16;
    master = context.createGain();
    master.gain.value = .8;
    compressor.connect(master).connect(context.destination);
    const startAt = context.currentTime + .05;
    CHIME_NOTES[phase].forEach((frequency, index) => {
      const when = startAt + index * .24;
      // 更响的基音加轻谐波形成钟声；每声柔和起落，声音整体只播一次。
      [[1, .38], [2, .12], [3, .04]].forEach(([harmonic, volume]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const voice = { oscillator, gain };
        voices.add(voice);
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency * harmonic;
        gain.gain.setValueAtTime(.0001, when);
        gain.gain.exponentialRampToValueAtTime(volume, when + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, when + .85 / harmonic);
        oscillator.connect(gain).connect(compressor);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect(); voices.delete(voice);
          if (voices.size === 0) releaseOutput();
        };
        oscillator.start(when);
        oscillator.stop(when + .9 / harmonic);
      });
    });
  }
  schedule().catch(cancel); // 自动播放被拒或设备失败不影响视觉提醒。
  return cancel;
}

let sequence = 0;
export function createCelebration(deps = {}) {
  const isVisible = deps.isVisible ?? (() => document.visibilityState === 'visible');
  const watchVisibility = deps.watchVisibility ?? defaultWatchVisibility;
  const getRemainingMs = deps.getRemainingMs ?? (() => 0);
  const playSound = deps.playSound ?? defaultPlaySound;
  let pending = null;
  let playing = false;
  let watching = false;
  let closeOverlay = null;
  let stopSound = null;

  function defaultShow({ phase, remainingMs, onClose }) {
    const id = `tc-celebration-${++sequence}`;
    const overlay = document.createElement('div');
    overlay.className = `tc-celebration is-${phase}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', PHRASES[phase]);
    overlay.setAttribute('tabindex', '-1');
    const { burst, stars } = decorations();
    const resting = phase === 'work-done';
    overlay.innerHTML = `<style>${STYLES}</style>
      <div class="tc-stars" aria-hidden="true">${stars}</div>
      <div class="tc-scene">
        <div class="tc-stage" aria-hidden="true">
          <div class="tc-halo"><div class="tc-orbit"></div></div>
          <div class="tc-shadow"></div>
          <div class="tc-burst">${burst}</div>
          <div class="tc-arrival">${tomatoMarkup(id)}</div>
        </div>
        <h2 class="tc-title">${PHRASES[phase]}</h2>
        <div class="tc-details">${resting
          ? `<p class="tc-clock-label">休息倒计时</p><div class="tc-clock">${formatClock(remainingMs)}</div>`
          : '<p class="tc-start-hint">点“开始”</p>'}</div>
      </div>
      <button class="tc-close" type="button" aria-label="关闭提醒">×</button>
      <p class="tc-exit-hint">点击任意处 · Esc 关闭</p>`;
    const previousFocus = document.activeElement;
    const clock = overlay.querySelector('.tc-clock');
    const closeButton = overlay.querySelector('.tc-close');
    let closed = false;
    const refresh = clock ? setInterval(() => { clock.textContent = formatClock(getRemainingMs()); }, 250) : null;
    function close() {
      if (closed) return;
      closed = true;
      if (refresh !== null) clearInterval(refresh);
      document.removeEventListener('keydown', onKeyDown);
      const hadFocus = overlay.contains(document.activeElement);
      overlay.remove();
      if (closeOverlay === close) closeOverlay = null;
      onClose();
      if (hadFocus && previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') { event.preventDefault(); closeButton.focus(); }
    }
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    closeOverlay = close;
    overlay.focus({ preventScroll: true });
  }

  // show 注入契约不变：实现方通过 onClose 汇报关闭；默认实现持有 DOM 清理动作。
  const show = deps.show ?? defaultShow;
  function handleShowClosed() {
    playing = false;
    if (typeof stopSound === 'function') stopSound();
    stopSound = null;
  }
  function perform(phase) {
    playing = true;
    show({ phase, remainingMs: getRemainingMs(), onClose: handleShowClosed });
    if (playing) {
      const stop = playSound(phase);
      if (typeof stop === 'function') stopSound = stop;
    }
  }
  function handleVisibilityChange() {
    if (pending === null || !isVisible()) return;
    const phase = pending;
    pending = null;
    perform(phase);
  }
  function play(phase) {
    if (!Object.hasOwn(PHRASES, phase)) throw new Error(`未知 phase：${String(phase)}`);
    if (playing) return;
    if (!watching) { watching = true; watchVisibility(handleVisibilityChange); }
    if (!isVisible()) { pending = phase; return; }
    pending = null;
    perform(phase);
  }
  function dismiss() {
    if (!playing) return;
    const close = closeOverlay;
    closeOverlay = null;
    if (close) close();
    else handleShowClosed();
  }
  return { play, dismiss };
}
