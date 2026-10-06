// TomatoClock UI 总装：只做组装与事件分发——读 DOM、把事件接到 timer/storage/notify/celebration。
// 计时/存储/通知/演出逻辑一律留在各自模块；进行中番茄不落盘、不注册 beforeunload（关页即作废）。
import { sanitizeSettings, effectiveDurations, createTimer } from './timer.js';
import { createStorage, dayKey } from './storage.js';
import { createNotifier } from './notify.js';
import { createCelebration } from './celebration.js';

// ---- Ruling #7 格式化 ----
// formatClock：MM:SS，秒向上取整（归零才显示 00:00）；分钟不进位到小时（180 分显示 180:00）
function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// formatDuration：<1h → `M 分` 或 `M 分 S 秒`（S=0 省略）；≥1h → `H 小时 M 分`；0 → `0 分`
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalSeconds < 3600) {
    return seconds === 0 ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
  }
  return `${Math.floor(totalSeconds / 3600)} 小时 ${minutes % 60} 分`;
}

// 页脚固定文案：今日 {N} 个番茄 · 累计 {duration}
function footerText(n, duration) {
  return `今日 ${n} 个番茄 · 累计 ${duration}`;
}

// ---- DOM 锚点 ----
const $ = (id) => document.getElementById(id);
const phaseLabelEl = $('phase-label');
const timeEl = $('time');
const roundDotsEl = $('round-dots');
const dotEls = Array.from(roundDotsEl.querySelectorAll('.dot'));
const workInput = $('work-input');
const shortAdjInput = $('short-adj-input');
const longAdjInput = $('long-adj-input');
const breakPreviewEl = $('break-preview');
const startBtn = $('start-btn');
const pauseBtn = $('pause-btn');
const resetBtn = $('reset-btn');
const todayCountEl = $('today-count');
const todayTimeEl = $('today-time');
const notifyHintEl = $('notify-hint');
const storageWarningEl = $('storage-warning');
const footerEl = document.querySelector('footer');

// ---- 模块组装 ----
const storage = createStorage();
const notifier = createNotifier();
const saved = storage.load(); // 启动读一次：settings 进 timer，今日桶进页脚
let settings = saved.settings;
const timer = createTimer({ settings });
const celebration = createCelebration({
  isVisible: () => document.visibilityState === 'visible',
  watchVisibility(onChange) {
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  },
  getRemainingMs: () => timer.remainingMs(),
});

// ---- 渲染 ----
function phaseText() {
  if (timer.state === 'break') return timer.segment === 'long-break' ? '长休' : '短休';
  return { ready: '准备开始', working: '专注中', paused: '已暂停' }[timer.state];
}

function renderNotifyHint() {
  // 被拒 / 不支持才显示；其余功能完全不受影响
  const status = notifier.permissionStatus();
  notifyHintEl.hidden = status !== 'denied' && status !== 'unsupported';
}

function renderFooter() {
  // N/duration 取当前自然日 dayKey(Date.now()) 对应的桶
  const day = storage.load().days[dayKey(Date.now())] ?? { pomodoros: 0, studySeconds: 0 };
  const duration = formatDuration(day.studySeconds * 1000);
  todayCountEl.textContent = String(day.pomodoros);
  todayTimeEl.textContent = duration;
  footerEl.setAttribute('aria-label', footerText(day.pomodoros, duration));
}

function render() {
  phaseLabelEl.textContent = phaseText();
  timeEl.textContent = formatClock(timer.remainingMs());

  const { shortBreakMs, longBreakMs } = effectiveDurations(settings);
  breakPreviewEl.textContent = `短休 ${formatDuration(shortBreakMs)} · 长休 ${formatDuration(longBreakMs)}`;

  const done = timer.completedInRound;
  dotEls.forEach((dot, index) => dot.classList.toggle('is-done', index < done));
  roundDotsEl.setAttribute('aria-label', `第 ${done}/4 轮`);

  startBtn.disabled = timer.state !== 'ready'; // 仅 ready 可点
  startBtn.textContent = done > 0 ? '开始下一个番茄' : '开始番茄';
  pauseBtn.disabled = timer.state !== 'working' && timer.state !== 'paused';
  pauseBtn.textContent = timer.state === 'paused' ? '恢复' : '暂停';

  const editable = timer.state === 'ready'; // 设置仅 READY 可编辑，每次渲染同步
  workInput.disabled = !editable;
  shortAdjInput.disabled = !editable;
  longAdjInput.disabled = !editable;

  renderNotifyHint();
}

// ---- 到点行为链（实时与补记同一路径）----
function handleEvents(events) {
  // work-done 通知里的短休/长休与时长，取同一次 tick 里随后的 break-started 事件
  const breakEvent = events.find((event) => event.type === 'break-started');
  for (const event of events) {
    if (event.type === 'work-done') {
      storage.recordPomodoro({ completedAt: event.completedAt, workMs: event.workMs });
      renderFooter();
      const kindLabel = breakEvent && breakEvent.kind === 'long' ? '长休' : '短休';
      const durationText = formatDuration(breakEvent ? breakEvent.durationMs : timer.remainingMs());
      notifier.notify({ title: '番茄完成 🍅', body: `该休息了：${kindLabel} ${durationText}。` });
      celebration.play('work-done');
    } else if (event.type === 'break-done') {
      notifier.notify({ title: '休息结束', body: '该开工了：点“开始下一个番茄”。' });
      celebration.play('break-done');
    }
  }
}

function tick() {
  const events = timer.tick();
  if (events.length > 0) handleEvents(events);
  render();
}

// ---- 事件接线 ----
startBtn.addEventListener('click', () => {
  // 权限在用户手势内请求；fire-and-forget（requestPermission 恒 resolve）
  notifier.requestPermission().then(renderNotifyHint);
  renderNotifyHint();
  timer.start();
  render();
});

pauseBtn.addEventListener('click', () => {
  if (timer.state === 'working') timer.pause();
  else if (timer.state === 'paused') timer.resume();
  render();
});

resetBtn.addEventListener('click', () => {
  timer.reset();
  render();
});

function onSettingsChange() {
  if (timer.state !== 'ready') return; // 非 ready 输入框本就 disabled，双保险
  const next = sanitizeSettings({
    workMin: workInput.value,
    shortAdj: shortAdjInput.value,
    longAdj: longAdjInput.value,
  });
  timer.setSettings(next);
  settings = storage.saveSettings(next); // 写入时机之二
  render(); // 重渲染预览与 #time（ready 态显示新工作时长）
}

workInput.addEventListener('change', onSettingsChange);
shortAdjInput.addEventListener('change', onSettingsChange);
longAdjInput.addEventListener('change', onSettingsChange);

// ---- 启动渲染 + tick 循环 ----
workInput.value = String(settings.workMin);
shortAdjInput.value = String(settings.shortAdj);
longAdjInput.value = String(settings.longAdj);
if (!storage.isPersistent) storageWarningEl.hidden = false;
render();
renderFooter();
setInterval(tick, 250);
document.addEventListener('visibilitychange', tick);
window.addEventListener('focus', tick);
