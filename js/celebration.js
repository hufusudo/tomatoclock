// Phase chimes: retained loud three-note Web Audio sound; no character, particles or visual overlay.
const CHIME_NOTES = {
  'work-done': [523.25, 659.25, 783.99],
  'break-done': [659.25, 783.99, 1046.5],
};

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


// Sound reminders only. The accordion/photo screen lives in rest-view.js.
export function createCelebration(deps={}) {
 const playSound=deps.playSound??defaultPlaySound;
 let active=null,stop=null;
 function silence(){if(typeof stop==='function')stop();stop=null;}
 function play(phase){
  if(!Object.hasOwn(CHIME_NOTES,phase))throw new Error(`未知 phase：${String(phase)}`);
  if(active===phase)return;
  // Sound is time-sensitive even while unfocused/minimized; only rest-view defers visuals.
  silence();active=phase;
  try{const cancel=playSound(phase);if(typeof cancel==='function')stop=cancel;}catch{ /* Audio failure never stops the timer or page transition. */ }
 }
 function dismiss(){active=null;silence();}
 return {play,dismiss};
}
