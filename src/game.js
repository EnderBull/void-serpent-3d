/* ============================================================================
   VOID SERPENT // 虚空蛇核
   A 3D neon snake roguelite with persistent incremental progression.
   Built with Three.js (r128) and a hand-written post-processing chain.
   ============================================================================ */
(function () {
'use strict';

/* ----------------------------------------------------------------------------
   0. Helpers
---------------------------------------------------------------------------- */
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (sec) => `${pad2(Math.floor(sec / 60))}:${pad2(Math.floor(sec % 60))}`;
const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const ARENA = 44;
const BOUND = 41.6;
const SEG_SPACING = 0.58;
const TRAIL_STEP = 0.27;
const MAX_BODY = 180;
const START_BODY = 23;

const QUALITY = {
  low:    { label: '低',   dpr: 1.0,  bloomDiv: 6,   blur: 1, particles: 700,  stars: 700,  labelEn: 'LOW' },
  medium: { label: '中',   dpr: 1.25, bloomDiv: 5,   blur: 2, particles: 1100, stars: 1100, labelEn: 'MED' },
  high:   { label: '高',   dpr: 1.55, bloomDiv: 4,   blur: 3, particles: 1600, stars: 1600, labelEn: 'HIGH' }
};

/* ----------------------------------------------------------------------------
   1. Persistence / meta-progression
---------------------------------------------------------------------------- */
const SAVE_KEY = 'void-serpent-save-v1';

const META_DEFS = [
  { id: 'thrust',   name: '推进器超频', en: 'THRUST OVERCLOCK',    icon: '⌁', base: 35,  growth: 1.58, max: 8,  accent: '#22f4ff',
    desc: (n) => `基础航速 +${n * 3}%` },
  { id: 'hull',     name: '装甲覆写',   en: 'HULL OVERRIDE',       icon: '▰', base: 45,  growth: 1.56, max: 8,  accent: '#55ffd1',
    desc: (n) => `最大完整性 +${n * 20}`, hint: '活得更久，才能叠得更狠' },
  { id: 'siphon',   name: '数据虹吸',   en: 'DATA SIPHON',         icon: '◈', base: 55,  growth: 1.62, max: 8,  accent: '#ffd15c',
    desc: (n) => `得分与数据获取 +${n * 6}%` },
  { id: 'compression', name: '相位压缩', en: 'PHASE COMPRESSION',   icon: '⧉', base: 65,  growth: 1.62, max: 8,  accent: '#8b5cff',
    desc: (n) => `技能冷却 -${n * 4}%` },
  { id: 'magnet',   name: '引力校准',   en: 'GRAVITY CALIBRATION', icon: '◎', base: 40,  growth: 1.52, max: 8,  accent: '#22f4ff',
    desc: (n) => `吞噬半径 +${(n * 0.9).toFixed(1)}` },
  { id: 'farm',     name: '数据农场',   en: 'DATA FARM',           icon: '∞', base: 50,  growth: 1.55, max: 10, accent: '#63ffb0',
    desc: (n) => `纳米尘 +${(n * 0.04).toFixed(2)} / 秒（含离线，上限 8h）` },
  { id: 'warmstart', name: '预热协议',  en: 'WARM START',          icon: '⟟', base: 120, growth: 1.8,  max: 3,  accent: '#ff35cc',
    desc: (n) => `初始护盾 +${n * 18} · 初始重掷 +${n}` },
  { id: 'revive',   name: '机魂备份',   en: 'SOUL BACKUP',         icon: '✦', base: 260, growth: 2.0,  max: 1,  accent: '#ffd15c',
    desc: (n) => n > 0 ? '每局自动重构 1 次' : '每局自动重构 1 次' },
  { id: 'luck',     name: '概率窃取',   en: 'PROBABILITY THEFT',   icon: '◇', base: 160, growth: 1.7,  max: 5,  accent: '#ff35cc',
    desc: (n) => `稀有/传说突变权重 +${n * 10}%` }
];

const CARD_POOL = [
  /* --- COMMON --- */
  { id: 'overclock', name: '超频线圈', en: 'OVERCLOCK COIL', icon: '⌁', rarity: 'common', max: 5,
    desc: (n) => `航速 <strong>+${n * 6}%</strong>，推进剂消耗 -${n * 5}%。` },
  { id: 'magnet', name: '引力奇点', en: 'SINGULARITY MAGNET', icon: '◎', rarity: 'common', max: 4,
    desc: (n) => `吞噬半径 <strong>+${(n * 0.9).toFixed(1)}</strong>，数据向你的胃袋坠落。` },
  { id: 'pulse', name: '湮灭扩容', en: 'ANNIHILATION CAPACITY', icon: '⊙', rarity: 'common', max: 4,
    desc: (n) => `脉冲半径 <strong>+${n * 22}%</strong>，脉冲伤害 +${n}。` },
  { id: 'shield', name: '量子护盾', en: 'QUANTUM SHIELD', icon: '⬡', rarity: 'common', max: 4,
    desc: (n) => `护盾上限 <strong>+${n * 26}</strong>，脱战自动回充。` },
  { id: 'vitality', name: '纳米修复', en: 'NANO REPAIR', icon: '✚', rarity: 'common', max: 4,
    desc: (n) => `每秒恢复 <strong>+${(n * 0.8).toFixed(1)}</strong> 完整性。` },
  { id: 'greed', name: '复利算法', en: 'COMPOUND INTEREST', icon: '∞', rarity: 'common', max: 5,
    desc: (n) => `得分 <strong>+${n * 18}%</strong>，数据获取 +${n * 8}%。` },
  { id: 'combo', name: '贪婪回路', en: 'GREED CIRCUIT', icon: '⟳', rarity: 'common', max: 4,
    desc: (n) => `连击上限 <strong>+${n * 30}</strong>，连击衰减速度 -${n * 10}%。` },
  { id: 'capacity', name: '矢量引擎', en: 'VECTOR ENGINE', icon: '⇥', rarity: 'common', max: 4,
    desc: (n) => `推进剂容量 <strong>+${n * 25}</strong>，加速推力 +${n * 10}%。` },

  /* --- RARE --- */
  { id: 'dashNova', name: '折跃余波', en: 'WARP AFTERMATH', icon: '⌁', rarity: 'rare', max: 3,
    desc: (n) => `相位折跃落点引爆冲击波，半径 +${n * 2}，伤害 +${n}。` },
  { id: 'compression', name: '相位压缩', en: 'PHASE COMPRESSION', icon: '⧉', rarity: 'rare', max: 4,
    desc: (n) => `所有技能冷却 <strong>-${n * 9}%</strong>。` },
  { id: 'chain', name: '连锁共振', en: 'CHAIN RESONANCE', icon: '⌇', rarity: 'rare', max: 4,
    desc: (n) => `每 ${Math.max(3, 7 - n)} 次吞噬，电弧轰击最多 ${2 + n} 个威胁。` },
  { id: 'drone', name: '轨道哨兵', en: 'ORBITAL SENTINEL', icon: '◈', rarity: 'rare', max: 3,
    desc: (n) => `增加 <strong>${n}</strong> 台自动索敌轨道无人机。` },
  { id: 'chrono', name: '时滞晶格', en: 'TIME LATTICE', icon: '◷', rarity: 'rare', max: 3,
    desc: (n) => `时间琥珀持续时间 <strong>+${n * 1.2}s</strong>，冷却额外 -8%。` },
  { id: 'berserk', name: '猎杀协议', en: 'PREDATOR PROTOCOL', icon: '⚔', rarity: 'rare', max: 4,
    desc: (n) => `全部伤害 <strong>+${n * 35}%</strong>。` },
  { id: 'entropy', name: '熵减引擎', en: 'ENTROPY ENGINE', icon: '⚡', rarity: 'rare', max: 4,
    desc: (n) => `超载充能 <strong>+${n * 25}%</strong>，超载持续 +${n}s。` },
  { id: 'growth', name: '噬星胃袋', en: 'STARVOROUS GUT', icon: '◉', rarity: 'rare', max: 4,
    desc: (n) => `吞噬成长 <strong>+${n * 20}%</strong>，每次吞噬回复 +${n}。` },
  { id: 'tail', name: '千兆鞭尾', en: 'GIGA-WHIP TAIL', icon: '〰', rarity: 'rare', max: 3,
    desc: (n) => `蛇身触碰会粉碎附近威胁；自噬伤害 <strong>-${n * 25}%</strong>。` },
  { id: 'nova', name: '破盾新星', en: 'SHIELD-BREAK NOVA', icon: '✸', rarity: 'rare', max: 3,
    desc: (n) => `护盾破碎时引爆新星，伤害 +${n}。` },
  { id: 'autoPulse', name: '自动脉冲', en: 'AUTO-PULSE', icon: '⊚', rarity: 'rare', max: 3,
    desc: (n) => `每 ${Math.max(7, 17 - n * 3)} 秒自动释放一次弱化湮灭脉冲。` },
  { id: 'lucky', name: '概率窃取', en: 'PROBABILITY THEFT', icon: '◇', rarity: 'rare', max: 3,
    desc: (n) => `后续稀有/传说突变权重 <strong>+${n * 15}%</strong>。` },

  /* --- LEGENDARY / CURSED --- */
  { id: 'singularity', name: '奇点引擎', en: 'SINGULARITY DRIVE', icon: '⟁', rarity: 'legendary', max: 2,
    desc: (n) => `超载期间全伤害 <strong>+${n * 80}%</strong>，航速 +${n * 25}%。` },
  { id: 'immortal', name: '濒死协议', en: 'DEATHLESS PROTOCOL', icon: '✦', rarity: 'legendary', max: 2,
    desc: (n) => `立即获得 <strong>${n}</strong> 次自动重构；重构时引发湮灭脉冲。` },
  { id: 'timeDebt', name: '时间债', en: 'TIME DEBT', icon: '⏣', rarity: 'legendary', max: 2,
    desc: (n) => `时间琥珀期间得分 <strong>×${(1 + n).toFixed(1)}</strong>，击杀必掉稀有数据。` },
  { id: 'glass', name: '玻璃大炮', en: 'GLASS CANNON', icon: '◬', rarity: 'cursed', max: 2,
    desc: (n) => `全伤害 <strong>+${n * 60}%</strong>，最大完整性 <em>-${n * 18}</em>。` }
];

const RARITY_NAME = {
  common: { cn: '常规', en: 'COMMON' },
  rare: { cn: '稀有', en: 'RARE' },
  legendary: { cn: '传说', en: 'LEGENDARY' },
  cursed: { cn: '诅咒', en: 'CURSED' }
};

const FOOD_DEFS = {
  common:   { label: '数据碎片', data: 1,  xp: 1, score: 14,  grow: 1.15, od: 7,  heal: 0, combo: 1 },
  rare:     { label: '加密核心', data: 4,  xp: 3, score: 72,  grow: 2.5,  od: 16, heal: 2, combo: 2 },
  elite:    { label: '奇点果',   data: 10, xp: 7, score: 230, grow: 4.8,  od: 32, heal: 6, combo: 4 },
  unstable: { label: '相位酵素', data: 2,  xp: 2, score: 42,  grow: 1.3,  od: 11, heal: 3, combo: 1 }
};

function baseSave() {
  return {
    version: 1,
    nanites: 60,
    meta: { thrust: 0, hull: 0, siphon: 0, compression: 0, magnet: 0, farm: 0, warmstart: 0, revive: 0, luck: 0 },
    stats: { bestScore: 0, bestLevel: 1, bestCombo: 0, runs: 0, totalData: 0, totalKills: 0, totalScore: 0 },
    settings: { quality: 'auto', sound: true },
    lastSeen: Date.now()
  };
}

function loadSave() {
  let data = {};
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (err) { console.warn('[VOID SERPENT] Save read failed:', err); }
  const def = baseSave();
  const merged = {
    ...def, ...data,
    nanites: Number.isFinite(data.nanites) ? data.nanites : def.nanites,
    meta: { ...def.meta, ...(data.meta || {}) },
    stats: { ...def.stats, ...(data.stats || {}) },
    settings: { ...def.settings, ...(data.settings || {}) }
  };
  for (const k of Object.keys(merged.meta)) merged.meta[k] = clamp(Number(merged.meta[k]) || 0, 0, 99);
  merged.nanites = Math.max(0, Number(merged.nanites) || 0);
  return merged;
}

const SAVE = loadSave();
let offlineGain = 0;
(function applyOfflineFarm() {
  const rate = (SAVE.meta.farm || 0) * 0.04;
  const elapsed = clamp((Date.now() - (SAVE.lastSeen || Date.now())) / 1000, 0, 8 * 3600);
  if (rate > 0 && elapsed > 30) {
    offlineGain = Math.floor(elapsed * rate);
    SAVE.nanites += offlineGain;
  }
  SAVE.lastSeen = Date.now();
})();

let saveDirty = false;
let lastSaveWrite = 0;
function persist(force) {
  const now = Date.now();
  if (!force && now - lastSaveWrite < 5000) { saveDirty = true; return; }
  SAVE.lastSeen = now;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); saveDirty = false; lastSaveWrite = now; }
  catch (err) { console.warn('[VOID SERPENT] Save write failed:', err); }
}
setInterval(() => { if (saveDirty) persist(true); }, 5000);
window.addEventListener('beforeunload', () => persist(true));

const metaRate = () => (SAVE.meta.farm || 0) * 0.04;
const metaCost = (def) => Math.floor(def.base * Math.pow(def.growth, SAVE.meta[def.id] || 0));

/* ----------------------------------------------------------------------------
   2. Audio engine — procedural dark synth + SFX
---------------------------------------------------------------------------- */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.delay = null;
    this.started = false;
    this.musicOn = SAVE.settings.sound !== false;
    this.intensity = 0.25;
    this.paused = false;
    this.step = 0;
    this.nextNote = 0;
    this.timer = null;
    this.noiseBuffer = null;
    this._lastPick = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 4;
      comp.attack.value = 0.005; comp.release.value = 0.24;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.musicOn ? 0.62 : 0;
      this.master.connect(comp); comp.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.36;
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.52;
      this.musicBus.connect(this.master); this.sfxBus.connect(this.master);

      this.delay = this.ctx.createDelay(1.2);
      this.delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain(); fb.gain.value = 0.3;
      const wet = this.ctx.createGain(); wet.gain.value = 0.23;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.musicBus);

      this.noiseBuffer = this.makeNoise(1.0);
      this.started = true;
      this.nextNote = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 90);
      this.schedule();
    } catch (err) { console.warn('[VOID SERPENT] Audio unavailable:', err); }
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  setSound(on) {
    this.musicOn = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.62 : 0, this.ctx.currentTime, 0.05);
  }

  setPaused(p) {
    this.paused = p;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(p ? 0.12 : 0.36, this.ctx.currentTime, 0.3);
  }

  schedule() {
    if (!this.started || !this.ctx || this.ctx.state !== 'running' || !this.musicOn) return;
    if (this.nextNote < this.ctx.currentTime - 0.5) this.nextNote = this.ctx.currentTime + 0.05;
    const ahead = this.ctx.currentTime + 0.25;
    while (this.nextNote < ahead) {
      this.playStep(this.nextNote);
      this.nextNote += 0.2;
      this.step = (this.step + 1) % 32;
    }
  }

  playStep(t) {
    const s = this.step;
    const intensity = this.intensity;
    const roots = [73.42, 73.42, 58.27, 87.31, 73.42, 65.41, 58.27, 73.42]; // D2, Bb1, F2...
    const chords = [
      [146.83, 174.61, 220.0], [146.83, 174.61, 220.0], [116.54, 146.83, 174.61], [174.61, 220.0, 261.63],
      [146.83, 174.61, 220.0], [130.81, 155.56, 196.0], [116.54, 146.83, 174.61], [146.83, 174.61, 220.0]
    ];
    const bar = Math.floor(s / 8) % 8;
    const root = roots[bar];

    // kick
    if (s % 8 === 0 || (s % 8 === 5 && intensity > 0.45)) {
      this.kick(t, s % 16 === 0 ? 0.38 : 0.22);
    }
    // hat / tick
    if (intensity > 0.2 && (s % 2 === 0 || intensity > 0.65)) {
      this.noiseHit(t, 6200, 0.012, 0.018 + intensity * 0.018);
    }
    // bass
    if (s % 2 === 0) {
      const f = root * (s % 8 === 6 ? 1.5 : 1);
      this.bass(t, f, 0.16, 0.075 + intensity * 0.03);
    }
    // pad chord every bar
    if (s % 8 === 0) {
      const chord = chords[bar];
      chord.forEach((f, i) => this.pad(t, f * 2, 1.9, 0.018 + intensity * 0.012, i));
    }
    // arp
    if (intensity > 0.3 && s % 2 === 1) {
      const notes = [0, 3, 7, 10, 12, 7, 3, 15];
      const f = root * 4 * Math.pow(2, notes[(s + bar) % notes.length] / 12);
      this.pluck(t, f, 0.18, 0.023 + intensity * 0.02);
    }
    // pulse accent
    if (s === 24) this.pad(t, root * 8, 0.7, 0.012, 0);
  }

  kick(t, gain) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.28);
  }

  bass(t, freq, dur, gain) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(280 + this.intensity * 320, t); f.Q.value = 5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.03);
  }

  pad(t, freq, dur, gain, idx) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter();
    o.type = idx % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = freq * (1 + (idx - 1) * 0.0017);
    f.type = 'lowpass'; f.frequency.value = 700 + this.intensity * 600; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.55);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  pluck(t, freq, dur, gain) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq * 2, t); f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseHit(t, freq, dur, gain) {
    if (!this.started || !this.ctx || !this.musicOn || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.01);
  }

  tone(freq, type, dur, gain, dest, slideTo, slideDur) {
    if (!this.started || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + (slideDur || dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.04, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  sweep(freqFrom, freqTo, dur, gain, filterType) {
    if (!this.started || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter(); f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freqFrom, t); f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = 1.4;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t); src.stop(t + dur + 0.02);
  }

  ui() { this.tone(920, 'triangle', 0.05, 0.018, null, 1180, 0.04); }

  pickup(combo, rare) {
    if (!this.started || !this.musicOn) return;
    const t = this.ctx.currentTime;
    if (t - this._lastPick < 0.035) return;
    this._lastPick = t;
    const base = rare ? 420 : 620;
    const f = base * Math.pow(2, Math.min(combo, 24) / 24) * (rare ? 1.45 : 1);
    this.tone(f, rare ? 'square' : 'sine', rare ? 0.24 : 0.11, rare ? 0.035 : 0.025, null, f * 1.9, 0.13);
    if (rare) {
      this.tone(f * 1.5, 'triangle', 0.3, 0.02, null, f * 2.5, 0.25);
      this.sweep(900, 4800, 0.25, 0.035);
    }
  }

  dash() {
    this.sweep(380, 6400, 0.26, 0.11);
    this.tone(160, 'sine', 0.26, 0.1, null, 46, 0.28);
    this.tone(760, 'triangle', 0.18, 0.035, null, 1680, 0.15);
  }

  pulse() {
    this.tone(95, 'sine', 0.6, 0.16, null, 28, 0.55);
    this.sweep(2200, 100, 0.55, 0.12, 'lowpass');
    this.tone(220, 'sawtooth', 0.3, 0.04, null, 70, 0.3);
  }

  chrono() {
    this.tone(880, 'sine', 0.9, 0.055, null, 180, 0.9);
    this.tone(440, 'triangle', 1.2, 0.035, null, 110, 1.1);
    this.sweep(4200, 260, 0.9, 0.025, 'bandpass');
  }

  hit() {
    if (!this.started || !this.ctx || !this.musicOn) return;
    this.tone(70, 'square', 0.28, 0.12, null, 32, 0.28);
    this.sweep(2800, 120, 0.32, 0.1, 'lowpass');
    this.noiseHit(this.ctx.currentTime, 1200, 0.18, 0.06);
  }

  levelup() {
    if (!this.started || !this.musicOn) return;
    const t = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.065);
      g.gain.exponentialRampToValueAtTime(0.045, t + i * 0.065 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.065 + 0.5);
      o.connect(g); g.connect(this.sfxBus); g.connect(this.delay);
      o.start(t + i * 0.065); o.stop(t + i * 0.065 + 0.55);
    });
  }

  overdrive() {
    if (!this.started || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(440, t + 0.8);
    f.type = 'lowpass'; f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f); f.connect(g); g.connect(this.sfxBus); g.connect(this.delay); o.start(t); o.stop(t + 1.2);
    this.sweep(200, 6000, 1.0, 0.06);
  }

  revive() {
    this.tone(110, 'sawtooth', 1.2, 0.07, null, 660, 1.0);
    this.tone(660, 'triangle', 0.9, 0.035, null, 1320, 0.8);
  }

  warning() {
    this.tone(148, 'square', 0.46, 0.04, null, 118, 0.4);
  }

  gameover() {
    if (!this.started) return;
    this.tone(220, 'sawtooth', 2.2, 0.08, null, 42, 2.0);
    this.tone(110, 'sine', 2.8, 0.07, null, 28, 2.5);
    this.sweep(1800, 80, 2.2, 0.05, 'lowpass');
  }
}

const audio = new AudioEngine();

/* ----------------------------------------------------------------------------
   3. Tiny helper particle systems
---------------------------------------------------------------------------- */
const GLOW_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,.92)');
  grad.addColorStop(0.3, 'rgba(255,255,255,.38)');
  grad.addColorStop(0.65, 'rgba(255,255,255,.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
})();

const ICE_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -50); g.stroke();
    g.beginPath(); g.moveTo(0, -24); g.lineTo(-10, -34); g.moveTo(0, -24); g.lineTo(10, -34); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
})();

const glowMaterialCache = new Map();
function glowMaterial(color, opacity) {
  const key = `${color}_${opacity.toFixed(2)}`;
  if (!glowMaterialCache.has(key)) {
    glowMaterialCache.set(key, new THREE.SpriteMaterial({
      map: GLOW_TEX, color: new THREE.Color(color), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    }));
  }
  return glowMaterialCache.get(key);
}

function makeSprite(color, scale, opacity) {
  const s = new THREE.Sprite(glowMaterial(color, opacity));
  s.scale.set(scale, scale, 1);
  return s;
}

const particleVertex = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (280.0 / max(0.2, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}`;

const particleFragment = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord.xy - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float glow = pow(core, 2.6);
  gl_FragColor = vec4(vColor * (0.8 + glow * 2.2), (core * 0.52 + glow * 0.75) * vAlpha);
}`;

class ParticleField {
  constructor(scene, maxCount) {
    this.max = maxCount;
    this.scene = scene;
    this.pos = new Float32Array(maxCount * 3);
    this.color = new Float32Array(maxCount * 3);
    this.size = new Float32Array(maxCount);
    this.alpha = new Float32Array(maxCount);
    this.vel = new Float32Array(maxCount * 3);
    this.life = new Float32Array(maxCount);
    this.maxLife = new Float32Array(maxCount);
    this.drag = new Float32Array(maxCount);
    this.grav = new Float32Array(maxCount);
    this.baseSize = new Float32Array(maxCount);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const mat = new THREE.ShaderMaterial({
      uniforms: {}, vertexShader: particleVertex, fragmentShader: particleFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    for (let i = 0; i < maxCount; i++) this.pos[i * 3 + 1] = -9999;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, drag, grav) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = color && color.isColor ? color : new THREE.Color(color || 0x55eeff);
    this.color[i * 3] = c.r; this.color[i * 3 + 1] = c.g; this.color[i * 3 + 2] = c.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = this.maxLife[i] = life;
    this.drag[i] = drag == null ? 1.8 : drag;
    this.grav[i] = grav || 0;
  }

  burst(pos, count, color, opts) {
    opts = opts || {};
    const c = color && color.isColor ? color : new THREE.Color(color || 0x55eeff);
    const speed = opts.speed || 8;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const b = Math.acos(rand(-1, 1));
      const s = speed * rand(0.2, 1.1);
      this.spawn(
        pos.x + rand(-0.3, 0.3), pos.y + rand(-0.3, 0.3), pos.z + rand(-0.3, 0.3),
        Math.sin(b) * Math.cos(a) * s + (opts.vx || 0),
        Math.cos(b) * s + (opts.vy || 0),
        Math.sin(b) * Math.sin(a) * s + (opts.vz || 0),
        c, opts.size ? opts.size * rand(0.55, 1.4) : rand(1.4, 4.2),
        opts.life ? opts.life * rand(0.55, 1.25) : rand(0.4, 1.1),
        opts.drag == null ? 2.4 : opts.drag, opts.grav || 0
      );
    }
  }

  update(dt) {
    const pos = this.pos, vel = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999; continue; }
      const k = 1 - Math.exp(-this.drag[i] * dt);
      vel[i * 3] -= vel[i * 3] * k;
      vel[i * 3 + 1] -= vel[i * 3 + 1] * k + this.grav[i] * dt;
      vel[i * 3 + 2] -= vel[i * 3 + 2] * k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = clamp(t * 1.5, 0, 1) * (0.45 + 0.55 * t);
      this.size[i] = this.baseSize[i] * (0.55 + 0.75 * t);
    }
    this.aPos.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }
}

class BodyAura {
  constructor(scene, maxCount) {
    this.max = maxCount;
    this.pos = new Float32Array(maxCount * 3);
    this.color = new Float32Array(maxCount * 3);
    this.size = new Float32Array(maxCount);
    this.alpha = new Float32Array(maxCount);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: {}, vertexShader: particleVertex, fragmentShader: particleFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.points.frustumCulled = false;
    for (let i = 0; i < maxCount; i++) this.pos[i * 3 + 1] = -9999;
    scene.add(this.points);
  }

  update(segments, time, overdrive, slow) {
    const step = 5;
    const count = Math.min(this.max, Math.ceil(segments.length / step));
    for (let n = 0; n < this.max; n++) {
      if (n >= count) { this.alpha[n] = 0; continue; }
      const seg = segments[Math.min(segments.length - 1, n * step)];
      const t = n / Math.max(1, count);
      this.pos[n * 3] = seg.x + Math.sin(time * 2.1 + n) * 0.08;
      this.pos[n * 3 + 1] = seg.y + Math.cos(time * 1.7 + n) * 0.08;
      this.pos[n * 3 + 2] = seg.z + Math.sin(time * 1.3 + n * 1.7) * 0.08;
      const c = new THREE.Color().setHSL(0.5 + t * 0.3 + (overdrive ? Math.sin(time * 3) * 0.04 : 0), 0.95, 0.62);
      this.color[n * 3] = c.r; this.color[n * 3 + 1] = c.g; this.color[n * 3 + 2] = c.b;
      this.size[n] = (2.3 + Math.sin(time * 4 + n * 0.9) * 0.8) * (overdrive ? 2.0 : (slow ? 1.35 : 1));
      this.alpha[n] = 0.07 + 0.10 * (0.5 + 0.5 * Math.sin(time * 3.2 + n));
    }
    this.aPos.needsUpdate = true; this.aColor.needsUpdate = true;
    this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
  }
}

/* ----------------------------------------------------------------------------
   4. Lightning bolts pool
---------------------------------------------------------------------------- */
class BoltPool {
  constructor(scene, max) {
    this.items = [];
    this.scene = scene;
    for (let i = 0; i < max; i++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(24 * 3 * 2);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x7ffcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, linewidth: 1
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.items.push({ line, geo, mat, life: 0, maxLife: 1, active: false });
    }
    this.cursor = 0;
  }

  strike(start, end, color, life, segments, jitter) {
    const item = this.items[this.cursor === this.items.length ? 0 : this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    const n = clamp(segments || 10, 2, 24);
    const pos = item.geo.attributes.position.array;
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.001) return;
    const rnd = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const point = new THREE.Vector3().copy(start).addScaledVector(dir, t);
      if (i > 0 && i < n - 1) {
        rnd.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar((jitter || 1.2) * Math.sin(t * Math.PI));
        point.add(rnd);
      }
      pos[i * 6] = point.x; pos[i * 6 + 1] = point.y; pos[i * 6 + 2] = point.z;
      const t2 = (i + 1) / (n - 1);
      const p2 = new THREE.Vector3().copy(start).addScaledVector(dir, Math.min(1, t2));
      if (i < n - 1) {
        if (i + 1 > 0 && i + 1 < n - 1) {
          rnd.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar((jitter || 1.2) * Math.sin(t2 * Math.PI));
          p2.add(rnd);
        }
        pos[i * 6 + 3] = p2.x; pos[i * 6 + 4] = p2.y; pos[i * 6 + 5] = p2.z;
      } else {
        pos[i * 6 + 3] = end.x; pos[i * 6 + 4] = end.y; pos[i * 6 + 5] = end.z;
      }
    }
    item.geo.attributes.position.needsUpdate = true;
    item.geo.setDrawRange(0, Math.max(2, n * 2 - 1));
    item.mat.color.set(color || 0x7ffcff);
    item.mat.opacity = 1;
    item.life = item.maxLife = life || 0.18;
    item.active = true;
    item.line.visible = true;
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life -= dt;
      item.mat.opacity = Math.max(0, item.life / item.maxLife);
      if (item.life <= 0) { item.active = false; item.line.visible = false; }
    }
  }
}

/* ----------------------------------------------------------------------------
   5. Post-processing pipeline: bright pass + separable bloom + grade
---------------------------------------------------------------------------- */
const FS_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BRIGHT_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float threshold;
uniform float softKnee;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(threshold, threshold + softKnee, l);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 direction;
void main() {
  vec2 off1 = direction * 1.0;
  vec2 off2 = direction * 2.5;
  vec2 off3 = direction * 4.6;
  vec3 col = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  col += texture2D(tDiffuse, vUv + off1).rgb * 0.1945945946;
  col += texture2D(tDiffuse, vUv - off1).rgb * 0.1945945946;
  col += texture2D(tDiffuse, vUv + off2).rgb * 0.1216216216;
  col += texture2D(tDiffuse, vUv - off2).rgb * 0.1216216216;
  col += texture2D(tDiffuse, vUv + off3).rgb * 0.0540540541;
  col += texture2D(tDiffuse, vUv - off3).rgb * 0.0540540541;
  gl_FragColor = vec4(col, 1.0);
}`;

const COMPOSITE_FRAG = `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloom;
uniform float uChroma;
uniform float uDamage;
uniform float uSlow;
uniform float uBoost;
uniform float uOverdrive;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uDeath;
uniform float uIntro;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec2 uv = vUv;
  vec2 center = uv - 0.5;
  float dist = length(center);
  float ca = uChroma * (0.0012 + dist * dist * 0.0045);
  ca += uBoost * 0.0016 * smoothstep(0.1, 0.65, dist);
  ca += uDamage * 0.003 * smoothstep(0.0, 0.55, dist);
  vec3 scene;
  scene.r = texture2D(tScene, uv + center * ca).r;
  scene.g = texture2D(tScene, uv).g;
  scene.b = texture2D(tScene, uv - center * ca).b;
  vec3 bloom = texture2D(tBloom, uv).rgb;
  float bloomTintMix = clamp(uOverdrive * 0.6 + uBoost * 0.15, 0.0, 0.8);
  vec3 bloomTint = mix(vec3(0.72, 0.95, 1.18), vec3(1.3, 0.62, 1.1), bloomTintMix);
  vec3 col = scene + bloom * uBloom * bloomTint;
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * vec3(0.58, 0.76, 1.15), uSlow * 0.48);
  float scan = 0.965 + 0.035 * sin(uv.y * uResolution.y * 1.25 + uTime * 2.2);
  col *= scan;
  float grain = hash(uv * uResolution.xy + fract(uTime) * 37.0) - 0.5;
  col += grain * 0.015;
  if (uBoost > 0.02) {
    float ang = atan(center.y, center.x);
    float streak = pow(max(0.0, sin(ang * 70.0 + uTime * 4.0)), 28.0);
    streak *= smoothstep(0.12, 0.75, dist);
    col += vec3(0.18, 0.58, 0.95) * streak * uBoost * 0.55;
  }
  float ring = smoothstep(0.5, 0.3, dist) * uOverdrive;
  col += mix(vec3(1.0, 0.15, 0.75), vec3(1.0, 0.62, 0.1), 0.5 + 0.5 * sin(uTime * 2.1)) * uOverdrive * 0.06;
  float damageEdge = smoothstep(0.1, 0.72, dist) * uDamage;
  col += vec3(0.9, 0.03, 0.12) * damageEdge * 0.8;
  float vig = smoothstep(0.92, 0.22, dist);
  col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));
  col = mix(col, vec3(0.02, 0.0, 0.035), uDeath * 0.5);
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  col += vec3(0.02, 0.05, 0.08) * (1.0 - smoothstep(0.0, 0.45, dist)) * uIntro;
  col = aces(col * 1.16);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash(uv * uResolution + uTime) - 0.5) * 0.014;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeo, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.params = { threshold: 0.78, softKnee: 0.24 };
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.78 }, softKnee: { value: 0.24 } },
      vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, direction: { value: new THREE.Vector2(1, 0) } },
      vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 }, uBloom: { value: 0.62 }, uChroma: { value: 0.55 },
        uDamage: { value: 0 }, uSlow: { value: 0 }, uBoost: { value: 0 },
        uOverdrive: { value: 0 }, uVignette: { value: 1.0 }, uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(0xaefcff) }, uDeath: { value: 0 }, uIntro: { value: 1 }
      },
      vertexShader: FS_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false
    });
    this.sceneRT = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: true });
    this.bloomA = new THREE.WebGLRenderTarget(8, 8, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false });
    this.bloomB = new THREE.WebGLRenderTarget(8, 8, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false });
    this.width = 1; this.height = 1;
    this.blurPasses = quality.blur;
    this.bloomDiv = quality.bloomDiv;
    this.drawingWidth = 1; this.drawingHeight = 1;
  }

  setSize(w, h, pr, quality) {
    this.width = w; this.height = h;
    this.blurPasses = quality.blur; this.bloomDiv = quality.bloomDiv;
    this.drawingWidth = Math.max(1, Math.floor(w * pr));
    this.drawingHeight = Math.max(1, Math.floor(h * pr));
    this.sceneRT.setSize(this.drawingWidth, this.drawingHeight);
    const bw = Math.max(1, Math.floor(this.drawingWidth / this.bloomDiv));
    const bh = Math.max(1, Math.floor(this.drawingHeight / this.bloomDiv));
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
    this.compMat.uniforms.uResolution.value.set(this.drawingWidth, this.drawingHeight);
  }

  render(scene, camera, fx) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000104, 1);
    r.clear();
    r.render(scene, camera);

    this.quad.material = this.brightMat;
    this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    r.setRenderTarget(this.bloomA);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.quad.material = this.blurMat;
    let read = this.bloomA;
    let write = this.bloomB;
    const bw = this.bloomA.width; const bh = this.bloomA.height;
    for (let i = 0; i < this.blurPasses; i++) {
      this.blurMat.uniforms.tDiffuse.value = read.texture;
      this.blurMat.uniforms.direction.value.set((1.4 + i * 0.55) / bw, 0);
      r.setRenderTarget(write);
      r.clear(); r.render(this.quadScene, this.quadCamera);
      const temp = read; read = write; write = temp;
      this.blurMat.uniforms.tDiffuse.value = read.texture;
      this.blurMat.uniforms.direction.value.set(0, (1.4 + i * 0.55) / bh);
      r.setRenderTarget(write);
      r.clear(); r.render(this.quadScene, this.quadCamera);
      const temp2 = read; read = write; write = temp2;
    }

    this.quad.material = this.compMat;
    const u = this.compMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = read.texture;
    u.uTime.value = fx.time;
    u.uBloom.value = fx.bloom;
    u.uChroma.value = fx.chroma;
    u.uDamage.value = fx.damage;
    u.uSlow.value = fx.slow;
    u.uBoost.value = fx.boost;
    u.uOverdrive.value = fx.overdrive;
    u.uVignette.value = 0.92;
    u.uFlash.value = fx.flash;
    u.uFlashColor.value.set(fx.flashColor || 0xaefcff);
    u.uDeath.value = fx.death;
    u.uIntro.value = fx.intro;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCamera);
  }
}

/* ----------------------------------------------------------------------------
   6. Main game
---------------------------------------------------------------------------- */
class VoidSerpent {
  constructor() {
    this.canvas = $('gl');
    this.mode = 'boot';
    this.fx = {
      time: 0, bloom: 0.9, chroma: 0.55, damage: 0, slow: 0, boost: 0,
      overdrive: 0, flash: 0, flashColor: 0xaefcff, death: 0, intro: 1
    };
    this.ui = this.cacheUI();
    this.player = {};
    this.run = {};
    this.skills = {};
    this.mods = {};
    this.foods = [];
    this.mines = [];
    this.hunters = [];
    this.projectiles = [];
    this.drones = [];
    this.qualityKey = SAVE.settings.quality || 'auto';
    try {
      const q = new URLSearchParams(window.location.search).get('quality');
      if (q && QUALITY[q]) this.qualityKey = q;
    } catch (err) { /* file URL fallback */ }
    this.quality = QUALITY.high;
    this.dpr = 1;
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.time = 0;
    this.last = performance.now();
    this.fpsAccum = 0; this.fpsFrames = 0; this.fps = 60;
    this.hudTimer = 0;
    this.economyTimer = 0;
    this.menuNano = 0;
    this.cardsShown = [];
    this.levelupCards = [];
    this.metaOrigin = 'title';
    this.pointerLocked = false;
    this.dragLook = false;
    this.lastDrag = null;
    this.keys = Object.create(null);
    this.audio = audio;
    this.mobile = isCoarse;
    this.raf = 0;

    this._initUI();
    this._initInput();
    this._initThree();
    this._buildWorld();
    this._titleIntro();
    this._loop = this._loop.bind(this);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._loop);
  }

  cacheUI() {
    const ids = [
      'hud', 'hp-text', 'hp-fill', 'shield-row', 'shield-text', 'shield-bar', 'shield-fill',
      'thrust-text', 'thrust-fill', 'run-time', 'revive-badge', 'coord-x', 'coord-y', 'coord-z',
      'heading-label', 'pitch-label', 'compass-track', 'level-text', 'xp-text', 'xp-fill',
      'pending-levels', 'score-text', 'hud-nano', 'threat-text', 'threat-pips', 'threat-desc',
      'combo-cluster', 'combo-text', 'combo-mult', 'combo-fill', 'combo-tip',
      'alt-text', 'alt-marker', 'pitch-marker', 'od-text', 'od-fill', 'od-bar', 'btn-overdrive',
      'speed-text', 'length-text', 'data-text', 'fps-text', 'threat-target', 'threat-dist',
      'event-feed', 'buffs', 'reticle', 'edge-warning', 'banner', 'banner-kicker', 'banner-title',
      'banner-desc', 'toasts', 'floaters', 'screen-flash', 'radar',
      'screen-title', 'btn-start', 'btn-meta-title', 'title-nano', 'title-rate', 'best-score-title',
      'run-count-title', 'total-nano-title', 'btn-quality-title', 'quality-label', 'btn-sound-title',
      'sound-label', 'offline-reward', 'offline-amount', 'screen-levelup', 'cards', 'btn-reroll',
      'reroll-count', 'lv-run-stats', 'screen-pause', 'pause-score', 'pause-level', 'pause-cards',
      'pause-build', 'btn-resume', 'btn-restart-pause', 'btn-quality-pause', 'quality-label-pause',
      'btn-sound-pause', 'sound-label-pause', 'btn-quit', 'screen-gameover', 'go-cause', 'go-score',
      'go-best', 'go-time', 'go-data', 'go-combo', 'go-kills', 'go-level', 'go-length',
      'go-build-list', 'go-nano', 'btn-retry', 'btn-meta-go', 'btn-title-go',
      'screen-meta', 'meta-nano', 'meta-rate', 'meta-grid', 'meta-best', 'meta-runs', 'meta-data',
      'meta-kills', 'btn-meta-back', 'btn-meta-start', 'btn-pause', 'btn-mute-hud',
      'btn-fullscreen', 'boot', 'boot-bar-fill', 'boot-status-text', 'mobile-warning',
      'cd-dash', 'cd-pulse', 'cd-chrono', 'cd-text-dash', 'cd-text-pulse', 'cd-text-chrono',
      'skill-lv-dash', 'skill-lv-pulse', 'skill-lv-chrono', 'hint-text'
    ];
    const o = {};
    ids.forEach((id) => { o[id] = $(id); });
    o.skills = Array.from(document.querySelectorAll('.skill'));
    o.metaDefs = META_DEFS;
    return o;
  }

  /* --------------------------------------------------------------------------
     UI wiring
  -------------------------------------------------------------------------- */
  _initUI() {
    const ui = this.ui;
    const click = (el, fn) => {
      if (!el) return;
      el.addEventListener('click', (e) => {
        audio.unlock();
        audio.ui();
        e.preventDefault();
        fn(e);
      });
    };
    click(ui['btn-start'], () => this.startRun());
    click(ui['btn-meta-title'], () => this.openMeta('title'));
    click(ui['btn-meta-back'], () => this.closeMeta());
    click(ui['btn-meta-start'], () => this.closeMeta(true));
    click(ui['btn-resume'], () => this.resume());
    click(ui['btn-restart-pause'], () => { this.hide(ui['screen-pause']); this.startRun(true); });
    click(ui['btn-quit'], () => this.quitToTitle());
    click(ui['btn-retry'], () => this.startRun(true));
    click(ui['btn-meta-go'], () => this.openMeta('gameover'));
    click(ui['btn-title-go'], () => this.quitToTitle());
    click(ui['btn-pause'], () => this.pause());
    click(ui['btn-mute-hud'], () => this.toggleSound());
    click(ui['btn-quality-title'], () => this.cycleQuality());
    click(ui['btn-quality-pause'], () => this.cycleQuality());
    click(ui['btn-sound-title'], () => this.toggleSound());
    click(ui['btn-sound-pause'], () => this.toggleSound());
    click(ui['btn-fullscreen'], () => this.toggleFullscreen());
    click(ui['btn-overdrive'], () => this.activateOverdrive());
    click(ui['btn-reroll'], () => this.rerollCards());
    ui.skills.forEach((el) => {
      click(el, () => this.useSkill(el.dataset.skill));
    });
    ui.cards.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.card');
      if (!cardEl) return;
      audio.unlock();
      audio.ui();
      this.chooseCard(Number(cardEl.dataset.index));
    });
    ui.cards.addEventListener('mouseover', (e) => {
      if (e.target.closest('.card') && this.mode === 'levelup') audio.ui();
    });
    ui.cards.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card')) {
        e.preventDefault();
        this.chooseCard(Number(e.target.closest('.card').dataset.index));
      }
    });

    if (SAVE.stats.runs === 0) {
      this.ui['total-nano-title'].textContent = fmt(SAVE.nanites);
    }
    this._updateSoundLabels();
    this._updateQualityLabels();
    this._renderMeta();
    this._updateTitleStats();

    if (offlineGain > 0) {
      ui['offline-amount'].textContent = `+${fmt(offlineGain)} NANITE`;
      ui['offline-reward'].classList.remove('hidden');
    }
    if (this.mobile) {
      ui['mobile-warning'].classList.remove('hidden');
      setTimeout(() => ui['mobile-warning'].classList.add('hidden'), 9000);
      this._initTouchControls();
    }
  }

  hide(el) { if (el) el.classList.add('hidden'); }
  show(el) { if (el) el.classList.remove('hidden'); }

  _initTouchControls() {
    const btn = document.createElement('button');
    btn.id = 'touch-boost'; btn.className = 'touch-boost hidden';
    btn.innerHTML = '<span>BOOST</span><b>⇧</b>';
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.keys.touchBoost = true; audio.unlock(); });
    btn.addEventListener('pointerup', () => { this.keys.touchBoost = false; });
    btn.addEventListener('pointercancel', () => { this.keys.touchBoost = false; });
    document.getElementById('ui').appendChild(btn);
    this.touchBoostBtn = btn;
  }

  _setTouchVisible(visible) {
    if (!this.touchBoostBtn) return;
    this.touchBoostBtn.classList.toggle('hidden', !visible);
    if (!visible) this.keys.touchBoost = false;
  }

  _updateSoundLabels() {
    const on = SAVE.settings.sound !== false;
    this.ui['sound-label'].textContent = on ? '开启' : '关闭';
    this.ui['sound-label-pause'].textContent = on ? '开启' : '关闭';
    this.ui['btn-mute-hud'].textContent = on ? '◉' : '○';
    this.ui['btn-mute-hud'].style.opacity = on ? '1' : '.45';
  }

  _updateQualityLabels() {
    const q = this.qualityKey;
    const text = q === 'auto' ? '自动' : QUALITY[q].label;
    this.ui['quality-label'].textContent = text;
    this.ui['quality-label-pause'].textContent = text;
  }

  toggleSound() {
    SAVE.settings.sound = SAVE.settings.sound === false;
    audio.setSound(SAVE.settings.sound);
    this._updateSoundLabels();
    this.persistSoon();
    if (SAVE.settings.sound) audio.ui();
  }

  persistSoon() { saveDirty = true; }

  cycleQuality() {
    const order = ['auto', 'high', 'medium', 'low'];
    const i = order.indexOf(this.qualityKey);
    this.qualityKey = order[(i + 1) % order.length];
    SAVE.settings.quality = this.qualityKey;
    this._applyQuality();
    this._updateQualityLabels();
    this.persistSoon();
    this.toast(`渲染质量：<b>${this.qualityKey === 'auto' ? '自动' : QUALITY[this.qualityKey].label}</b>`);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  _applyQuality() {
    let key = this.qualityKey;
    if (key === 'auto') {
      const rendererInfo = this.gl && this.gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(rendererInfo ? this.gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : '');
      const soft = /swiftshader|software|llvmpipe/i.test(name);
      const discrete = /nvidia|geforce|rtx|radeon|rx\s?\d|arc\s?a|apple m\d/i.test(name);
      if (soft) key = 'low';
      else if (discrete) key = 'high';
      else key = (navigator.hardwareConcurrency || 4) >= 8 ? 'medium' : 'low';
    }
    this.quality = QUALITY[key] || QUALITY.medium;
    this.qualityResolved = key;
    const budget = key === 'high' ? 2600000 : key === 'medium' ? 1750000 : 950000;
    const fit = Math.sqrt(budget / Math.max(1, this.width * this.height));
    this.dpr = clamp(Math.min(window.devicePixelRatio || 1, this.quality.dpr, Math.max(0.65, fit)), 0.6, this.quality.dpr);
    if (this.renderer) {
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.width, this.height, false);
    }
    if (this.post) this.post.setSize(this.width, this.height, this.dpr, this.quality);
    if (this.starPoints) this.starPoints.geometry.setDrawRange(0, this.quality.stars);
  }

  /* --------------------------------------------------------------------------
     Input
  -------------------------------------------------------------------------- */
  _initInput() {
    const canvas = this.canvas;
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.pointerLocked = locked;
      if (!locked && this.mode === 'playing' && this.hasLockedOnce) this.pause();
      if (locked) this.hasLockedOnce = true;
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
      if (this.mode === 'playing') this.toast('鼠标锁定不可用 · <b>拖动画面</b>转向');
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'playing') return;
      audio.unlock();
      if (!this.pointerLocked) {
        this.dragLook = true; this.lastDrag = { x: e.clientX, y: e.clientY };
        this._requestLock();
      }
    });
    window.addEventListener('mouseup', () => { this.dragLook = false; this.lastDrag = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', () => { this.touchLook = false; });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.mode === 'playing' && this.pointerLocked) this.pause();
    });
  }

  _requestLock() {
    if (this.mobile) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* drag fallback */ }
  }

  onKeyDown(e) {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
    this.keys[code] = true;
    if (this.mode === 'title') {
      if (code === 'Enter' || code === 'Space') { audio.unlock(); this.startRun(); }
      return;
    }
    if (this.mode === 'meta') {
      if (code === 'Escape') this.closeMeta();
      return;
    }
    if (this.mode === 'gameover') {
      if (code === 'Enter') this.startRun(true);
      if (code === 'Escape') this.openMeta('gameover');
      return;
    }
    if (this.mode === 'levelup') {
      if (/^Digit[1-3]$/.test(code)) {
        const idx = Number(code.slice(5)) - 1;
        if (this.levelupCards[idx]) { audio.unlock(); this.chooseCard(idx); }
      }
      if (code === 'KeyR') this.rerollCards();
      return;
    }
    if (this.mode === 'paused') {
      if (code === 'Escape') this.resume();
      return;
    }
    if (this.mode !== 'playing') return;
    if (code === 'Escape') { this.pause(); return; }
    if (code === 'KeyM') { this.toggleSound(); return; }
    if (code === 'Space') { this.useSkill('dash'); return; }
    if (code === 'KeyQ') { this.useSkill('pulse'); return; }
    if (code === 'KeyE') { this.useSkill('chrono'); return; }
    if (code === 'KeyR') { this.activateOverdrive(); return; }
  }

  onMouseMove(e) {
    if (this.mode !== 'playing') return;
    if (this.pointerLocked) {
      this.applyLook(e.movementX || 0, e.movementY || 0);
    } else if (this.dragLook && this.lastDrag) {
      const dx = e.clientX - this.lastDrag.x;
      const dy = e.clientY - this.lastDrag.y;
      this.lastDrag = { x: e.clientX, y: e.clientY };
      this.applyLook(dx, dy);
    }
  }

  applyLook(dx, dy) {
    const sens = 0.0021;
    this.player.desiredYaw -= dx * sens;
    this.player.desiredPitch = clamp(this.player.desiredPitch - dy * sens * 0.9, -1.16, 1.16);
  }

  onTouchStart(e) {
    if (this.mode !== 'playing' || !e.touches.length) return;
    e.preventDefault();
    this.touchLook = true;
    this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    audio.unlock();
  }

  onTouchMove(e) {
    if (!this.touchLook || this.mode !== 'playing' || !e.touches.length) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - this.lastTouch.x;
    const dy = t.clientY - this.lastTouch.y;
    this.lastTouch = { x: t.clientX, y: t.clientY };
    this.applyLook(dx * 1.35, dy * 1.35);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    if (!this.renderer) return;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this._applyQuality();
  }

  /* --------------------------------------------------------------------------
     Three.js setup
  -------------------------------------------------------------------------- */
  _initThree() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
        stencil: false, depth: true
      });
    } catch (err) {
      this.fatalWebGL(err);
      throw err;
    }
    this.gl = this.renderer.getContext();
    this.renderer.setClearColor(0x000104, 1);
    this.renderer.outputEncoding = THREE.LinearEncoding;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000104);
    this.camera = new THREE.PerspectiveCamera(74, this.width / this.height, 0.1, 900);
    this.camera.position.set(0, 18, 60);
    this.camera.lookAt(0, 0, 0);
    this._applyQuality();
    this.post = new PostFX(this.renderer, this.quality);
    this.post.setSize(this.width, this.height, this.dpr, this.quality);
    this._initWorldMaterials();
  }

  fatalWebGL(err) {
    const el = $('webgl-error');
    if (el) el.classList.remove('hidden');
    console.error('[VOID SERPENT] WebGL init failed', err);
  }

  /* --------------------------------------------------------------------------
     Master loop
  -------------------------------------------------------------------------- */
  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.fpsAccum += dt; this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0; this.fpsFrames = 0;
    }
    this.fx.time = this.time;
    this.update(dt);
    this.render();
    this.updateHud(dt);
    this.ui['fps-text'].textContent = this.fps;
  }

  update(dt) {
    this.updateAmbient(dt);
    switch (this.mode) {
      case 'title': this.updateDemo(dt); break;
      case 'playing': this.updateGame(dt); break;
      case 'paused': this.updatePausedVisuals(dt); break;
      case 'levelup': this.updatePausedVisuals(dt); break;
      case 'gameover': this.updateGameoverVisuals(dt); break;
      case 'meta': this.updatePausedVisuals(dt); break;
    }
    this.updatePostFx(dt);
  }

  render() {
    this.post.render(this.scene, this.camera, this.fx);
  }

  /* --------------------------------------------------------------------------
     World materials & geometry
  -------------------------------------------------------------------------- */
  _initWorldMaterials() {
    this.uTime = { value: 0 };
    this.uWallAlert = { value: 0 };
    this.materials = {};
    this.geoms = {};
    this.dynamicMats = [];
    const time = this.uTime;

    const crystalVert = `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vP = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    const crystalFrag = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
        float band = 0.88 + 0.12 * sin(vP.y * 9.0 + uTime * 3.2);
        vec3 col = uColor * (0.55 + fres * 1.55) * band;
        col += mix(uColor, vec3(1.0), 0.45) * pow(fres, 4.0) * 0.32;
        gl_FragColor = vec4(col * uIntensity, uOpacity);
      }`;

    this.makeCrystalMat = (color, intensity, opacity, add) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: time,
          uIntensity: { value: intensity == null ? 1 : intensity },
          uOpacity: { value: opacity == null ? 1 : opacity }
        },
        vertexShader: crystalVert, fragmentShader: crystalFrag,
        transparent: !!add || opacity < 1, depthWrite: add ? false : (opacity >= 1),
        side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.dynamicMats.push(mat);
      return mat;
    };

    this.materials.head = this.makeCrystalMat(0x3bffff, 1.35, 1, false);
    this.materials.foodCore = {
      common: this.makeCrystalMat(0x20f6ff, 1.2, 1, false),
      rare: this.makeCrystalMat(0xffd15c, 1.25, 1, false),
      elite: this.makeCrystalMat(0xff43d8, 1.35, 1, false),
      unstable: this.makeCrystalMat(0x6bffb1, 1.25, 1, false)
    };
    this.materials.foodWire = {
      common: new THREE.MeshBasicMaterial({ color: 0x88ffff, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      rare: new THREE.MeshBasicMaterial({ color: 0xffe7a2, wireframe: true, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
      elite: new THREE.MeshBasicMaterial({ color: 0xffa7ef, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      unstable: new THREE.MeshBasicMaterial({ color: 0xa8ffd0, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    };
    this.foodColor = {
      common: 0x24f5ff, rare: 0xffd15c, elite: 0xff35cc, unstable: 0x63ffb0
    };
    this.materials.mine = this.makeCrystalMat(0xff3c5e, 0.9, 1, false);
    this.materials.mineWire = new THREE.MeshBasicMaterial({ color: 0xff607d, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    this.materials.hunter = this.makeCrystalMat(0xff643c, 1.05, 1, false);
    this.materials.hunterWire = new THREE.MeshBasicMaterial({ color: 0xffb08c, wireframe: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
    this.materials.drone = this.makeCrystalMat(0x86f6ff, 1.25, 1, false);
    this.materials.projectile = new THREE.MeshBasicMaterial({ color: 0xffd06c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    this.materials.debris = this.makeCrystalMat(0x496a9c, 0.5, 0.65, true);

    this.geoms.octa = new THREE.OctahedronGeometry(0.55, 1);
    this.geoms.icoSmall = new THREE.IcosahedronGeometry(0.55, 1);
    this.geoms.ico = new THREE.IcosahedronGeometry(1.0, 2);
    this.geoms.dodeca = new THREE.DodecahedronGeometry(0.72, 0);
    this.geoms.tetra = new THREE.TetrahedronGeometry(0.72, 0);
    this.geoms.octaSmall = new THREE.OctahedronGeometry(0.2, 0);
    this.geoms.projectile = new THREE.IcosahedronGeometry(0.22, 0);
    this.geoms.ring = new THREE.RingGeometry(0.8, 0.86, 56);
    this.geoms.torus = new THREE.TorusGeometry(0.82, 0.014, 4, 64);
    this.geoms.torusBig = new THREE.TorusGeometry(1.3, 0.022, 5, 80);

    // Body shader — the snake is one instanced draw call.
    const bodyVert = `
      attribute vec3 aColor;
      attribute float aPulse;
      varying vec3 vColor;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      varying float vPulse;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        mat3 im = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
        vN = normalize(mat3(modelMatrix) * im * normal);
        vV = normalize(cameraPosition - world.xyz);
        vP = position;
        vColor = aColor;
        vPulse = aPulse;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    const bodyFrag = `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uActive;
      varying vec3 vColor;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      varying float vPulse;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 2.0);
        float pulse = 0.86 + 0.14 * sin(uTime * 6.2 - vPulse * 18.0);
        float facets = smoothstep(0.2, 0.9, abs(vP.x) + abs(vP.y));
        vec3 col = vColor * (0.55 + fres * 2.3) * pulse;
        col += vec3(0.42, 0.86, 1.0) * pow(fres, 4.0) * (0.62 + uActive * 1.15);
        col += vColor * facets * 0.12;
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`;
    this.materials.body = new THREE.ShaderMaterial({
      uniforms: {
        uTime: time,
        uIntensity: { value: 1.1 },
        uActive: { value: 0 }
      },
      vertexShader: bodyVert, fragmentShader: bodyFrag
    });

    // Arena walls
    const wallVert = `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    const wallFrag = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uAlert;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 uv = vUv;
        vec2 g = abs(fract(uv * 16.0) - 0.5);
        float lineW = fwidth(uv.x * 16.0) * 1.4;
        float grid = max(smoothstep(0.5 - lineW, 0.5, g.x), smoothstep(0.5 - lineW, 0.5, g.y));
        vec2 g2 = abs(fract(uv * 64.0) - 0.5);
        float fine = max(smoothstep(0.5 - fwidth(uv.x * 64.0), 0.5, g2.x), smoothstep(0.5 - fwidth(uv.y * 64.0), 0.5, g2.y));
        float d = distance(uv, vec2(0.5));
        float sweep = fract(uTime * 0.035);
        float ring = smoothstep(0.035, 0.0, abs(d - sweep * 0.85)) * 0.7;
        float pulse = 0.55 + 0.45 * sin(uTime * 0.8 + vWorld.y * 0.06);
        vec3 col = uColor * (grid * 0.24 + fine * 0.035 + ring * 0.55 + 0.012) * pulse;
        col += vec3(1.0, 0.08, 0.16) * uAlert * (grid * 0.55 + 0.1);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }`;
    this.makeWallMat = (color, opacity) => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: time, uOpacity: { value: opacity }, uAlert: this.uWallAlert
      },
      vertexShader: wallVert, fragmentShader: wallFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      extensions: { derivatives: true }
    });
    this.materials.wallCyan = this.makeWallMat(0x2fd7ff, 0.24);
    this.materials.wallMagenta = this.makeWallMat(0xff3bd0, 0.18);

    // Star field
    const starVert = `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vTw;
      uniform float uTime;
      void main() {
        vColor = aColor;
        float tw = 0.68 + 0.32 * sin(uTime * 0.62 + aPhase * 9.0);
        vTw = 0.55 + 0.45 * tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * tw * (520.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`;
    const starFrag = `
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * (1.4 + vTw * 1.8), glow * vTw);
      }`;
    this.materials.stars = new THREE.ShaderMaterial({
      uniforms: { uTime: time }, vertexShader: starVert, fragmentShader: starFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    // Dust motes
    const dustVert = `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vColor = aColor;
        vec3 p = position;
        p.x += sin(uTime * 0.12 + aPhase * 7.0) * 1.4;
        p.y += sin(uTime * 0.17 + aPhase * 4.0) * 1.1;
        p.z += cos(uTime * 0.1 + aPhase * 5.0) * 1.3;
        vAlpha = 0.25 + 0.35 * (0.5 + 0.5 * sin(uTime * 0.8 + aPhase * 8.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (250.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`;
    const dustFrag = `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float g = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * 1.3, g * vAlpha);
      }`;
    this.materials.dust = new THREE.ShaderMaterial({
      uniforms: { uTime: time }, vertexShader: dustVert, fragmentShader: dustFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    // Shield shell / aura shader
    const shellVert = `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vP = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    const shellFrag = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uPattern;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
        float hex = smoothstep(0.42, 0.5, max(abs(fract(vP.x * 3.0 + vP.z * 2.0) - 0.5), abs(fract(vP.y * 3.0) - 0.5)));
        float pulse = 0.62 + 0.38 * sin(uTime * 3.4 + vP.y * 3.0);
        vec3 col = uColor * (fres * 1.9 + hex * 0.12 + 0.025) * pulse;
        gl_FragColor = vec4(col, (fres * 0.8 + hex * uPattern * 0.08) * uOpacity);
      }`;
    this.makeShellMat = (color, opacity, pattern) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: time, uOpacity: { value: opacity }, uPattern: { value: pattern || 0 } },
      vertexShader: shellVert, fragmentShader: shellFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    this.materials.shield = this.makeShellMat(0x68c4ff, 0.82, 1);
    this.materials.overdrive = this.makeShellMat(0xffd15c, 0.75, 0.6);
    this.materials.headAura = this.makeShellMat(0x22f4ff, 0.2, 0.2);

    // planet shader
    const planetVert = `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        vP = position;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    const planetFrag = `
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float bands = 0.5 + 0.5 * sin(vP.y * 0.14 + sin(vP.x * 0.08) * 2.0);
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
        vec3 deep = vec3(0.002, 0.006, 0.016);
        vec3 mid = vec3(0.009, 0.034, 0.052);
        vec3 col = mix(deep, mid, bands * 0.65);
        col += vec3(0.12, 0.48, 0.74) * rim * 0.34;
        col += vec3(0.42, 0.06, 0.58) * pow(max(0.0, dot(normalize(vN), normalize(vec3(-0.5, 0.2, 0.8)))), 5.0) * 0.16;
        gl_FragColor = vec4(col, 1.0);
      }`;
    this.materials.planet = new THREE.ShaderMaterial({
      uniforms: { uTime: time }, vertexShader: planetVert, fragmentShader: planetFrag
    });
  }

  /* --------------------------------------------------------------------------
     Scene construction
  -------------------------------------------------------------------------- */
  _buildWorld() {
    this.scene.add(this.camera);
    this.world = new THREE.Group();
    this.background = new THREE.Group();
    this.arenaGroup = new THREE.Group();
    this.entityGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.scene.add(this.background, this.arenaGroup, this.entityGroup, this.fxGroup);
    this._buildArena();
    this._buildBackground();
    this._buildPlayer();
    this._buildFoodPools();
    this._buildHazardPools();
    this._buildProjectiles();
    this._buildDrones();
    this._buildEffectPools();
    this.particles = new ParticleField(this.fxGroup, this.quality.particles);
    this.bolts = new BoltPool(this.fxGroup, 10);
    this.bodyAura = new BodyAura(this.fxGroup, 36);
    this._initRunData();
    this._seedDemoWorld();
    this.scene.add(new THREE.AmbientLight(0x335577, 0.55));
    const coreLight = new THREE.PointLight(0x1de5ff, 1.9, 100, 2);
    coreLight.position.set(0, 0, 0);
    this.scene.add(coreLight);
    this.arenaCoreLight = coreLight;
  }

  _buildArena() {
    const g = this.arenaGroup;
    const size = ARENA * 2;
    const wallGeo = new THREE.PlaneGeometry(size, size);
    const walls = [];
    const mats = [this.materials.wallCyan, this.materials.wallMagenta];
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(wallGeo, mats[i % 2]);
      mesh.renderOrder = 1;
      if (i === 0) { mesh.position.set(0, 0, ARENA); }
      else if (i === 1) { mesh.position.set(0, 0, -ARENA); mesh.rotation.y = Math.PI; }
      else if (i === 2) { mesh.position.set(ARENA, 0, 0); mesh.rotation.y = -Math.PI / 2; }
      else if (i === 3) { mesh.position.set(-ARENA, 0, 0); mesh.rotation.y = Math.PI / 2; }
      else if (i === 4) { mesh.position.set(0, ARENA, 0); mesh.rotation.x = Math.PI / 2; }
      else { mesh.position.set(0, -ARENA, 0); mesh.rotation.x = -Math.PI / 2; }
      g.add(mesh); walls.push(mesh);
    }
    this.arenaWalls = walls;

    // Edge lattice
    const edgePoints = [];
    const e = ARENA;
    const corners = [
      [-e,-e,-e],[ e,-e,-e],[ e, e,-e],[-e, e,-e],
      [-e,-e, e],[ e,-e, e],[ e, e, e],[-e, e, e]
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    for (const edge of edges) { edgePoints.push(...corners[edge[0]], ...corners[edge[1]]); }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePoints, 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x53eaff, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending });
    this.arenaEdges = new THREE.LineSegments(edgeGeo, edgeMat);
    g.add(this.arenaEdges);

    // Floor grid
    const floorGrid = new THREE.GridHelper(size, 24, 0x2ab5d6, 0x17445b);
    floorGrid.position.y = -ARENA + 0.05;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.16;
    floorGrid.material.depthWrite = false;
    g.add(floorGrid);
    this.floorGrid = floorGrid;

    const ceilGrid = new THREE.GridHelper(size, 16, 0xff3bd0, 0x34163f);
    ceilGrid.position.y = ARENA - 0.05;
    ceilGrid.material.transparent = true;
    ceilGrid.material.opacity = 0.04;
    ceilGrid.material.depthWrite = false;
    g.add(ceilGrid);

    // Nav rings on the floor
    const ringMat = new THREE.LineBasicMaterial({ color: 0x24d8ff, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending });
    const ringMat2 = new THREE.LineBasicMaterial({ color: 0xff39cf, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending });
    this.floorRings = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const pts = [];
      const r = 10 + i * 10;
      for (let j = 0; j <= 96; j++) {
        const a = j / 96 * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, i === 1 ? ringMat2 : ringMat);
      line.position.y = -ARENA + 0.09;
      this.floorRings.add(line);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const pts = [new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5), new THREE.Vector3(Math.cos(a) * 39, 0, Math.sin(a) * 39)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), i % 3 === 0 ? ringMat2 : ringMat);
      line.position.y = -ARENA + 0.08;
      this.floorRings.add(line);
    }
    g.add(this.floorRings);

    // Decorative orbital rings in the middle of the arena
    this.orbitRings = new THREE.Group();
    const torusGeom = new THREE.TorusGeometry(29, 0.045, 5, 220);
    const mat1 = new THREE.MeshBasicMaterial({ color: 0x1fd4ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    const mat2 = new THREE.MeshBasicMaterial({ color: 0xff38ca, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const r1 = new THREE.Mesh(torusGeom, mat1); r1.rotation.x = Math.PI / 2; this.orbitRings.add(r1);
    const r2 = new THREE.Mesh(torusGeom, mat2); r2.rotation.y = Math.PI / 2.6; r2.rotation.x = 0.7; this.orbitRings.add(r2);
    const r3 = new THREE.Mesh(new THREE.TorusGeometry(18, 0.035, 4, 160), mat1); r3.rotation.z = 0.9; r3.rotation.y = 0.4; this.orbitRings.add(r3);
    g.add(this.orbitRings);

    // Axis glyphs
    const axisGroup = new THREE.Group();
    const axes = [
      { dir: new THREE.Vector3(1,0,0), color: 0xff5d7d, label: 'X', pos: new THREE.Vector3(17, -1.2, 0) },
      { dir: new THREE.Vector3(0,1,0), color: 0x73ffc4, label: 'Y', pos: new THREE.Vector3(0, 17, 0) },
      { dir: new THREE.Vector3(0,0,1), color: 0x8da3ff, label: 'Z', pos: new THREE.Vector3(0, -1.2, 17) }
    ];
    for (const ax of axes) {
      const pts = [new THREE.Vector3(0,0,0), ax.dir.clone().multiplyScalar(14)];
      const lineMat = new THREE.LineBasicMaterial({ color: ax.color, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending });
      axisGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      const label = makeLabelSprite(ax.label, ax.color, 2.1);
      label.position.copy(ax.pos);
      axisGroup.add(label);
    }
    this.axisGroup = axisGroup;
    g.add(axisGroup);

    for (let i = 0; i < 8; i++) {
      const c = corners[i];
      const s = makeSprite(i % 2 ? 0xff35cc : 0x24f4ff, 3.8, 0.34);
      s.position.set(c[0], c[1], c[2]);
      g.add(s);
    }

    // Distant dark asteroids outside the field. They read as silhouettes,
    // never as white blobs competing with the data cores.
    this.debris = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const geo = i % 3 === 0 ? this.geoms.tetra : (i % 3 === 1 ? this.geoms.octa : this.geoms.dodeca);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x06111b, transparent: true, opacity: 0.72, depthWrite: false
      }));
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({
        color: i % 2 ? 0x1b5b70 : 0x493064, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      const pivot = new THREE.Group();
      pivot.add(mesh, wire);
      const side = Math.random() < 0.5 ? -1 : 1;
      pivot.position.set(rand(-100, 100), rand(-65, 65), side * rand(90, 150));
      pivot.scale.setScalar(rand(2.0, 5.5));
      pivot.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      pivot.userData.spin = new THREE.Vector3(rand(-0.08, .08), rand(-.1, .1), rand(-.08, .08));
      this.debris.add(pivot);
    }
    this.scene.add(this.debris);
  }

  _buildBackground() {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const palette = [0x8ffcff, 0xffffff, 0x9bb4ff, 0xff81e2, 0xffd76d];
    for (let i = 0; i < count; i++) {
      const r = rand(120, 540);
      const theta = rand(0, TAU);
      const phi = Math.acos(rand(-1, 1));
      positions[i*3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i*3+1] = Math.cos(phi) * r;
      positions[i*3+2] = Math.sin(phi) * Math.sin(theta) * r;
      const c = new THREE.Color(pick(palette));
      const b = rand(0.45, 1.25);
      colors[i*3] = c.r * b; colors[i*3+1] = c.g * b; colors[i*3+2] = c.b * b;
      sizes[i] = rand(0.35, 1.8) * (Math.random() < 0.06 ? 2.7 : 1);
      phases[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.starPoints = new THREE.Points(geo, this.materials.stars);
    this.starPoints.frustumCulled = false;
    this.starPoints.geometry.setDrawRange(0, this.quality.stars);
    this.background.add(this.starPoints);

    const dc = 380;
    const dp = new Float32Array(dc * 3);
    const dcol = new Float32Array(dc * 3);
    const dsz = new Float32Array(dc);
    const dph = new Float32Array(dc);
    for (let i = 0; i < dc; i++) {
      dp[i*3] = rand(-ARENA, ARENA);
      dp[i*3+1] = rand(-ARENA, ARENA);
      dp[i*3+2] = rand(-ARENA, ARENA);
      const c = new THREE.Color(pick([0x35e7ff, 0x8f7bff, 0xff4fd2, 0xa8fff4]));
      dcol[i*3] = c.r; dcol[i*3+1] = c.g; dcol[i*3+2] = c.b;
      dsz[i] = rand(0.4, 1.6);
      dph[i] = Math.random();
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dgeo.setAttribute('aColor', new THREE.BufferAttribute(dcol, 3));
    dgeo.setAttribute('aSize', new THREE.BufferAttribute(dsz, 1));
    dgeo.setAttribute('aPhase', new THREE.BufferAttribute(dph, 1));
    this.dustPoints = new THREE.Points(dgeo, this.materials.dust);
    this.dustPoints.frustumCulled = false;
    this.background.add(this.dustPoints);

    // Nebula clouds
    const nebTex = makeNebulaTexture();
    const nebulaColors = [0x273cff, 0x9b1dbb, 0x097a9e, 0x5f2bce];
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.SpriteMaterial({
        map: nebTex, color: nebulaColors[i % nebulaColors.length], transparent: true,
        opacity: rand(0.025, 0.065), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
      });
      const s = new THREE.Sprite(mat);
      const r = rand(210, 360);
      const a = rand(0, TAU);
      s.position.set(Math.cos(a) * r, rand(-120, 130), Math.sin(a) * r);
      const sc = rand(140, 280);
      s.scale.set(sc, sc * rand(0.6, 1), 1);
      this.background.add(s);
    }

    // Majestic distant planet + orbital ring
    this.planet = new THREE.Group();
    const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(46, 48, 32), this.materials.planet);
    planetMesh.position.set(-155, -66, -235);
    planetMesh.rotation.z = 0.36;
    this.planet.add(planetMesh);
    const planetRing = new THREE.Mesh(
      new THREE.TorusGeometry(72, 0.55, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0xff41cf, transparent: true, opacity: 0.19, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    planetRing.position.copy(planetMesh.position);
    planetRing.rotation.set(1.17, 0.2, 0.35);
    this.planet.add(planetRing);
    const planetGlow = makeSprite(0x217bff, 130, 0.035);
    planetGlow.position.copy(planetMesh.position).add(new THREE.Vector3(12, 16, 4));
    this.background.add(this.planet, planetGlow);

    const arcPts = [];
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * TAU;
      arcPts.push(new THREE.Vector3(Math.cos(a) * 195, Math.sin(a) * 80 - 40, Math.sin(a * 0.5) * 60 - 220));
    }
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0x3269aa, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending }));
    this.background.add(arc);
  }

  _buildPlayer() {
    const group = new THREE.Group();
    const head = new THREE.Group();
    group.add(head);

    const core = new THREE.Mesh(this.geoms.ico, this.materials.head);
    core.scale.set(0.98, 0.78, 1.55);
    head.add(core);

    const edgeGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1));
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xd9ffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
    edge.scale.set(1.0, 0.8, 1.58);
    head.add(edge);

    const finMat = new THREE.MeshBasicMaterial({ color: 0xff42ce, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const finGeo = new THREE.ConeGeometry(0.28, 1.8, 3);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(side * 0.72, -0.06, -0.42);
      fin.rotation.x = Math.PI / 2;
      fin.rotation.z = side * 0.32;
      head.add(fin);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xa8feff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.5;
    head.add(nose);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf5ffff });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 8), eyeMat);
      eye.position.set(side * 0.38, 0.22, 0.78);
      head.add(eye);
      const eyeGlow = makeSprite(0x8ffcff, 0.85, 0.95);
      eyeGlow.position.copy(eye.position);
      head.add(eyeGlow);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.04, 0.028, 5, 72), new THREE.MeshBasicMaterial({ color: 0x68fbff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    ring.position.z = -0.1;
    head.add(ring);

    const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 2), this.materials.headAura);
    head.add(aura);

    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, 2), this.materials.shield);
    shield.visible = false;
    head.add(shield);

    const halo = makeSprite(0x29eaff, 7.4, 0.17);
    head.add(halo);

    const overdrive = new THREE.Group();
    overdrive.visible = false;
    const odRingGeo = new THREE.TorusGeometry(2.1, 0.026, 4, 80);
    const odMat = new THREE.MeshBasicMaterial({ color: 0xffd15c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 2; i++) {
      const t = new THREE.Mesh(odRingGeo, odMat);
      t.rotation.set(i === 0 ? Math.PI / 2 : 0.6, i === 0 ? 0 : 1.1, 0);
      overdrive.add(t);
    }
    head.add(overdrive);

    const light = new THREE.PointLight(0x24f4ff, 2.0, 32, 2);
    group.add(light);

    group.visible = false;
    this.entityGroup.add(group);
    this.player.group = group;
    this.player.head = head;
    this.player.core = core;
    this.player.ring = ring;
    this.player.aura = aura;
    this.player.shieldMesh = shield;
    this.player.halo = halo;
    this.player.overdriveMesh = overdrive;
    this.player.light = light;

    // Body instanced mesh
    const bodyGeo = this.geoms.icoSmall;
    const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BODY * 3), 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const pulseAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BODY), 1);
    pulseAttr.setUsage(THREE.DynamicDrawUsage);
    bodyGeo.setAttribute('aColor', colorAttr);
    bodyGeo.setAttribute('aPulse', pulseAttr);
    const body = new THREE.InstancedMesh(bodyGeo, this.materials.body, MAX_BODY);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.count = 0;
    body.frustumCulled = false;
    this.entityGroup.add(body);
    this.player.body = body;
    this.player.bodyColors = colorAttr;
    this.player.bodyPulse = pulseAttr;
    this.player.dummy = new THREE.Object3D();
    this.player.segments = [];
    this.player.trail = [];
    this.player.dir = new THREE.Vector3(0, 0, -1);
    this.player.lastDir = new THREE.Vector3(0, 0, -1);

    // A bright spine through the body
    const spineGeo = new THREE.BufferGeometry();
    const spinePos = new Float32Array(MAX_BODY * 3);
    const spineCol = new Float32Array(MAX_BODY * 3);
    spineGeo.setAttribute('position', new THREE.BufferAttribute(spinePos, 3).setUsage(THREE.DynamicDrawUsage));
    spineGeo.setAttribute('color', new THREE.BufferAttribute(spineCol, 3).setUsage(THREE.DynamicDrawUsage));
    spineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const spine = new THREE.Line(spineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending }));
    spine.frustumCulled = false;
    this.entityGroup.add(spine);
    this.player.spine = spine;
    this.player.spinePos = spinePos;
    this.player.spineCol = spineCol;
  }

  _buildFoodPools() {
    this.foodVisuals = { common: [], rare: [], elite: [], unstable: [] };
    const specs = {
      common: { geo: this.geoms.octa, count: 24, scale: 1.22, ring: 1.7, glow: 3.6, rings: 1 },
      rare: { geo: this.geoms.ico, count: 10, scale: 1.12, ring: 1.95, glow: 4.8, rings: 2 },
      elite: { geo: this.geoms.dodeca, count: 5, scale: 1.26, ring: 2.2, glow: 6.2, rings: 3 },
      unstable: { geo: this.geoms.tetra, count: 5, scale: 1.16, ring: 1.8, glow: 4.1, rings: 1 }
    };
    for (const type of Object.keys(specs)) {
      const spec = specs[type];
      for (let i = 0; i < spec.count; i++) {
        const group = new THREE.Group();
        const core = new THREE.Mesh(spec.geo, this.materials.foodCore[type]);
        core.scale.setScalar(spec.scale);
        group.add(core);
        const wire = new THREE.Mesh(spec.geo, this.materials.foodWire[type]);
        wire.scale.setScalar(spec.scale * 1.28);
        group.add(wire);
        const rings = [];
        for (let r = 0; r < spec.rings; r++) {
          const rg = new THREE.Mesh(this.geoms.torus, new THREE.MeshBasicMaterial({
            color: this.foodColor[type], transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
          }));
          rg.scale.setScalar(spec.ring * (1 + r * 0.28));
          rg.rotation.x = Math.PI / 2 + r * 0.7;
          rg.rotation.y = r * 0.9;
          group.add(rg); rings.push(rg);
        }
        const glow = makeSprite(this.foodColor[type], spec.glow, 0.16);
        group.add(glow);
        group.visible = false;
        this.entityGroup.add(group);
        this.foodVisuals[type].push({ group, core, wire, rings, glow, inUse: false, type, baseScale: spec.scale });
      }
    }
    this.foods = [];
    this._buildFoodBeams();
  }

  _buildFoodBeams() {
    this.foodBeamMax = 52;
    const pos = new Float32Array(this.foodBeamMax * 2 * 3);
    const col = new Float32Array(this.foodBeamMax * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    const beams = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.72,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    beams.frustumCulled = false;
    this.entityGroup.add(beams);
    this.foodBeams = beams;
    this.foodBeamPos = pos;
    this.foodBeamCol = col;
  }

  _buildHazardPools() {
    this.minePool = [];
    for (let i = 0; i < 18; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 1), this.materials.mine);
      group.add(core);
      const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), this.materials.mineWire);
      group.add(wire);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.018, 4, 60), new THREE.MeshBasicMaterial({ color: 0xff4a67, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      const glow = makeSprite(0xff2d54, 5.8, 0.24);
      group.add(glow);
      group.visible = false;
      this.entityGroup.add(group);
      this.minePool.push({ group, core, wire, ring, glow, inUse: false, data: null });
    }
    this.mines = [];

    this.hunterPool = [];
    const hGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const hArmGeo = new THREE.BoxGeometry(0.16, 0.16, 2.5);
    for (let i = 0; i < 7; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(hGeo, this.materials.hunter);
      group.add(core);
      const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), this.materials.hunterWire);
      group.add(cage);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.035, 4, 80), new THREE.MeshBasicMaterial({ color: 0xff795c, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.035, 4, 80), new THREE.MeshBasicMaterial({ color: 0xff4a9c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
      ring2.rotation.set(1.1, 0.5, 0);
      group.add(ring2);
      const armMat = new THREE.MeshBasicMaterial({ color: 0xffb08c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
      for (let a = 0; a < 3; a++) {
        const arm = new THREE.Mesh(hArmGeo, armMat);
        arm.rotation.y = a / 3 * Math.PI;
        arm.position.y = 0.9;
        group.add(arm);
      }
      const glow = makeSprite(0xff5a3c, 8.6, 0.25);
      group.add(glow);
      const laserGeo = new THREE.BufferGeometry();
      laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xff4c64, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      laser.frustumCulled = false;
      group.add(laser);
      group.visible = false;
      this.entityGroup.add(group);
      this.hunterPool.push({ group, core, cage, ring, ring2, glow, laser, inUse: false, data: null });
    }
    this.hunters = [];
  }

  _buildProjectiles() {
    this.projectilePool = [];
    for (let i = 0; i < 36; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(this.geoms.projectile, this.materials.projectile);
      group.add(core);
      const glow = makeSprite(0xffc35c, 2.3, 0.72);
      group.add(glow);
      group.visible = false;
      this.entityGroup.add(group);
      this.projectilePool.push({ group, core, glow, inUse: false, data: null });
    }
    this.projectiles = [];
  }

  _buildDrones() {
    this.dronePool = [];
    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.materials.drone);
      group.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.02, 4, 40), new THREE.MeshBasicMaterial({ color: 0x84f5ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      const glow = makeSprite(0x4de7ff, 2.8, 0.5);
      group.add(glow);
      group.visible = false;
      this.entityGroup.add(group);
      this.dronePool.push({ group, core, ring, glow, inUse: false, angle: 0, fireCd: rand(0.5, 2), target: null });
    }
    this.drones = [];
  }

  _buildEffectPools() {
    this.ringFx = [];
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xaefcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.geoms.ring, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.fxGroup.add(mesh);
      this.ringFx.push({ mesh, mat, life: 0, maxLife: 1, active: false, startScale: 1, endScale: 8 });
    }
    this.ringFxCursor = 0;

    this.shockFx = [];
    for (let i = 0; i < 8; i++) {
      const mat = this.makeShellMat(0x9df9ff, 0.0, 0.5);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
      mesh.visible = false;
      this.fxGroup.add(mesh);
      this.shockFx.push({ mesh, mat, life: 0, maxLife: 1, active: false, maxScale: 1 });
    }
    this.shockCursor = 0;
  }

  _initRunData() {
    this.player.pos = new THREE.Vector3(0, 5, 24);
    this.player.yaw = 0;
    this.player.pitch = -0.06;
    this.player.desiredYaw = 0;
    this.player.desiredPitch = -0.06;
    this.player.speed = 20;
    this.player.targetSpeed = 20;
    this.player.thrust = 100;
    this.player.maxThrust = 100;
    this.player.hp = 100;
    this.player.maxHp = 100;
    this.player.shield = 0;
    this.player.maxShield = 0;
    this.player.invuln = 0;
    this.player.selfHitCd = 0;
    this.player.bodyLen = START_BODY * SEG_SPACING;
    this.player.targetBodyLen = this.player.bodyLen;
    this.player.shieldRegenDelay = 0;
    this.player.regenDelay = 0;
    this.player.bank = 0;
    this.player.segments = [];
    this.player.trail = [];
    this.player.deathTime = 0;
    this.run = {
      active: false, score: 0, data: 0, level: 1, xp: 0, xpNeed: 6, pendingLevels: 0,
      combo: 0, maxCombo: 0, comboTimer: 0, comboTimerMax: 4.2, kills: 0, time: 0,
      threat: 1, threatTimer: 0, overdrive: 0, odActive: false, odTimer: 0,
      rerolls: 1, revives: 0, cards: {}, acquired: [], foodEaten: 0, chainCounter: 0,
      slowTimer: 0, autoPulseTimer: 10, cause: '', deathHandled: false,
      nextStorm: 35, nextElite: 55, spawnCd: 0, mineCd: 2, hunterCd: 25,
      hitStop: 0, lastHitSource: '', startTime: 0, stormIndex: 0, launchGrace: 0
    };
    this.skills = {
      dash: { cd: 0, cdMax: 4.8, key: 'SPACE' },
      pulse: { cd: 0, cdMax: 9.5, key: 'Q' },
      chrono: { cd: 0, cdMax: 16, key: 'E' }
    };
    this.mods = {};
    this.growPulse = 0;
    this.cameraIntro = 0;
    this.cameraShake = 0;
    this.cameraBank = 0;
    this.targetYawVis = 0;
    this.edgeWarn = 0;
    this.overdriveReadyAnnounced = false;
    this.perfSlow = 0;
    this.autoPulseCounter = 0;
  }

  _seedDemoWorld() {
    this._clearEntities();
    if (this.run) {
      this.run.odActive = false;
      this.run.slowTimer = 0;
      this.run.overdrive = 0;
    }
    this.boostActive = false;
    const types = ['common','common','common','rare','common','common','elite','rare','unstable','common','common','rare','common','common','common'];
    for (let i = 0; i < types.length; i++) {
      const a = i / types.length * TAU;
      const r = rand(9, 30);
      this._spawnFoodVisual(types[i], new THREE.Vector3(Math.cos(a) * r, rand(-13, 15), Math.sin(a) * r), true);
    }
    this.player.pos.set(0, 4, 20);
    this.player.yaw = 0;
    this.player.pitch = -0.03;
    this.player.dir.set(0, 0, -1);
    this.player.trail = [];
    for (let i = 0; i < 160; i++) {
      this.player.trail.push(new THREE.Vector3(0, 4 + Math.sin(i * 0.1) * 0.5, 20 + i * 0.18));
    }
    this.player.bodyLen = 16;
    this.player.targetBodyLen = 16;
    this.player.segments = [];
    this.player.group.visible = true;
    this.player.head.visible = true;
    this.player.overdriveMesh.visible = false;
    this.player.shieldMesh.visible = false;
    if (this.bodyAura) this.bodyAura.points.visible = true;
    this._updateBody(0, true);
    this.player.group.position.copy(this.player.pos);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.player.dir);
    this.player.group.quaternion.copy(q);
  }

  _spawnFoodVisual(type, pos, register) {
    const pool = this.foodVisuals[type];
    if (!pool) return null;
    const vis = pool.find((v) => !v.inUse);
    if (!vis) return null;
    vis.inUse = true;
    vis.group.visible = true;
    vis.group.position.copy(pos);
    vis.group.scale.setScalar(1);
    vis.group.rotation.set(rand(0, TAU), Math.random() * TAU, rand(0, TAU));
    const obj = {
      type, group: vis.group, vis, pos: vis.group.position, anchor: new THREE.Vector3().copy(pos), baseY: pos.y,
      spin: Math.random() * TAU, phase: Math.random() * TAU, alive: true, pulling: false, spawnT: 0,
      magnetized: false
    };
    if (register !== false) this.foods.push(obj);
    return obj;
  }

  _clearEntities() {
    for (const list of Object.values(this.foodVisuals || {})) {
      for (const v of list) { v.inUse = false; v.group.visible = false; }
    }
    this.foods = [];
    for (const p of this.minePool || []) { p.inUse = false; p.group.visible = false; }
    for (const p of this.hunterPool || []) { p.inUse = false; p.group.visible = false; p.data = null; }
    for (const p of this.projectilePool || []) { p.inUse = false; p.group.visible = false; p.data = null; }
    for (const d of this.dronePool || []) { d.inUse = false; d.group.visible = false; }
    this.mines = []; this.hunters = []; this.projectiles = []; this.drones = [];
    for (const r of this.ringFx || []) { r.active = false; r.mesh.visible = false; }
    for (const s of this.shockFx || []) { s.active = false; s.mesh.visible = false; }
    if (this.bolts) this.bolts.items.forEach((b) => { b.active = false; b.line.visible = false; });
    if (this.player && this.player.body) this.player.body.count = 0;
    if (this.player && this.player.spine) this.player.spine.visible = false;
  }

  /* --------------------------------------------------------------------------
     Ambient, title demo & perframe visuals
  -------------------------------------------------------------------------- */
  updateAmbient(dt) {
    this.uTime.value = this.time;
    if (this.starPoints) this.starPoints.rotation.y += dt * 0.0025;
    if (this.dustPoints) this.dustPoints.rotation.y += dt * 0.004;
    if (this.debris) {
      for (const m of this.debris.children) {
        m.rotation.x += m.userData.spin.x * dt;
        m.rotation.y += m.userData.spin.y * dt;
        m.rotation.z += m.userData.spin.z * dt;
      }
    }
    if (this.orbitRings) {
      this.orbitRings.children[0].rotation.z += dt * 0.03;
      this.orbitRings.children[1].rotation.z -= dt * 0.02;
      this.orbitRings.children[2].rotation.x += dt * 0.04;
    }
    if (this.floorRings) this.floorRings.rotation.y += dt * 0.006;
    if (this.planet) this.planet.rotation.y += dt * 0.003;
    this.uWallAlert.value = Math.max(0, this.uWallAlert.value - dt * 1.7);
    this.updateTitleNano();
    if (this.mode === 'title' || this.mode === 'meta') this.tickMenuEconomy(dt);
  }

  updateTitleNano() {
    if (!this.ui) return;
    if (this.mode === 'title' || this.mode === 'boot') {
      this.ui['title-nano'].textContent = String(Math.floor(SAVE.nanites)).padStart(4, '0');
      this.ui['title-rate'].textContent = `数据农场 +${metaRate().toFixed(2)}/s`;
      this.ui['hud-nano'].textContent = fmt(SAVE.nanites);
    }
  }

  tickMenuEconomy(dt) {
    const rate = metaRate();
    if (rate <= 0) return;
    this.economyTimer += dt;
    SAVE.nanites += rate * dt;
    if (this.economyTimer > 4) {
      this.economyTimer = 0;
      this.persistSoon();
      this.refreshNanoUI();
    }
  }

  refreshNanoUI() {
    if (!this.ui) return;
    const n = Math.floor(SAVE.nanites);
    this.ui['title-nano'].textContent = String(n).padStart(4, '0');
    this.ui['hud-nano'].textContent = fmt(n);
    this.ui['meta-nano'].textContent = String(n).padStart(4, '0');
    this.ui['meta-rate'].textContent = `+${metaRate().toFixed(2)} / SEC · 数据农场`;
    this.ui['total-nano-title'].textContent = fmt(n);
    this._refreshMetaButtons();
  }

  _refreshMetaButtons() {
    if (!this.ui || !this.ui['meta-grid']) return;
    const buttons = this.ui['meta-grid'].querySelectorAll('[data-meta]');
    for (const btn of buttons) {
      const def = META_DEFS.find((d) => d.id === btn.dataset.meta);
      if (!def) continue;
      const maxed = (SAVE.meta[def.id] || 0) >= def.max;
      if (maxed) continue;
      const afford = SAVE.nanites >= metaCost(def);
      btn.disabled = !afford;
      btn.textContent = afford ? '升级' : '不足';
    }
  }

  updateDemo(dt) {
    const t = this.time;
    const prev = this.player.pos.clone();
    const px = 7 + Math.sin(t * 0.19) * 17;
    const py = Math.sin(t * 0.27 + 1.1) * 9 + 3;
    const pz = -2 + Math.cos(t * 0.16) * 16;
    this.player.pos.lerp(new THREE.Vector3(px, py, pz), 1 - Math.exp(-2.6 * dt));
    const dir = new THREE.Vector3().subVectors(this.player.pos, prev);
    if (dir.lengthSq() > 0.0001) this.player.dir.lerp(dir.normalize(), 0.18).normalize();
    this.player.trail.unshift(this.player.pos.clone());
    if (this.player.trail.length > 300) this.player.trail.pop();
    this.player.targetBodyLen = 15 + Math.sin(t * 0.33) * 2;
    this.player.bodyLen = this.player.targetBodyLen;
    this.player.group.visible = true;
    this.player.group.position.copy(this.player.pos);
    this.player.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.player.dir);
    this.player.ring.rotation.z += dt * 0.9;
    this.player.aura.rotation.y += dt * 0.2;
    this._updateBody(dt, true);
    this.updateFoodVisuals(dt * 0.45);
    this.particles.update(dt * 0.55);
    this.bodyAura.update(this.player.segments, this.time, false, false);
    this.demoFxTimer = (this.demoFxTimer == null ? 2.0 : this.demoFxTimer) - dt;
    if (this.demoFxTimer <= 0) {
      this.demoFxTimer = rand(3.2, 5.0);
      const color = pick([0x22f4ff, 0xff35cc, 0x8b5cff]);
      this.spawnRing(this.player.pos, color, 1.2, 17, 1.2);
      this.particles.burst(this.player.pos, 24, color, { speed: 8, size: 2.3, life: 1.1, drag: 1.5 });
      if (this.foods.length) {
        const f = pick(this.foods);
        if (f && f.alive) this.bolts.strike(this.player.pos.clone(), f.anchor.clone(), color, 0.3, 10, 1.3);
      }
    }
    this.updateEffects(dt);
    this.bolts.update(dt);
    if (Math.random() < dt * 14) {
      const p = this.player.pos.clone().add(new THREE.Vector3(rand(-.4,.4), rand(-.4,.4), rand(-.4,.4)));
      this.particles.spawn(p.x, p.y, p.z, rand(-1,1), rand(-.5,1.2), rand(-1,1), pick([0x2af4ff,0xff44d2,0x8b6aff]), rand(0.8, 2.6), rand(0.5, 1.3), 1.5, 0);
    }
    const camA = 0.55 + Math.sin(t * 0.045) * 0.22;
    const camRad = 48 + Math.sin(t * 0.11) * 4;
    const desired = new THREE.Vector3(Math.cos(camA) * camRad, 16.5 + Math.sin(t * 0.16) * 4, Math.sin(camA) * camRad);
    this.camera.position.lerp(desired, 1 - Math.exp(-1.5 * dt));
    this.camera.lookAt(new THREE.Vector3(0, 2, 0));
    this.camera.fov = damp(this.camera.fov, 63, 1.2, dt);
    this.camera.updateProjectionMatrix();
    this.player.core.rotation.y += dt * 0.15;
  }

  updatePausedVisuals(dt) {
    this.particles.update(dt * 0.25);
    this.bolts.update(dt * 0.25);
    this.updateFoodVisuals(dt * 0.15);
    if (this.player && this.player.group.visible) {
      this.player.ring.rotation.z += dt * 0.2;
      this.player.aura.rotation.y += dt * 0.08;
    }
  }

  updateGameoverVisuals(dt) {
    this.particles.update(dt * 0.6);
    this.bolts.update(dt);
    this.updateEffects(dt);
    this.updateFoodVisuals(dt * 0.2);
    this.player.deathTime += dt;
    const t = this.player.deathTime;
    const radius = 19 + Math.min(t, 8) * 1.2;
    const desired = new THREE.Vector3(
      this.player.pos.x + Math.cos(t * 0.22) * radius,
      this.player.pos.y + 7 + Math.min(t, 5) * 1.1,
      this.player.pos.z + Math.sin(t * 0.22) * radius
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-1.1 * dt));
    this.camera.lookAt(this.player.pos);
    this.camera.fov = damp(this.camera.fov, 70, 1.2, dt);
    this.camera.updateProjectionMatrix();
    if (Math.random() < dt * 12) {
      const p = this.player.pos.clone().add(new THREE.Vector3(rand(-3,3), rand(-3,3), rand(-3,3)));
      this.particles.spawn(p.x, p.y, p.z, rand(-.5,.5), rand(.2,1.5), rand(-.5,.5), pick([0xff2b58,0xff9a5c]), rand(0.5,2), rand(1,2.5), 1, 0);
    }
  }

  updateFoodVisuals(dt) {
    const t = this.time;
    for (const f of this.foods) {
      if (!f.alive) continue;
      const g = f.group;
      const lift = Math.sin(t * 1.7 + f.phase) * 0.24;
      g.position.set(
        f.anchor.x + Math.sin(t * 1.2 + f.phase) * 0.10,
        f.anchor.y + lift,
        f.anchor.z + Math.cos(t * 1.1 + f.phase) * 0.10
      );
      g.rotation.y += dt * 1.1;
      g.rotation.x += dt * 0.4;
      const pulse = 1 + Math.sin(t * 2.4 + f.phase) * 0.065;
      g.scale.setScalar(pulse);
      for (let i = 0; i < f.vis.rings.length; i++) {
        f.vis.rings[i].rotation.z += dt * (0.8 + i * 0.35);
        f.vis.rings[i].rotation.x += dt * (0.25 - i * 0.06);
      }
      f.vis.glow.scale.setScalar((f.type === 'elite' ? 6.2 : f.type === 'rare' ? 4.8 : f.type === 'unstable' ? 4.1 : 3.6) * (0.92 + Math.sin(t * 3 + f.phase) * 0.13));
    }
    this._updateFoodBeams();
  }

  _updateFoodBeams() {
    if (!this.foodBeams) return;
    const pos = this.foodBeamPos;
    const col = this.foodBeamCol;
    if (!this._beamColor) this._beamColor = new THREE.Color();
    const c = this._beamColor;
    let n = 0;
    for (const f of this.foods) {
      if (!f.alive || n >= this.foodBeamMax) continue;
      const anchor = f.anchor;
      const tall = f.type === 'elite' ? 9.5 : f.type === 'rare' ? 7.0 : f.type === 'unstable' ? 5.4 : 4.2;
      const pulse = 0.82 + Math.sin(this.time * 2.3 + f.phase) * 0.18;
      const i = n * 6;
      pos[i] = anchor.x; pos[i + 1] = anchor.y + 0.9; pos[i + 2] = anchor.z;
      pos[i + 3] = anchor.x; pos[i + 4] = anchor.y + 0.9 + tall * pulse; pos[i + 5] = anchor.z;
      c.setHex(this.foodColor[f.type]);
      col[i] = c.r * 0.10; col[i + 1] = c.g * 0.10; col[i + 2] = c.b * 0.10;
      col[i + 3] = c.r * (f.type === 'elite' ? 1.7 : 1.15); col[i + 4] = c.g * (f.type === 'elite' ? 1.7 : 1.15); col[i + 5] = c.b * (f.type === 'elite' ? 1.7 : 1.15);
      n++;
    }
    this.foodBeams.geometry.setDrawRange(0, n * 2);
    this.foodBeams.geometry.attributes.position.needsUpdate = true;
    this.foodBeams.geometry.attributes.color.needsUpdate = true;
  }

  updatePostFx(dt) {
    const fx = this.fx;
    const playing = this.mode === 'playing' || this.mode === 'paused' || this.mode === 'levelup';
    const odFx = playing && this.run && this.run.odActive;
    const lowHealth = this.player && this.player.maxHp > 0 && this.mode === 'playing'
      ? Math.max(0, (0.34 - this.player.hp / this.player.maxHp)) * 0.9 : 0;
    fx.damage = damp(Math.max(fx.damage, lowHealth), 0, 3.0, dt);
    fx.slow = damp(fx.slow, this.run && this.run.slowTimer > 0 && this.mode === 'playing' ? 1 : 0, 4.5, dt);
    fx.overdrive = damp(fx.overdrive, odFx ? 1 : 0, 3.5, dt);
    fx.flash = damp(fx.flash, 0, 4.8, dt);
    fx.chroma = damp(fx.chroma, 0.52 + (odFx ? 0.5 : 0) + (this.mode === 'gameover' ? 0.8 : 0), 4, dt);
    fx.bloom = 0.62 + (odFx ? 0.26 : 0) + (this.mode === 'title' ? 0.08 : 0);
    fx.death = damp(fx.death, this.mode === 'gameover' ? 1 : 0, 2.4, dt);
    fx.boost = damp(fx.boost, this.mode === 'playing' && this.boostActive ? 1 : 0, 5, dt);
    if (this.mode === 'title') fx.intro = damp(fx.intro, 0.55, 1.2, dt);
    else fx.intro = damp(fx.intro, 0, 2.2, dt);
  }

  /* --------------------------------------------------------------------------
     Body / player visuals
  -------------------------------------------------------------------------- */
  _recordTrail() {
    const trail = this.player.trail;
    if (!trail.length || trail[0].distanceToSquared(this.player.pos) > TRAIL_STEP * TRAIL_STEP) {
      trail.unshift(this.player.pos.clone());
      if (trail.length > 720) trail.length = 720;
    }
  }

  _sampleTrail(distance, out) {
    const head = this.player.pos;
    if (distance <= 0.0001) return out.copy(head);
    const trail = this.player.trail;
    let acc = 0;
    let prev = head;
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const d = prev.distanceTo(p);
      if (d > 0.00001 && acc + d >= distance) {
        const t = (distance - acc) / d;
        return out.copy(prev).lerp(p, t);
      }
      acc += d;
      prev = p;
      if (acc > distance + 1) break;
    }
    return out.copy(prev);
  }

  _updateBody(dt, demo) {
    const p = this.player;
    if (!p.trail.length) return;
    const count = Math.min(MAX_BODY, Math.max(2, Math.ceil(p.bodyLen / SEG_SPACING)));
    p.segments.length = count;
    const temp = new THREE.Vector3();
    const prev = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    const color = new THREE.Color();
    const colors = p.bodyColors.array;
    const pulse = p.bodyPulse.array;
    const dummy = p.dummy;
    const spinePos = p.spinePos;
    const spineCol = p.spineCol;
    const time = this.time;
    const od = this.run && this.run.odActive;

    for (let i = 0; i < count; i++) {
      const d = i * SEG_SPACING;
      this._sampleTrail(d, temp);
      if (i === 0) p.segments[i] = new THREE.Vector3().copy(temp);
      else p.segments[i] = new THREE.Vector3().copy(temp);
      this._sampleTrail(Math.max(0, d - 0.18), prev);
      if (i === 0) dir.subVectors(p.dir, prev).normalize();
      else dir.subVectors(temp, prev).normalize();
      if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.25) dir.copy(p.dir);
      quat.setFromUnitVectors(forward, dir);
      const t = i / Math.max(1, count - 1);
      const taper = (1 - Math.pow(t, 1.45) * 0.78) * (i === 0 ? 1.24 : 1);
      const wob = 1 + Math.sin(time * 5.2 - i * 0.55) * 0.045;
      const s = taper * wob;
      scale.set(0.67 * s, 0.67 * s, 0.78 * s * (i === 0 ? 1.1 : 1));
      dummy.position.copy(temp);
      dummy.quaternion.copy(quat);
      dummy.scale.copy(scale);
      dummy.updateMatrix();
      p.body.setMatrixAt(i, dummy.matrix);
      const hue = od ? 0.105 + Math.sin(time * 2.4 + i * 0.18) * 0.028 : 0.5 + t * 0.29 + Math.sin(time * 1.8 + t * 6) * 0.035;
      const lit = 0.42 + 0.1 * Math.sin(time * 2.6 - i * 0.3) + (od ? 0.08 : 0);
      color.setHSL(hue % 1, 0.96, lit);
      colors[i*3] = color.r * 1.06; colors[i*3+1] = color.g * 1.06; colors[i*3+2] = color.b * 1.06;
      pulse[i] = i / count + time * 0.05;
      spinePos[i*3] = temp.x; spinePos[i*3+1] = temp.y; spinePos[i*3+2] = temp.z;
      spineCol[i*3] = color.r * 1.5; spineCol[i*3+1] = color.g * 1.5; spineCol[i*3+2] = color.b * 1.5;
    }
    p.body.count = count;
    p.body.instanceMatrix.needsUpdate = true;
    p.bodyColors.needsUpdate = true;
    p.bodyPulse.needsUpdate = true;
    p.spine.geometry.setDrawRange(0, count);
    p.spine.geometry.attributes.position.needsUpdate = true;
    p.spine.geometry.attributes.color.needsUpdate = true;
    p.spine.visible = count > 1;
    this.materials.body.uniforms.uActive.value = od ? 1 : (this.run && this.run.slowTimer > 0 ? 0.5 : 0);
    p.group.position.copy(p.pos);
    p.group.quaternion.setFromUnitVectors(forward, p.dir);
    p.group.visible = true;
    if (!demo) this.bodyAura.update(p.segments, this.time, od, this.run.slowTimer > 0);
  }

  /* --------------------------------------------------------------------------
     Title, flow, meta screen
  -------------------------------------------------------------------------- */
  _titleIntro() {
    this.mode = 'title';
    this.hasLockedOnce = false;
    const bar = this.ui['boot-bar-fill'];
    const status = this.ui['boot-status-text'];
    const steps = ['正在校准三维坐标', '编译神经突变协议', '注入虚空蛇核', '建立最终链接'];
    let i = 0;
    const tick = setInterval(() => {
      i++;
      if (bar) bar.style.width = `${Math.min(100, i * 26)}%`;
      if (status && steps[i]) status.textContent = steps[i];
      if (i >= 4) clearInterval(tick);
    }, 230);
    setTimeout(() => {
      const boot = this.ui.boot;
      if (boot) boot.classList.add('is-out');
      setTimeout(() => { if (boot) boot.classList.add('hidden'); }, 750);
    }, 1150);
    this._updateTitleStats();
    this.refreshNanoUI();
  }

  _updateTitleStats() {
    if (!this.ui) return;
    this.ui['best-score-title'].textContent = fmt(SAVE.stats.bestScore);
    this.ui['run-count-title'].textContent = fmt(SAVE.stats.runs);
    this.ui['total-nano-title'].textContent = fmt(Math.floor(SAVE.nanites));
    this.ui['meta-best'].textContent = fmt(SAVE.stats.bestScore);
    this.ui['meta-runs'].textContent = fmt(SAVE.stats.runs);
    this.ui['meta-data'].textContent = fmt(SAVE.stats.totalData);
    this.ui['meta-kills'].textContent = fmt(SAVE.stats.totalKills);
    this.refreshNanoUI();
  }

  _renderMeta() {
    if (!this.ui['meta-grid']) return;
    const grid = this.ui['meta-grid'];
    let html = '';
    for (const def of META_DEFS) {
      const level = SAVE.meta[def.id] || 0;
      const cost = metaCost(def);
      const maxed = level >= def.max;
      const afford = SAVE.nanites >= cost;
      let pips = '';
      for (let i = 0; i < def.max; i++) pips += `<i class="${i < level ? 'on' : ''}"></i>`;
      html += `
        <div class="meta-upg ${maxed ? 'maxed' : ''}" style="--accent:${def.accent}">
          <div class="upg-icon">${def.icon}</div>
          <div class="upg-body">
            <div class="upg-name">${def.name}<small>${def.en}</small></div>
            <div class="upg-desc">${maxed ? '已达到峰值协议。' : '下一级：' + def.desc(level + 1)}</div>
            <div class="upg-pips">${pips}</div>
          </div>
          <div class="upg-buy">
            ${maxed ? '<span class="upg-cost">MAX</span><button class="upg-btn maxed" disabled>峰值</button>'
              : `<span class="upg-cost"><small>N</small>${fmt(cost)}</span><button class="upg-btn" data-meta="${def.id}" ${afford ? '' : 'disabled'}>${afford ? '升级' : '不足'}</button>`}
          </div>
        </div>`;
    }
    grid.innerHTML = html;
    if (!this._metaBound) {
      this._metaBound = true;
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-meta]');
        if (!btn || btn.disabled) return;
        this.buyMeta(btn.dataset.meta);
      });
    }
    this.refreshNanoUI();
  }

  buyMeta(id) {
    const def = META_DEFS.find((d) => d.id === id);
    if (!def) return;
    const level = SAVE.meta[id] || 0;
    if (level >= def.max) return;
    const cost = metaCost(def);
    if (SAVE.nanites < cost) { this.toast('纳米尘不足。去死几次，或者等农场多产一点。', 'danger'); audio.ui(); return; }
    SAVE.nanites -= cost;
    SAVE.meta[id] = level + 1;
    audio.unlock(); audio.levelup();
    persist(true);
    this._renderMeta();
    this._updateTitleStats();
    this.toast(`永久协议已写入：<b>${def.name} ${roman(SAVE.meta[id])}</b>`, 'gold');
  }

  openMeta(origin) {
    audio.unlock();
    this.metaOrigin = origin || 'title';
    if (this.mode === 'playing' || this.mode === 'levelup') return;
    this._setTouchVisible(false);
    this.hide(this.ui['screen-title']);
    this.hide(this.ui['screen-gameover']);
    if (this.ui.hud) this.ui.hud.classList.add('hidden');
    this.show(this.ui['screen-meta']);
    this.mode = 'meta';
    this._renderMeta();
    this._updateTitleStats();
    if (document.pointerLockElement) document.exitPointerLock();
    audio.setPaused(true);
    this.fx.intro = 0;
  }

  closeMeta(startRun) {
    if (this.mode !== 'meta') return;
    this.hide(this.ui['screen-meta']);
    audio.setPaused(false);
    if (startRun) { this.startRun(true); return; }
    if (this.metaOrigin === 'gameover') {
      this.show(this.ui['screen-gameover']);
      this.mode = 'gameover';
    } else {
      this.show(this.ui['screen-title']);
      this.mode = 'title';
      this._updateTitleStats();
      this._clearTransientUI();
    }
  }

  /* --------------------------------------------------------------------------
     Run lifecycle
  -------------------------------------------------------------------------- */
  startRun(fromRetry) {
    if (this.mode === 'playing' || this.mode === 'levelup') return;
    audio.unlock();
    audio.setPaused(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hide(this.ui['screen-title']);
    this.hide(this.ui['screen-gameover']);
    this.hide(this.ui['screen-levelup']);
    this.hide(this.ui['screen-pause']);
    this.hide(this.ui['screen-meta']);
    this.hide(this.ui['offline-reward']);
    this.ui.hud.classList.remove('hidden');
    if (this.ui.boot) this.ui.boot.classList.add('hidden');
    this._clearTransientUI();
    this._buffSig = '';
    this.ui.buffs.innerHTML = '';
    this.fx.damage = 0;
    this.fx.slow = 0;
    this.fx.overdrive = 0;
    this.fx.boost = 0;
    this.fx.chroma = 0.52;
    this._clearEntities();
    this._initRunData();
    this.runId = (this.runId || 0) + 1;
    const run = this.run;
    run.active = true;
    run.level = 1;
    run.xpNeed = this._xpNeeded(1);
    run.rerolls = 1 + (SAVE.meta.warmstart || 0);
    run.revives = (SAVE.meta.revive || 0);
    run.launchGrace = 2.2;
    run.startTime = performance.now();
    this.player.pos.set(0, 6, 27);
    this.player.yaw = 0;
    this.player.pitch = -0.04;
    this.player.desiredYaw = 0;
    this.player.desiredPitch = -0.04;
    this.player.dir.set(0, -Math.sin(0.04), -Math.cos(0.04)).normalize();
    this.player.trail = [];
    for (let i = 0; i < 300; i++) {
      this.player.trail.push(new THREE.Vector3(
        Math.sin(i * 0.025) * 0.08,
        6 + Math.sin(i * 0.04) * 0.1,
        27 + i * TRAIL_STEP
      ));
    }
    this.player.bodyLen = START_BODY * SEG_SPACING;
    this.player.targetBodyLen = this.player.bodyLen;
    this.player.hp = 100;
    this.player.shield = 0;
    this.player.invuln = 2.0;
    this.recomputeMods(true);
    this.player.hp = this.player.maxHp;
    this.player.shield = this.player.maxShield;
    this.player.thrust = this.player.maxThrust;
    this.player.group.visible = true;
    this.player.head.visible = true;
    if (this.bodyAura) this.bodyAura.points.visible = true;
    this.player.deathTime = 0;
    this.skills.dash.cd = 0;
    this.skills.pulse.cd = 0;
    this.skills.chrono.cd = 0;
    this.cameraIntro = 1;
    this.cameraShake = 0;
    this.cameraBank = 0;
    this.fx.death = 0;
    this.fx.intro = 1;
    this.fx.flash = 0.4;
    this.fx.flashColor = 0x8bfaff;
    this._syncDrones();
    this._updateBody(0, false);
    this._seedRunFood();
    this._spawnAmbientThreats();
    this.mode = 'playing';
    this.run.active = true;
    this._setTouchVisible(true);
    this._updateCamera(0.016, true);
    this.levelupCards = [];
    this.ui['hint-text'].textContent = '鼠标控制航向 · W 加速 · SPACE 折跃';
    this.ui['edge-warning'].classList.remove('show');
    this.ui['combo-cluster'].classList.remove('active', 'hot');
    this.banner('NEURAL LINK ESTABLISHED', fromRetry ? '再次下潜' : '神经链接已建立', '吞噬数据碎片，进化出能活着离开虚空的形态。', 'cyan', 2600);
    this.feed(fromRetry ? '新一轮神经链接已建立。' : '首批数据碎片已投射。', 'cyan');
    setTimeout(() => {
      if (this.mode === 'playing' && this.run.active) {
        this.toast('<b>W</b> 加速 · <b>A/D</b> 或鼠标转向 · <b>Y 轴</b> 靠俯仰控制');
      }
    }, 2800);
    this.hasLockedOnce = false;
    this._requestLock();
    setTimeout(() => {
      if (this.mode === 'playing' && !this.pointerLocked && !this.mobile) {
        this.toast('鼠标锁定未生效 · 按住画面拖动也能转向');
      }
    }, 700);
    this._hudRefresh(true);
    this.updateTitleNano();
    audio.intensity = 0.38;
  }

  _seedRunFood() {
    const seeds = [
      ['common', 0, 5.72, 20], ['common', 0.4, 5.48, 14], ['common', -0.6, 5.24, 8],
      ['rare', 1.8, 5.1, 3], ['common', -4, 6.2, -2], ['common', 7, 9, -9],
      ['unstable', 0, 14, -5], ['common', 14, 8, 4], ['common', -9, -2, 2],
      ['rare', -13, 11, -15], ['common', 18, -9, -20]
    ];
    for (const seed of seeds) this.spawnFoodAt(seed[0], new THREE.Vector3(seed[1], seed[2], seed[3]));
    for (let i = 0; i < 4; i++) {
      this.spawnFoodAt(Math.random() < 0.72 ? 'common' : (Math.random() < 0.6 ? 'rare' : 'unstable'),
        new THREE.Vector3(rand(-28, 28), rand(-22, 24), rand(-30, 10)));
    }
  }

  _spawnAmbientThreats() {
    this.spawnMineAt(new THREE.Vector3(24, 14, -18));
    this.spawnMineAt(new THREE.Vector3(-27, -9, 2));
    this.spawnMineAt(new THREE.Vector3(12, -22, -26));
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this._setTouchVisible(false);
    this.show(this.ui['screen-pause']);
    this.ui['pause-score'].textContent = fmt(this.run.score);
    this.ui['pause-level'].textContent = pad2(this.run.level);
    const count = Object.values(this.run.cards).reduce((a, b) => a + b, 0);
    this.ui['pause-cards'].textContent = pad2(count);
    this.ui['pause-build'].innerHTML = this._buildChipsHTML();
    if (document.pointerLockElement) document.exitPointerLock();
    audio.setPaused(true);
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.hide(this.ui['screen-pause']);
    this.mode = 'playing';
    this._setTouchVisible(true);
    this.last = performance.now();
    audio.unlock();
    audio.setPaused(false);
    this._requestLock();
  }

  quitToTitle() {
    this.hide(this.ui['screen-pause']);
    this.hide(this.ui['screen-gameover']);
    this.hide(this.ui['screen-levelup']);
    this.hide(this.ui['screen-meta']);
    this.ui.hud.classList.add('hidden');
    this._setTouchVisible(false);
    this.show(this.ui['screen-title']);
    this.mode = 'title';
    this.run.active = false;
    this.run.deathHandled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.setPaused(false);
    audio.intensity = 0.25;
    this.fx.death = 0;
    this.fx.intro = 0.3;
    this.fx.damage = 0;
    this.fx.flash = 0;
    this.fx.slow = 0;
    this.fx.overdrive = 0;
    this.fx.boost = 0;
    this.boostActive = false;
    this._seedDemoWorld();
    this._updateTitleStats();
    this.player.group.visible = true;
    this.hasLockedOnce = false;
    this._clearTransientUI();
  }

  _clearTransientUI() {
    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
      this._bannerTimer = null;
    }
    if (this.ui.banner) this.ui.banner.classList.remove('show');
    if (this.ui.toasts) this.ui.toasts.innerHTML = '';
    if (this.ui.floaters) this.ui.floaters.innerHTML = '';
    if (this.ui['event-feed']) this.ui['event-feed'].innerHTML = '';
    this._floaters = [];
  }

  gameOver(cause) {
    if (this.run.deathHandled) return;
    this.run.deathHandled = true;
    this.run.active = false;
    this.run.odActive = false;
    this.run.slowTimer = 0;
    this.run.overdrive = 0;
    this.boostActive = false;
    this.mode = 'gameover';
    this.run.cause = cause || '未知';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.hud.classList.add('hidden');
    this._setTouchVisible(false);
    audio.gameover();
    audio.setPaused(true);
    this.player.deathTime = 0;
    this.player.head.visible = false;
    this.player.body.count = 0;
    this.player.spine.visible = false;
    this.player.overdriveMesh.visible = false;
    this.player.shieldMesh.visible = false;
    if (this.bodyAura) this.bodyAura.points.visible = false;
    this.fx.flash = 0.7;
    this.fx.flashColor = 0xff2c58;
    this.fx.damage = 1;
    const pos = this.player.pos.clone();
    this.particles.burst(pos, 110, 0xff3d65, { speed: 18, size: 5.5, life: 1.8, drag: 1.1 });
    this.particles.burst(pos, 50, 0xffd15c, { speed: 12, size: 3.4, life: 1.4, drag: 1.5 });
    this.shockwave(pos, 0xff4b6d, 13, 0.8);
    this.cameraShake = 1.2;
    const rewards = this._awardRun();
    this._fillGameOver(rewards, rewards.isRecord);
    const serial = this.runId;
    setTimeout(() => {
      if (this.mode !== 'gameover' || this.runId !== serial) return;
      this.show(this.ui['screen-gameover']);
    }, 620);
  }

  _awardRun() {
    const r = this.run;
    const score = Math.floor(r.score);
    const prevBest = SAVE.stats.bestScore;
    const isRecord = score > prevBest;
    const raw = 24 + score * 0.011 + r.data * 0.24 + r.level * 4.5 + r.kills * 3.2 + r.maxCombo * 0.85;
    const reward = Math.max(1, Math.floor(raw));
    SAVE.nanites += reward;
    SAVE.stats.bestScore = Math.max(prevBest, score);
    SAVE.stats.bestLevel = Math.max(SAVE.stats.bestLevel || 1, r.level);
    SAVE.stats.bestCombo = Math.max(SAVE.stats.bestCombo || 0, r.maxCombo);
    SAVE.stats.runs = (SAVE.stats.runs || 0) + 1;
    SAVE.stats.totalData = (SAVE.stats.totalData || 0) + Math.floor(r.data);
    SAVE.stats.totalKills = (SAVE.stats.totalKills || 0) + r.kills;
    SAVE.stats.totalScore = (SAVE.stats.totalScore || 0) + score;
    persist(true);
    return { reward, isRecord, prevBest };
  }

  _fillGameOver(rewards, isRecord) {
    const r = this.run;
    const causes = {
      '边界力场': '你被边界力场碾碎了。下一次，别和墙较劲。',
      '自噬': '你咬到了自己的尾巴。经典，但依然致命。',
      '虚空雷区': '你撞进了虚空雷区。数据很好看，机体很难看。',
      '猎手哨兵': '猎手哨兵击穿了你的核心。它在你的残骸旁继续巡逻。',
      '追踪弹幕': '追踪弹幕压垮了护盾。下一次试试相位折跃。',
      '未知': '虚空把你回收了。它总是缺实验样本。'
    };
    this.ui['go-cause'].textContent = causes[this.run.cause] || causes['未知'];
    this.ui['go-score'].textContent = fmt(r.score);
    this.ui['go-best'].textContent = isRecord ? 'NEW RECORD · 新纪录' : `BEST ${fmt(rewards.prevBest)}`;
    this.ui['go-best'].style.color = isRecord ? 'var(--gold)' : '#5c6a7a';
    this.ui['go-time'].textContent = fmtTime(r.time);
    this.ui['go-data'].textContent = fmt(r.data);
    this.ui['go-combo'].textContent = fmt(r.maxCombo);
    this.ui['go-kills'].textContent = fmt(r.kills);
    this.ui['go-level'].textContent = pad2(r.level);
    this.ui['go-length'].textContent = fmt(this.player.segments.length);
    this.ui['go-nano'].textContent = `+${fmt(rewards.reward)}`;
    const list = this.ui['go-build-list'];
    if (!r.acquired.length) list.innerHTML = '<span class="empty">本局未接入任何神经突变。</span>';
    else {
      list.innerHTML = r.acquired.map((a) => {
        const def = CARD_POOL.find((c) => c.id === a.id);
        return `<span class="chip">${def ? def.icon : '◆'} ${def ? def.name : a.id}<b>${roman(a.level)}</b></span>`;
      }).join('');
    }
    this._updateTitleStats();
  }

  _buildChipsHTML() {
    const r = this.run;
    if (!r || !r.acquired || !r.acquired.length) return '<span class="chip" style="opacity:.45">尚无突变</span>';
    return r.acquired.slice(-12).map((a) => {
      const def = CARD_POOL.find((c) => c.id === a.id);
      return `<span class="chip">${def ? def.name : a.id}<b>${roman(a.level)}</b></span>`;
    }).join('');
  }

  /* --------------------------------------------------------------------------
     XP / level-up / cards
  -------------------------------------------------------------------------- */
  _xpNeeded(level) { return Math.floor(6 + (level - 1) * 4.2 + Math.pow(level, 1.28)); }

  addXp(amount) {
    const r = this.run;
    r.xp += amount;
    let leveled = 0;
    while (r.xp >= r.xpNeed && leveled < 8) {
      r.xp -= r.xpNeed;
      r.level++;
      r.xpNeed = this._xpNeeded(r.level);
      r.pendingLevels++;
      leveled++;
      this.skills.dash.cd = 0;
    }
    if (leveled) {
      this.recomputeMods();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.14);
      this.fx.flash = Math.max(this.fx.flash, 0.22);
      this.fx.flashColor = 0x8af7ff;
      this.particles.burst(this.player.pos, 22, 0x7dfaff, { speed: 7, size: 2.4, life: 1.1 });
      audio.levelup();
    }
  }

  openLevelUp() {
    if (this.mode !== 'playing' || this.run.pendingLevels <= 0) return;
    this.mode = 'levelup';
    this.levelupCards = this.generateCards(3);
    this._renderCards();
    this.ui['lv-run-stats'].textContent = `STAGE ${pad2(this.run.level)} · SYNC ×${(1 + this.run.combo * 0.06).toFixed(1)} · ${fmt(this.run.score)} PTS`;
    this.show(this.ui['screen-levelup']);
    this._setTouchVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    audio.setPaused(false);
    audio.levelup();
  }

  cardLevel(id) { return this.run.cards[id] || 0; }
  cardRarityBias() {
    return (SAVE.meta.luck || 0) * 0.1 + this.cardLevel('lucky') * 0.15;
  }

  generateCards(n, exclude) {
    const excludeSet = new Set(exclude || []);
    const cards = [];
    const eligibleByRarity = { common: [], rare: [], legendary: [], cursed: [] };
    for (const c of CARD_POOL) {
      if (this.cardLevel(c.id) >= c.max) continue;
      if (excludeSet.has(c.id)) continue;
      eligibleByRarity[c.rarity].push(c);
    }
    const bias = this.cardRarityBias();
    const weights = {
      common: Math.max(22, 50 - bias * 22),
      rare: 33 + bias * 15,
      legendary: 10 + bias * 5,
      cursed: 5 + bias * 1
    };
    let guard = 0;
    while (cards.length < n && guard++ < 90) {
      const availableRarities = Object.keys(eligibleByRarity).filter((rarity) => eligibleByRarity[rarity].length > 0);
      if (!availableRarities.length) break;
      let total = 0;
      for (const rarity of availableRarities) total += weights[rarity];
      let roll = Math.random() * total;
      let chosenRarity = availableRarities[0];
      for (const rarity of availableRarities) {
        roll -= weights[rarity];
        if (roll <= 0) { chosenRarity = rarity; break; }
      }
      const bucket = eligibleByRarity[chosenRarity];
      if (!bucket.length) continue;
      const idx = Math.floor(Math.random() * bucket.length);
      const card = bucket.splice(idx, 1)[0];
      if (cards.some((c) => c.id === card.id)) continue;
      cards.push(card);
    }
    // A draft of three identical rarities is technically fair but reads as
    // a bug. Swap one out whenever a different rarity is available.
    if (cards.length > 1 && new Set(cards.map((c) => c.rarity)).size === 1) {
      const alt = CARD_POOL.find((c) => c.rarity !== cards[0].rarity
        && this.cardLevel(c.id) < c.max
        && !cards.some((x) => x.id === c.id)
        && !excludeSet.has(c.id));
      if (alt) cards[cards.length - 1] = alt;
    }
    return cards;
  }

  _renderCards() {
    const cards = this.levelupCards;
    if (!cards || !cards.length) {
      this.run.pendingLevels = 0;
      this.toast('所有可用突变均已写入峰值 · 机体直接获得 <b>+30%</b> 完整性', 'gold');
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.3);
      this.resumeFromLevelup();
      return;
    }
    let html = '';
    cards.forEach((card, i) => {
      const current = this.cardLevel(card.id);
      const next = current + 1;
      const rarity = RARITY_NAME[card.rarity] || RARITY_NAME.common;
      const desc = card.desc(next);
      const nextDesc = next < card.max ? card.desc(next + 1) : '';
      html += `
        <article class="card rarity-${card.rarity}" data-index="${i}" style="--i:${i}" role="button" tabindex="0">
          <div class="card-no">0${i + 1}</div>
          <div class="card-head"><span>${rarity.en} / ${rarity.cn}</span><span class="card-level">LV ${current} → ${next}</span></div>
          <div class="card-icon">${card.icon}</div>
          <h3>${card.name}<small>${card.en}</small></h3>
          <div class="card-desc">${desc}</div>
          ${nextDesc ? `<div class="card-next">下一级：${nextDesc.replace(/<[^>]+>/g, '')}</div>` : ''}
          <div class="card-foot"><span>点击接入突变</span><span class="card-key">${i + 1}</span></div>
        </article>`;
    });
    this.ui.cards.innerHTML = html;
    this.ui['reroll-count'].textContent = this.run.rerolls;
    this.ui['btn-reroll'].disabled = this.run.rerolls <= 0;
    this.ui['pending-levels'].textContent = this.run.pendingLevels > 1 ? `+${this.run.pendingLevels - 1} PENDING` : '';
    this.ui['xp-fill'].style.transform = `scaleX(${clamp(this.run.xp / this.run.xpNeed, 0, 1)})`;
  }

  rerollCards() {
    if (this.mode !== 'levelup' || this.run.rerolls <= 0) return;
    const previous = this.levelupCards.slice();
    const exclude = previous.map((c) => c.id);
    let next = this.generateCards(3, exclude);
    if (next.length < 3) {
      next = next.concat(this.generateCards(3 - next.length).filter((c) => !next.some((n) => n.id === c.id))).slice(0, 3);
    }
    if (!next.length) { this.levelupCards = previous; this.toast('没有更多可用突变可以重掷。'); return; }
    this.run.rerolls--;
    this.levelupCards = next;
    this._renderCards();
    this.fx.flash = 0.18;
    this.fx.flashColor = 0xcf7aff;
    audio.ui();
  }

  chooseCard(index) {
    if (this.mode !== 'levelup') return;
    const card = this.levelupCards[index];
    if (!card) return;
    const r = this.run;
    const nextLevel = (r.cards[card.id] || 0) + 1;
    r.cards[card.id] = nextLevel;
    r.acquired.push({ id: card.id, level: nextLevel });
    if (card.id === 'immortal') r.revives += 1;
    if (r.pendingLevels > 0) r.pendingLevels--;
    this.recomputeMods();
    if (card.id === 'shield' || card.id === 'warmstart') this.player.shield = this.player.maxShield;
    this.fx.flash = 0.25;
    this.fx.flashColor = card.rarity === 'legendary' ? 0xffd15c : card.rarity === 'cursed' ? 0xff4a67 : 0x7befff;
    this.particles.burst(this.player.pos, 34, card.rarity === 'legendary' ? 0xffd15c : 0x7dfaff, { speed: 9, size: 3.2, life: 1.2 });
    this._hudRefresh(true);
    this.toast(`接入突变：<b>${card.name} ${roman(nextLevel)}</b>`, card.rarity === 'legendary' ? 'gold' : card.rarity === 'cursed' ? 'danger' : '');
    if (r.pendingLevels > 0) {
      this.levelupCards = this.generateCards(3);
      if (!this.levelupCards.length) {
        r.pendingLevels = 0;
        this.hide(this.ui['screen-levelup']);
        this.mode = 'playing';
        this._setTouchVisible(true);
        this.last = performance.now();
        this.player.invuln = Math.max(this.player.invuln, 0.7);
        this.toast('突变池已空 · 剩余进化转化为完整性修复。', 'gold');
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.25);
        this._requestLock();
        return;
      }
      this._renderCards();
      this.ui['lv-run-stats'].textContent = `STAGE ${pad2(r.level)} · ${r.pendingLevels} 次进化待处理`;
      audio.levelup();
      return;
    }
    this.hide(this.ui['screen-levelup']);
    this.mode = 'playing';
    this._setTouchVisible(true);
    this.last = performance.now();
    this.player.invuln = Math.max(this.player.invuln, 0.7);
    audio.setPaused(false);
    this._requestLock();
  }

  resumeFromLevelup() {
    if (this.mode !== 'levelup') return;
    this.run.pendingLevels = 0;
    this.hide(this.ui['screen-levelup']);
    this.mode = 'playing';
    this._setTouchVisible(true);
    this.last = performance.now();
    this.player.invuln = Math.max(this.player.invuln, 0.7);
    this.audio.setPaused(false);
    this._requestLock();
  }

  /* --------------------------------------------------------------------------
     Meta modifiers
  -------------------------------------------------------------------------- */
  recomputeMods(fill) {
    if (!this.run) return;
    const r = this.run;
    const m = SAVE.meta || {};
    const lv = (id) => r.cards[id] || 0;
    const oldMaxHp = this.player.maxHp || 100;
    const oldMaxShield = this.player.maxShield || 0;
    const maxHp = Math.max(30, 100 + (m.hull || 0) * 20 + (r.level - 1) * 4 - lv('glass') * 18);
    const maxShield = (m.warmstart || 0) * 18 + lv('shield') * 26;
    const maxThrust = 100 + lv('capacity') * 25;
    const mods = {
      speed: (m.thrust || 0) * 0.03 + lv('overclock') * 0.06,
      pickup: 2.7 + (m.magnet || 0) * 0.9 + lv('magnet') * 0.9,
      magnetRange: 10.5 + (m.magnet || 0) * 0.8 + lv('magnet') * 1.2,
      pulseRadius: 11.5 * (1 + lv('pulse') * 0.22),
      pulseDamage: 1 + lv('pulse'),
      shieldRegen: (maxShield > 0 ? 1.8 : 0) + lv('shield') * 1.1,
      hpRegen: lv('vitality') * 0.8,
      scoreMul: (1 + (m.siphon || 0) * 0.06) * (1 + lv('greed') * 0.18),
      dataMul: (1 + (m.siphon || 0) * 0.06) * (1 + lv('greed') * 0.08),
      comboCap: 90 + lv('combo') * 30,
      comboSlow: 1 + lv('combo') * 0.10,
      cooldownMul: Math.max(0.45, (1 - (m.compression || 0) * 0.04) * (1 - lv('compression') * 0.09) * (1 - lv('chrono') * 0.08)),
      baseDamageMul: 1 + lv('berserk') * 0.35 + lv('glass') * 0.6,
      damageMul: 1 + lv('berserk') * 0.35 + lv('glass') * 0.6,
      dashNova: lv('dashNova'),
      chainLevel: lv('chain'),
      chainEvery: Math.max(3, 7 - lv('chain')),
      droneCount: lv('drone'),
      chronoDuration: 3.3 + lv('chrono') * 1.2,
      odGain: 1 + lv('entropy') * 0.25,
      odDuration: 8 + lv('entropy'),
      foodGrowth: 1 + lv('growth') * 0.2,
      foodHeal: lv('growth'),
      tail: lv('tail'),
      nova: lv('nova'),
      autoPulse: lv('autoPulse'),
      autoPulseEvery: Math.max(7, 17 - lv('autoPulse') * 3),
      rarityBias: this.cardRarityBias(),
      immortal: lv('immortal'),
      singularity: lv('singularity'),
      timeDebt: lv('timeDebt'),
      maxThrust
    };
    mods.dashCd = 4.8 * mods.cooldownMul;
    mods.pulseCd = 9.5 * mods.cooldownMul;
    mods.chronoCd = 16 * mods.cooldownMul;
    this.mods = mods;
    this.player.maxHp = maxHp;
    this.player.maxShield = maxShield;
    this.player.maxThrust = maxThrust;
    this.player.hp = clamp(this.player.hp + Math.max(0, maxHp - oldMaxHp), 1, maxHp);
    if (fill) this.player.hp = maxHp;
    this.player.shield = clamp(this.player.shield + Math.max(0, maxShield - oldMaxShield), 0, maxShield);
    if (fill) this.player.shield = maxShield;
    this.player.thrust = clamp(this.player.thrust || 0, 0, maxThrust);
    this.skills.dash.cdMax = mods.dashCd;
    this.skills.pulse.cdMax = mods.pulseCd;
    this.skills.chrono.cdMax = mods.chronoCd;
    this.skills.dash.cd = Math.min(this.skills.dash.cd, mods.dashCd);
    this.skills.pulse.cd = Math.min(this.skills.pulse.cd, mods.pulseCd);
    this.skills.chrono.cd = Math.min(this.skills.chrono.cd, mods.chronoCd);
    this._syncDrones();
  }

  /* --------------------------------------------------------------------------
     Gameplay update
  -------------------------------------------------------------------------- */
  updateGame(dt) {
    if (!this.run.active) return;
    const r = this.run;
    r.time += dt;
    this.updateTimers(dt);
    if (this.mode !== 'playing') return;
    const slow = r.slowTimer > 0;
    const hitStop = r.hitStop > 0 ? 0.22 : 1;
    const worldDt = dt * (slow ? 0.34 : 1) * hitStop;
    const playerDt = dt * (slow ? 0.72 : 1) * hitStop;
    this.updatePlayer(playerDt, dt);
    if (this.mode !== 'playing') return;
    this.updateFoods(worldDt);
    this.updateMines(worldDt);
    this.checkMineImpact();
    if (this.mode !== 'playing') return;
    this.updateHunters(worldDt);
    if (this.mode !== 'playing') return;
    this.updateProjectiles(worldDt);
    if (this.mode !== 'playing') return;
    this.updateDrones(worldDt);
    this.updateSpawner(worldDt);
    this.updateBodyAuraHazards(worldDt);
    this.updateEffects(dt);
    this.updateOverdriveArcs(dt);
    this.particles.update(dt);
    this.bolts.update(dt);
    this.updateCamera(dt);
    if (this.fx.damage < 0.02 && r.time > 1) r.lastHitSource = '';
    this.audio.intensity = clamp(0.3 + Math.min(r.combo, 60) * 0.004 + r.threat * 0.018 + (r.odActive ? 0.25 : 0), 0.25, 1);
    if (r.pendingLevels > 0 && this.mode === 'playing') this.openLevelUp();
  }

  updateTimers(dt) {
    const r = this.run;
    const p = this.player;
    const m = this.mods;
    m.damageMul = (m.baseDamageMul || m.damageMul || 1) * (r.odActive ? 1 + (m.singularity || 0) * 0.8 : 1);
    this.skills.dash.cd = Math.max(0, this.skills.dash.cd - dt);
    this.skills.pulse.cd = Math.max(0, this.skills.pulse.cd - dt);
    this.skills.chrono.cd = Math.max(0, this.skills.chrono.cd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.selfHitCd = Math.max(0, p.selfHitCd - dt);
    p.shieldRegenDelay = Math.max(0, p.shieldRegenDelay - dt);
    p.regenDelay = Math.max(0, p.regenDelay - dt);
    r.hitStop = Math.max(0, r.hitStop - dt);

    if (r.combo > 0) {
      r.comboTimer -= dt;
      if (r.comboTimer <= 0) {
        r.combo = 0;
        r.comboTimer = 0;
        this.comboFlash = 0.5;
      }
    }
    if (r.slowTimer > 0) {
      r.slowTimer = Math.max(0, r.slowTimer - dt);
      if (r.slowTimer <= 0) this.feed('时间流恢复。', 'cyan');
    }
    if (r.odActive) {
      r.odTimer = Math.max(0, r.odTimer - dt);
      r.overdrive = 100 * clamp(r.odTimer / Math.max(0.01, m.odDuration), 0, 1);
      if (r.odTimer <= 0) {
        r.odActive = false;
        r.overdrive = 0;
        this.player.overdriveMesh.visible = false;
        this.overdriveReadyAnnounced = false;
        this.toast('超载协议结束。充能重新开始。');
      }
    }
    if (p.maxShield > 0 && p.shieldRegenDelay <= 0 && p.shield < p.maxShield) {
      p.shield = Math.min(p.maxShield, p.shield + (m.shieldRegen || 0) * dt);
    }
    if (p.regenDelay <= 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + (m.hpRegen || 0) * dt);
    }
    if (m.autoPulse > 0) {
      r.autoPulseTimer -= dt;
      if (r.autoPulseTimer <= 0) {
        const closeThreat = this.mines.some((x) => x.group.position.distanceTo(p.pos) < m.pulseRadius + 6)
          || this.hunters.some((x) => x.group.position.distanceTo(p.pos) < m.pulseRadius + 10)
          || this.projectiles.some((x) => x.group.position.distanceTo(p.pos) < m.pulseRadius);
        if (closeThreat) this.performPulse(false);
        r.autoPulseTimer = closeThreat ? m.autoPulseEvery : 3;
      }
    }
  }

  updatePlayer(dt, realDt) {
    const p = this.player;
    const r = this.run;
    const m = this.mods;
    if (!p || !r.active) return;

    const turnKeys = (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) - (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0);
    const pitchKeys = (this.keys.ArrowUp ? 1 : 0) - (this.keys.ArrowDown ? 1 : 0);
    p.desiredYaw += turnKeys * 1.65 * dt;
    p.desiredPitch = clamp(p.desiredPitch + pitchKeys * 1.25 * dt, -1.16, 1.16);
    if (p.desiredYaw > Math.PI * 4 || p.desiredYaw < -Math.PI * 4) p.desiredYaw = p.desiredYaw % TAU;

    const turnRate = 1 - Math.exp(-6.4 * dt);
    const prevYaw = p.yaw;
    p.yaw += angleDelta(p.yaw, p.desiredYaw) * turnRate;
    p.pitch = damp(p.pitch, p.desiredPitch, 6.2, dt);
    p.dir.set(
      -Math.sin(p.yaw) * Math.cos(p.pitch),
      Math.sin(p.pitch),
      -Math.cos(p.yaw) * Math.cos(p.pitch)
    ).normalize();
    this.yawVelocity = damp(this.yawVelocity || 0, angleDelta(prevYaw, p.yaw) / Math.max(0.001, dt), 8, dt);

    const wantsBoost = !!(this.keys.KeyW || this.keys.touchBoost);
    const braking = !!this.keys.KeyS;
    const odSpeed = r.odActive ? 1.25 * (1 + (m.singularity || 0) * 0.25) : 1;
    if (r.launchGrace > 0) r.launchGrace = Math.max(0, r.launchGrace - realDt);
    const launchFactor = r.launchGrace > 0 ? 0.45 : 1;
    const baseSpeed = 21 * (1 + m.speed) * odSpeed * launchFactor;
    const canBoost = (r.odActive || p.thrust > 0.5) && wantsBoost && !braking;
    this.boostActive = canBoost;
    if (r.odActive) {
      p.thrust = p.maxThrust;
    } else if (canBoost) {
      const efficiency = 1 - Math.min(0.3, (this.run.cards.overclock || 0) * 0.05);
      p.thrust = Math.max(0, p.thrust - 24 * dt * efficiency);
    } else {
      const regen = 12 + (m.speed || 0) * 8;
      p.thrust = Math.min(p.maxThrust, p.thrust + regen * dt);
    }
    let targetSpeed = baseSpeed;
    if (canBoost) targetSpeed *= 1.86 + Math.min(0.25, (m.speed || 0)) + (this.run.cards.capacity || 0) * 0.1;
    else if (braking) targetSpeed *= 0.53;
    if (r.slowTimer > 0) targetSpeed *= 0.92;
    p.targetSpeed = targetSpeed;
    p.speed = damp(p.speed, targetSpeed, canBoost ? 4.8 : 3.2, dt);
    p.pos.addScaledVector(p.dir, p.speed * dt);
    this._containPlayer(realDt);

    if (this.mode !== 'playing') return;
    if (r.slowTimer > 0) {
      r.score += p.speed * dt * 2.0 * (1 + (m.timeDebt || 0)) * m.scoreMul;
    } else {
      r.score += p.speed * dt * 0.7 * (1 + r.combo * 0.02) * m.scoreMul;
    }
    p.targetBodyLen += dt * 0.02;
    p.bodyLen = damp(p.bodyLen, p.targetBodyLen, 3.4, dt);
    this._recordTrail();
    this._updateBody(dt, false);
    this._updateHead(dt, false);
    this.checkSelfCollision();
    if (this.mode !== 'playing') return;
    this.edgeWarn = Math.max(Math.abs(p.pos.x), Math.abs(p.pos.y), Math.abs(p.pos.z)) > BOUND - 3.6 ? 1 : 0;
    this.ui['edge-warning'].classList.toggle('show', this.edgeWarn > 0);

    if (this.boostActive) {
      const back = p.pos.clone().addScaledVector(p.dir, -2.4);
      for (let i = 0; i < 2; i++) {
        this.particles.spawn(
          back.x + rand(-.25, .25), back.y + rand(-.25, .25), back.z + rand(-.25, .25),
          -p.dir.x * rand(2, 8) + rand(-1.5, 1.5), -p.dir.y * rand(2, 8) + rand(-1.5, 1.5), -p.dir.z * rand(2, 8) + rand(-1.5, 1.5),
          r.odActive ? 0xffd15c : 0x58f4ff, rand(1.1, 2.6), rand(0.25, 0.6), 2.5, 0
        );
      }
    }
    if (r.odActive && Math.random() < realDt * 25) {
      const seg = p.segments[randInt(1, Math.max(1, p.segments.length - 1))];
      if (seg) this.particles.spawn(seg.x, seg.y, seg.z, rand(-1.5,1.5), rand(-1,1.8), rand(-1.5,1.5), pick([0xffd15c,0xff43d0,0x8b5cff]), rand(1.2,3.2), rand(0.4,1.1), 1.8, 0);
    }
    this.cameraShake = Math.max(0, this.cameraShake - realDt * 2.3);
  }

  _updateHead(dt, demo) {
    const p = this.player;
    const r = this.run;
    const time = this.time;
    p.ring.rotation.z += dt * 1.2;
    p.ring.rotation.x = Math.sin(time * 0.8) * 0.22;
    p.aura.rotation.y += dt * 0.35;
    p.aura.rotation.x = Math.sin(time * 0.5) * 0.14;
    const spin = p.invuln > 0 ? 1 + Math.sin(time * 28) * 0.07 : 1;
    p.head.scale.setScalar(spin * 1.12);
    if (p.maxShield > 0) {
      p.shieldMesh.visible = true;
      const ratio = clamp(p.shield / Math.max(1, p.maxShield), 0, 1);
      this.materials.shield.uniforms.uOpacity.value = 0.3 + ratio * 0.72;
      p.shieldMesh.scale.setScalar(1 + Math.sin(time * 2.5) * 0.035);
    } else p.shieldMesh.visible = false;
    if (r && r.odActive) {
      p.overdriveMesh.visible = true;
      p.overdriveMesh.rotation.z += dt * 2.4;
      p.overdriveMesh.rotation.x = Math.sin(time * 1.7) * 0.6;
      p.light.color.setHex(0xffcc5c);
      p.light.intensity = 3.6;
    } else {
      p.overdriveMesh.visible = false;
      p.light.color.setHex(r && r.slowTimer > 0 ? 0x8e8cff : 0x24f4ff);
      p.light.intensity = 2.0 + (p.hp / p.maxHp) * 0.5;
    }
    p.halo.scale.setScalar(9.5 + Math.sin(time * 3.2) * 1.4 + (r && r.odActive ? 5 : 0));
  }

  _containPlayer(realDt) {
    const p = this.player;
    let bounced = false;
    let contact = null;
    for (const axis of ['x', 'y', 'z']) {
      if (p.pos[axis] > BOUND) {
        p.pos[axis] = BOUND;
        p.dir[axis] = -Math.abs(p.dir[axis]);
        bounced = true;
        contact = p.pos.clone();
      } else if (p.pos[axis] < -BOUND) {
        p.pos[axis] = -BOUND;
        p.dir[axis] = Math.abs(p.dir[axis]);
        bounced = true;
        contact = p.pos.clone();
      }
    }
    if (!bounced) return;
    p.dir.normalize();
    p.pitch = Math.asin(clamp(p.dir.y, -1, 1));
    p.yaw = Math.atan2(-p.dir.x, -p.dir.z);
    p.desiredPitch = p.pitch;
    p.desiredYaw = p.yaw;
    this.uWallAlert.value = 1;
    this.cameraShake = Math.max(this.cameraShake, 0.5);
    this.fx.damage = Math.max(this.fx.damage, 0.22);
    if (contact) {
      this.particles.burst(contact, 18, 0xff4366, { speed: 7, size: 2.2, life: 0.7, drag: 2 });
      this.ringFxAt(contact, 0xff426a, 0.8, 5, 0.4);
    }
    audio.hit();
    if (p.invuln <= 0 && this.run.time > 5) this.applyDamage(6, '边界力场');
  }

  checkSelfCollision() {
    const p = this.player;
    if (p.invuln > 0 || p.selfHitCd > 0) return;
    const segs = p.segments;
    if (!segs || segs.length < 14) return;
    for (let i = 12; i < segs.length; i += 1) {
      if (p.pos.distanceToSquared(segs[i]) < 1.4) {
        p.selfHitCd = 2.0;
        p.invuln = Math.max(p.invuln, 0.9);
        this.applyDamage(16 * (1 - (this.mods.tail || 0) * 0.25), '自噬');
        if (this.mode !== 'playing') return;
        const cut = Math.max(8, i * SEG_SPACING * 0.92);
        p.targetBodyLen = Math.max(8, cut);
        p.bodyLen = Math.min(p.bodyLen, cut);
        this.run.combo = 0;
        this.run.comboTimer = 0;
        this.cameraShake = Math.max(this.cameraShake, 0.9);
        this.spawnRing(p.pos, 0xff3e67, 1, 7, 0.55);
        this.particles.burst(segs[i], 28, 0xff5a76, { speed: 8, size: 2.6, life: 0.9 });
        this.feed('自噬发生 · 尾部数据被切断', 'danger');
        audio.hit();
        break;
      }
    }
  }

  updateFoods(dt) {
    const p = this.player;
    const m = this.mods;
    const pickup2 = (m.pickup || 2.7) * (m.pickup || 2.7);
    const magRange = m.magnetRange || 10.5;
    let dead = false;
    for (const f of this.foods) {
      if (!f.alive) { dead = true; continue; }
      const dSq = f.anchor.distanceToSquared(p.pos);
      if (dSq < pickup2) {
        this.collectFood(f);
        dead = true;
        if (this.mode !== 'playing') break;
        continue;
      }
      if (dSq < magRange * magRange) {
        const d = Math.sqrt(dSq);
        const pull = (1 - d / magRange) * 4.6 + 1.2;
        f.anchor.lerp(p.pos, clamp(dt * pull, 0, 0.7));
        f.magnetized = true;
      }
    }
    if (dead) this.foods = this.foods.filter((f) => f.alive);
    this.updateFoodVisuals(dt);
  }

  collectFood(f) {
    if (!f.alive) return;
    const r = this.run;
    const m = this.mods;
    const def = FOOD_DEFS[f.type] || FOOD_DEFS.common;
    f.alive = false;
    f.vis.inUse = false;
    f.group.visible = false;
    const pos = f.anchor.clone();
    r.foodEaten++;
    r.combo = Math.min(m.comboCap, r.combo + def.combo);
    r.maxCombo = Math.max(r.maxCombo, r.combo);
    r.comboTimer = 4.35 * (1 + (m.comboSlow - 1) * 0.7);
    r.comboTimerMax = r.comboTimer;
    const comboMult = 1 + r.combo * 0.06;
    const timeBonus = (r.slowTimer > 0 && m.timeDebt) ? 1 + m.timeDebt : 1;
    r.score += def.score * m.scoreMul * comboMult * (r.odActive ? 2 : 1) * timeBonus;
    const data = def.data * m.dataMul;
    r.data += data;
    const xp = Math.max(1, Math.round(def.xp * m.dataMul));
    this.addXp(xp);
    const heal = def.heal + (m.foodHeal || 0);
    if (heal > 0 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    }
    const bodyCap = MAX_BODY * SEG_SPACING;
    if (this.player.targetBodyLen < bodyCap) {
      this.player.targetBodyLen = Math.min(bodyCap, this.player.targetBodyLen + def.grow * m.foodGrowth);
    } else {
      r.score += def.score * m.scoreMul * 0.55;
    }
    if (!r.odActive) {
      r.overdrive = Math.min(100, r.overdrive + def.od * m.odGain);
      if (r.overdrive >= 100 && !this.overdriveReadyAnnounced) {
        this.overdriveReadyAnnounced = true;
        this.toast('超载协议就绪 · 按 <b>R</b> 进入过载', 'gold');
        audio.overdrive();
      }
    }
    if (f.type === 'unstable') {
      this.skills.dash.cd = Math.max(0, this.skills.dash.cd - 2.2);
      this.skills.pulse.cd = Math.max(0, this.skills.pulse.cd - 2.2);
      this.skills.chrono.cd = Math.max(0, this.skills.chrono.cd - 2.2);
      this.feed('相位酵素：技能冷却 -2.2s', 'magenta');
    }
    if (m.chainLevel > 0) {
      r.chainCounter++;
      if (r.chainCounter >= m.chainEvery) {
        r.chainCounter = 0;
        this.triggerChain();
      }
    }
    const color = this.foodColor[f.type];
    this.particles.burst(pos, f.type === 'elite' ? 40 : f.type === 'rare' ? 24 : 13, color, {
      speed: f.type === 'elite' ? 11 : 7, size: f.type === 'elite' ? 3.8 : 2.0, life: 0.8, drag: 2.2
    });
    this.spawnRing(pos, color, 0.4, f.type === 'elite' ? 12 : 5, 0.5);
    if (f.type === 'rare' || f.type === 'elite') {
      this.cameraShake = Math.max(this.cameraShake, f.type === 'elite' ? 0.55 : 0.25);
      this.fx.flash = Math.max(this.fx.flash, f.type === 'elite' ? 0.18 : 0.08);
      this.fx.flashColor = color;
      audio.pickup(r.combo, true);
      this.floater(`${def.label} +${Math.round(data)} DATA`, pos, f.type === 'elite' ? 'epic' : 'rare');
      if (f.type === 'elite') this.feed('奇点果已吞噬 · 神经重构效率暴涨', 'gold');
    } else {
      audio.pickup(r.combo, false);
      this.floater(`+${Math.round(data)} DATA`, pos, 'cyan');
    }
    this.growPulse = 1;
  }

  /* --------------------------------------------------------------------------
     Abilities
  -------------------------------------------------------------------------- */
  useSkill(id) {
    if (this.mode !== 'playing' || !this.run.active) return;
    const skill = this.skills[id];
    if (!skill) return;
    if (skill.cd > 0) {
      audio.ui();
      this.toast(`<b>${this.skillName(id)}</b> 冷却中 · ${skill.cd.toFixed(1)}s`);
      return;
    }
    if (id === 'dash') this.performDash();
    else if (id === 'pulse') this.performPulse(true);
    else if (id === 'chrono') this.performChrono();
  }

  skillName(id) {
    return id === 'dash' ? '相位折跃' : id === 'pulse' ? '湮灭脉冲' : '时间琥珀';
  }

  performDash() {
    const p = this.player;
    const m = this.mods;
    const dist = 10.5 + (this.run.cards.dashNova ? this.run.cards.dashNova * 1.2 : 0);
    const start = p.pos.clone();
    const dir = p.dir.clone();
    const end = p.pos.clone().addScaledVector(dir, dist);
    for (const axis of ['x','y','z']) end[axis] = clamp(end[axis], -BOUND + 0.2, BOUND - 0.2);
    const steps = 9;
    for (let i = 1; i <= steps; i++) {
      const sp = start.clone().lerp(end, i / steps);
      for (let mi = this.mines.length - 1; mi >= 0; mi--) {
        if (this.mines[mi].group.position.distanceTo(sp) < 2.8) this.destroyMine(this.mines[mi], 'dash');
      }
      for (let hi = this.hunters.length - 1; hi >= 0; hi--) {
        if (this.hunters[hi].group.position.distanceTo(sp) < 3.0) this.damageHunter(this.hunters[hi], 2.2 * m.damageMul, 'dash');
      }
      for (const f of this.foods) {
        if (f.alive && f.anchor.distanceTo(sp) < m.pickup + 1) this.collectFood(f);
      }
    }
    p.pos.copy(end);
    p.invuln = Math.max(p.invuln, 0.55);
    p.selfHitCd = Math.max(p.selfHitCd, 0.35);
    p.trail.unshift(end.clone());
    for (let i = steps - 1; i >= 1; i--) p.trail.unshift(start.clone().lerp(end, i / steps));
    const distMoved = start.distanceTo(end);
    this.particles.burst(start, 34, 0x58f6ff, { speed: 9, size: 3.2, life: 0.7, drag: 1.7, vx: dir.x * 4, vy: dir.y * 4, vz: dir.z * 4 });
    this.particles.burst(end, 26, 0xff48df, { speed: 7, size: 2.5, life: 0.6 });
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      this.spawnRing(start.clone().lerp(end, t), 0x7bfaff, 0.35, 2.8, 0.3);
    }
    this.bolts.strike(start, end, 0x7ffcff, 0.14, 12, 1.2);
    this.cameraShake = Math.max(this.cameraShake, 0.42);
    this.fx.flash = Math.max(this.fx.flash, 0.12);
    this.fx.flashColor = 0x72f8ff;
    this.run.score += distMoved * 2.2 * m.scoreMul;
    this.skills.dash.cd = this.skills.dash.cdMax;
    audio.dash();
    if (m.dashNova > 0) {
      const radius = 6 + m.dashNova * 2;
      this.shockwave(end, 0xff4ae1, radius, 0.55);
      for (let mi = this.mines.length - 1; mi >= 0; mi--) {
        if (this.mines[mi].group.position.distanceTo(end) < radius) this.destroyMine(this.mines[mi], 'dashNova');
      }
      for (let hi = this.hunters.length - 1; hi >= 0; hi--) {
        if (this.hunters[hi].group.position.distanceTo(end) < radius) this.damageHunter(this.hunters[hi], m.dashNova * 1.2 * m.damageMul, 'dashNova');
      }
    }
    this._updateBody(0, false);
    this._updateCamera(0.016, true);
  }

  performPulse(manual) {
    const p = this.player;
    const m = this.mods;
    const radius = (m.pulseRadius || 11) * (manual ? 1 : 0.8);
    const dmg = (m.pulseDamage || 1) * m.damageMul * (manual ? 1 : 0.65);
    this.shockwave(p.pos, manual ? 0x7ffaff : 0x946dff, radius, manual ? 0.72 : 0.5);
    this.spawnRing(p.pos, 0x7ffaff, 0.7, radius * 0.9, 0.55);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].group.position.distanceTo(p.pos) < radius) this.removeProjectile(this.projectiles[i]);
    }
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (this.mines[i].group.position.distanceTo(p.pos) < radius) this.destroyMine(this.mines[i], 'pulse');
    }
    for (let i = this.hunters.length - 1; i >= 0; i--) {
      if (this.hunters[i].group.position.distanceTo(p.pos) < radius) this.damageHunter(this.hunters[i], dmg, 'pulse');
    }
    for (const f of this.foods) {
      if (f.alive && f.anchor.distanceTo(p.pos) < radius * 1.3) {
        f.anchor.lerp(p.pos, 0.28);
      }
    }
    if (manual) {
      this.skills.pulse.cd = this.skills.pulse.cdMax;
      this.run.score += 18 * m.scoreMul;
    }
    this.cameraShake = Math.max(this.cameraShake, manual ? 0.65 : 0.28);
    this.fx.flash = Math.max(this.fx.flash, manual ? 0.2 : 0.08);
    this.fx.flashColor = 0x77f6ff;
    this.particles.burst(p.pos, manual ? 44 : 20, 0x7ffaff, { speed: radius * 0.8, size: manual ? 3.2 : 2, life: 0.6, drag: 3.2 });
    audio.pulse();
  }

  performChrono() {
    const m = this.mods;
    this.run.slowTimer = Math.max(this.run.slowTimer, m.chronoDuration);
    this.skills.chrono.cd = this.skills.chrono.cdMax;
    this.fx.slow = 1;
    this.fx.flash = Math.max(this.fx.flash, 0.24);
    this.fx.flashColor = 0x716dff;
    this.cameraShake = Math.max(this.cameraShake, 0.28);
    this.spawnRing(this.player.pos, 0x8d7dff, 1.4, 26, 0.9);
    this.particles.burst(this.player.pos, 36, 0x9080ff, { speed: 4.5, size: 2.8, life: 1.2, drag: 0.8 });
    this.bolts.strike(this.player.pos.clone().add(new THREE.Vector3(-10,-6,0)), this.player.pos.clone().add(new THREE.Vector3(10,6,0)), 0xb7a7ff, 0.35, 18, 3);
    this.banner('CHRONO AMBER', '时间琥珀', `世界减速 ${Math.round((1 - 0.34) * 100)}% · 神经反应保持高速`, 'cyan', 1700);
    this.feed('时间琥珀展开：世界进入慢动作。', 'magenta');
    audio.chrono();
  }

  activateOverdrive() {
    if (this.mode !== 'playing' || !this.run.active) return;
    const r = this.run;
    if (r.odActive) return;
    if (r.overdrive < 100) {
      audio.ui();
      this.toast(`超载充能不足 · <b>${Math.floor(r.overdrive)}%</b> / 100%`);
      return;
    }
    r.odActive = true;
    r.odTimer = this.mods.odDuration;
    r.overdrive = 100;
    this.player.overdriveMesh.visible = true;
    this.fx.flash = 0.35;
    this.fx.flashColor = 0xffd15c;
    this.cameraShake = Math.max(this.cameraShake, 0.8);
    this.shockwave(this.player.pos, 0xffd15c, 16, 0.8);
    this.particles.burst(this.player.pos, 50, 0xffd15c, { speed: 14, size: 3.6, life: 1.2, drag: 1.6 });
    this.banner('OVERDRIVE PROTOCOL', '超载协议', '无限推进 · 双倍得分 · 全身数据灼烧', 'gold', 2400);
    this.feed('超载协议已激活。', 'gold');
    audio.overdrive();
  }

  triggerChain() {
    const m = this.mods;
    if (!m.chainLevel) return;
    const p = this.player.pos;
    const targets = [];
    for (const mine of this.mines) targets.push({ obj: mine, type: 'mine', pos: mine.group.position, dist: mine.group.position.distanceTo(p) });
    for (const hunter of this.hunters) targets.push({ obj: hunter, type: 'hunter', pos: hunter.group.position, dist: hunter.group.position.distanceTo(p) });
    targets.sort((a, b) => a.dist - b.dist);
    const count = Math.min(targets.length, 2 + m.chainLevel, 6);
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      if (!t) break;
      this.bolts.strike(p, t.pos.clone(), i % 2 ? 0x7cfaff : 0xff5be1, 0.22, 12, 1.8);
      if (t.type === 'mine') this.destroyMine(t.obj, 'chain');
      else this.damageHunter(t.obj, (1.4 + m.chainLevel * 0.9) * m.damageMul, 'chain');
    }
    if (count) {
      this.particles.burst(p, 12, 0x78f9ff, { speed: 5, size: 1.8, life: 0.5 });
      audio.warning();
    }
  }

  updateOverdriveArcs(dt) {
    if (!this.run.odActive || this.player.segments.length < 8) return;
    this.lightningTimer = (this.lightningTimer || 0) - dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 0.09;
      const segs = this.player.segments;
      const a = segs[randInt(1, Math.max(1, segs.length - 2))];
      const b = segs[randInt(1, Math.max(1, segs.length - 2))];
      this.bolts.strike(a, b, pick([0xffd15c, 0xff54d6, 0x84f9ff]), 0.1, 7, 0.9);
    }
  }

  /* --------------------------------------------------------------------------
     Pickups & hazards
  -------------------------------------------------------------------------- */
  spawnFoodAt(type, pos, options) {
    if (!FOOD_DEFS[type]) type = 'common';
    let p = pos ? pos.clone() : this._randomFoodPosition();
    p.x = clamp(p.x, -BOUND + 3, BOUND - 3);
    p.y = clamp(p.y, -BOUND + 3, BOUND - 3);
    p.z = clamp(p.z, -BOUND + 3, BOUND - 3);
    const obj = this._spawnFoodVisual(type, p, true);
    if (!obj && type !== 'common') return this.spawnFoodAt('common', p);
    if (obj) {
      obj.anchor.copy(p);
      obj.group.position.copy(p);
      if (type === 'elite' || type === 'rare') this.ringFxAt(p, this.foodColor[type], 2.6, 6, 0.45);
    }
    return obj;
  }

  _randomFoodPosition() {
    for (let tries = 0; tries < 20; tries++) {
      const p = new THREE.Vector3(rand(-BOUND + 4, BOUND - 4), rand(-BOUND + 5, BOUND - 5), rand(-BOUND + 4, BOUND - 4));
      if (p.distanceTo(this.player.pos) > 9) return p;
    }
    return new THREE.Vector3(rand(-28, 28), rand(-20, 20), rand(-28, 28));
  }

  randomFoodType() {
    const bias = this.mods.rarityBias || 0;
    const roll = Math.random();
    if (roll < 0.035 + bias * 0.02) return 'elite';
    if (roll < 0.24 + bias * 0.04) return 'rare';
    if (roll < 0.33) return 'unstable';
    return 'common';
  }

  spawnMineAt(pos) {
    const pool = this.minePool.find((x) => !x.inUse);
    if (!pool) return null;
    pool.inUse = true;
    pool.group.visible = true;
    if (!pos) pos = new THREE.Vector3(rand(-30, 30), rand(-28, 28), rand(-30, 30));
    const p = pos.clone();
    p.x = clamp(p.x, -BOUND + 2, BOUND - 2); p.y = clamp(p.y, -BOUND + 2, BOUND - 2); p.z = clamp(p.z, -BOUND + 2, BOUND - 2);
    pool.group.position.copy(p);
    pool.group.scale.setScalar(rand(0.9, 1.3));
    pool.group.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    pool.data = {
      pos: p, vel: new THREE.Vector3(rand(-0.8, 0.8), rand(-0.5, 0.5), rand(-0.8, 0.8)),
      phase: rand(0, TAU), age: 0, radius: 1.55, pool
    };
    this.mines.push(pool);
    this.ringFxAt(p, 0xff4966, 1.2, 3.5, 0.4);
    this.feed('虚空雷区已部署。', 'danger');
    return pool;
  }

  spawnHunter(pos, elite) {
    const pool = this.hunterPool.find((x) => !x.inUse);
    if (!pool) return null;
    const p = pos ? pos.clone() : new THREE.Vector3(rand(-30, 30), rand(-25, 25), rand(-30, 30));
    p.x = clamp(p.x, -BOUND + 3, BOUND - 3); p.y = clamp(p.y, -BOUND + 3, BOUND - 3); p.z = clamp(p.z, -BOUND + 3, BOUND - 3);
    pool.inUse = true;
    pool.group.visible = true;
    pool.group.position.copy(p);
    pool.group.scale.setScalar(elite ? 1.65 : 1);
    pool.group.rotation.set(0, rand(0, TAU), 0);
    pool.data = {
      elite: !!elite,
      hp: elite ? 16 + this.run.threat * 4 : 6 + this.run.threat * 2,
      maxHp: elite ? 16 + this.run.threat * 4 : 6 + this.run.threat * 2,
      fireCd: rand(2.6, 4.2), charge: -1, age: 0, phase: rand(0, TAU), pool
    };
    pool.laser.material.opacity = 0;
    this.hunters.push(pool);
    if (this.hunters.length === 1) {
      this.banner(elite ? 'ELITE SENTINEL DETECTED' : 'SENTINEL SIGNATURE', elite ? '精英哨兵锁定' : '猎手哨兵出现', elite ? '它带着足以击穿护盾的相位炮。优先处理。' : '它正在锁定你的神经信号。保持移动。', 'danger', 2600);
      this.feed(elite ? '精英哨兵已进入战场。' : '检测到猎手哨兵信号。', 'danger');
      audio.warning();
    } else {
      this.feed(elite ? '精英哨兵已部署。' : '新的猎手哨兵出现。', 'danger');
    }
    this.shockwave(p, elite ? 0xff4f8e : 0xff6a3c, elite ? 8 : 5, 0.45);
    return pool;
  }

  spawnProjectile(start, target, elite) {
    const pool = this.projectilePool.find((x) => !x.inUse);
    if (!pool) return null;
    const dir = target.clone().sub(start).normalize();
    const data = {
      vel: dir.clone().multiplyScalar(17 + this.run.threat * 1.2 + (elite ? 5 : 0)),
      life: 7, homing: elite ? 1.4 : 0.7, pool, phase: rand(0, TAU), trailCd: 0
    };
    pool.inUse = true; pool.group.visible = true;
    pool.group.position.copy(start);
    pool.group.scale.setScalar(elite ? 1.3 : 1);
    pool.data = data;
    this.projectiles.push(pool);
    this.particles.burst(start, 8, 0xffb35c, { speed: 4, size: 1.7, life: 0.4, drag: 2 });
    return pool;
  }

  updateMines(dt) {
    for (const mine of this.mines) {
      if (!mine.data) continue;
      const d = mine.data;
      d.age += dt;
      d.pos.addScaledVector(d.vel, dt);
      for (const axis of ['x','y','z']) {
        if (d.pos[axis] > BOUND - 2) { d.pos[axis] = BOUND - 2; d.vel[axis] *= -1; }
        if (d.pos[axis] < -BOUND + 2) { d.pos[axis] = -BOUND + 2; d.vel[axis] *= -1; }
      }
      mine.group.position.set(d.pos.x, d.pos.y + Math.sin(this.time * 1.2 + d.phase) * 0.4, d.pos.z);
      mine.group.rotation.x += dt * 0.35;
      mine.group.rotation.y += dt * 0.5;
      mine.group.rotation.z += dt * 0.22;
      mine.ring.rotation.z += dt * 0.8;
      mine.ring.scale.setScalar(1 + Math.sin(this.time * 2.2 + d.phase) * 0.08);
      mine.glow.scale.setScalar(5.8 + Math.sin(this.time * 3.3 + d.phase) * 1.2);
      d.radius = 1.55 * mine.group.scale.x;
    }
  }

  updateHunters(dt) {
    const p = this.player.pos;
    for (let i = this.hunters.length - 1; i >= 0; i--) {
      const h = this.hunters[i];
      if (!h.data) continue;
      const d = h.data;
      d.age += dt;
      const pos = h.group.position;
      const toPlayer = new THREE.Vector3().subVectors(p, pos);
      const dist = toPlayer.length();
      const desiredDist = d.elite ? 20 : 16;
      const pursuit = toPlayer.normalize().multiplyScalar((dist - desiredDist) * 0.32);
      const orbit = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(d.elite ? 3.4 : 2.2);
      const vertical = new THREE.Vector3(0, Math.sin(this.time * 0.8 + d.phase) * 1.4, 0);
      const vel = pursuit.add(orbit).add(vertical);
      pos.addScaledVector(vel, dt);
      for (const axis of ['x','y','z']) pos[axis] = clamp(pos[axis], -BOUND + 2, BOUND - 2);
      h.group.lookAt(p);
      h.group.rotateY(Math.PI);
      h.ring.rotation.z += dt * 1.3;
      h.ring2.rotation.y += dt * 1.1;
      h.cage.rotation.x += dt * 0.16;
      h.cage.rotation.y -= dt * 0.22;
      h.glow.scale.setScalar((d.elite ? 12 : 8.6) + Math.sin(this.time * 2.4 + d.phase) * 1.3);
      if (d.charge >= 0) {
        d.charge -= dt;
        this.bolts.strike(pos.clone(), p.clone().addScaledVector(this.player.dir, 2), 0xff4e60, 0.06, 9, 0.35);
        h.laser.visible = true;
        if (d.charge <= 0) {
          d.charge = -1;
          h.laser.visible = false;
          const target = p.clone().addScaledVector(this.player.dir, 2.4);
          this.spawnProjectile(pos.clone(), target, d.elite);
          if (d.elite) {
            const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(3.4);
            this.spawnProjectile(pos.clone(), target.clone().add(perp), true);
            this.spawnProjectile(pos.clone(), target.clone().sub(perp), true);
          }
          this.feed(d.elite ? '精英哨兵发射相位炮。' : '哨兵开火。', 'danger');
          audio.warning();
          d.fireCd = rand(2.8, 4.4) - Math.min(1.3, this.run.threat * 0.1);
        }
      } else {
        h.laser.visible = false;
        d.fireCd -= dt;
        if (d.fireCd <= 0 && dist < 48) d.charge = d.elite ? 0.8 : 0.62;
      }
      if (this.player.invuln <= 0 && pos.distanceTo(p) < (d.elite ? 4.0 : 3.1)) {
        this.applyDamage(d.elite ? 22 : 14, '猎手哨兵');
        if (this.mode !== 'playing') return;
      }
    }
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const d = proj.data;
      if (!d) continue;
      d.life -= dt;
      if (d.life <= 0) { this.removeProjectile(proj); continue; }
      if (d.homing > 0) {
        d.homing -= dt;
        const desired = p.pos.clone().sub(proj.group.position).normalize().multiplyScalar(d.vel.length());
        d.vel.lerp(desired, clamp(dt * 1.6, 0, 1));
      }
      proj.group.position.addScaledVector(d.vel, dt);
      proj.group.rotation.x += dt * 4;
      proj.group.rotation.y += dt * 5;
      d.trailCd -= dt;
      if (d.trailCd <= 0) {
        d.trailCd = 0.035;
        this.particles.spawn(proj.group.position.x, proj.group.position.y, proj.group.position.z,
          rand(-.4,.4), rand(-.4,.4), rand(-.4,.4), 0xffa34f, rand(0.7,1.7), rand(0.18,0.4), 1.5, 0);
      }
      const pos = proj.group.position;
      if (Math.abs(pos.x) > ARENA || Math.abs(pos.y) > ARENA || Math.abs(pos.z) > ARENA) { this.removeProjectile(proj); continue; }
      if (p.invuln <= 0 && pos.distanceToSquared(p.pos) < 1.7) {
        this.removeProjectile(proj);
        this.applyDamage(9 + this.run.threat, '追踪弹幕');
        if (this.mode !== 'playing') return;
      }
    }
  }

  removeProjectile(proj) {
    if (!proj) return;
    proj.inUse = false;
    proj.group.visible = false;
    proj.data = null;
    const idx = this.projectiles.indexOf(proj);
    if (idx >= 0) this.projectiles.splice(idx, 1);
  }

  updateDrones(dt) {
    const p = this.player;
    let index = 0;
    for (const drone of this.drones) {
      if (!drone.inUse) continue;
      const i = index++;
      drone.angle += dt * (0.7 + i * 0.15);
      const target = new THREE.Vector3(
        p.pos.x + Math.cos(drone.angle + this.time * 0.6) * (4.2 + i * 0.7),
        p.pos.y + Math.sin(this.time * 1.7 + i * 2.1) * 1.2 + 1.1,
        p.pos.z + Math.sin(drone.angle + this.time * 0.6) * (4.2 + i * 0.7)
      );
      drone.group.position.lerp(target, 1 - Math.exp(-4.2 * dt));
      drone.group.lookAt(p.pos.clone().addScaledVector(p.dir, 5));
      drone.ring.rotation.z += dt * 3.2;
      drone.fireCd -= dt;
      if (drone.fireCd <= 0) {
        const targetHazard = this._nearestHazard(drone.group.position, 48);
        if (targetHazard) {
          const hpos = targetHazard.obj.group.position;
          this.bolts.strike(drone.group.position.clone(), hpos.clone(), 0x9bfbff, 0.16, 8, 0.8);
          if (targetHazard.type === 'mine') this.destroyMine(targetHazard.obj, 'drone');
          else this.damageHunter(targetHazard.obj, (1.1 + (this.mods.droneCount || 1) * 0.4) * this.mods.damageMul, 'drone');
          this.particles.burst(hpos, 8, 0x91f9ff, { speed: 3, size: 1.5, life: 0.35 });
          drone.fireCd = 1.15;
        } else drone.fireCd = 0.35;
      }
    }
  }

  _nearestHazard(from, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const m of this.mines) {
      const d = m.group.position.distanceToSquared(from);
      if (d < bestD) { bestD = d; best = { type: 'mine', obj: m }; }
    }
    for (const h of this.hunters) {
      const d = h.group.position.distanceToSquared(from);
      if (d < bestD) { bestD = d; best = { type: 'hunter', obj: h }; }
    }
    return best;
  }

  _syncDrones() {
    if (!this.dronePool) return;
    const want = Math.min(3, (this.mods && this.mods.droneCount) || 0);
    this.drones = this.dronePool.slice(0, want);
    this.dronePool.forEach((drone, i) => {
      drone.inUse = i < want;
      drone.group.visible = i < want;
      if (drone.inUse) {
        drone.angle = (i / Math.max(1, want)) * TAU;
        if (drone.fireCd <= 0) drone.fireCd = rand(0.3, 1.2);
      }
    });
  }

  updateSpawner(dt) {
    const r = this.run;
    const p = this.player;
    r.spawnCd -= dt;
    r.mineCd -= dt;
    r.hunterCd -= dt;
    const nextThreat = Math.min(10, 1 + Math.floor(r.time / 34));
    if (nextThreat > r.threat) {
      r.threat = nextThreat;
      this.banner('THREAT ESCALATION', `威胁等级 ${roman(r.threat)}`, '虚空正在适应你的存在。更多的眼睛睁开了。', 'danger', 1900);
      this.feed(`威胁等级提升至 ${roman(r.threat)}。`, 'danger');
      audio.warning();
      this.fx.flash = Math.max(this.fx.flash, 0.1);
      this.fx.flashColor = 0xff4e6a;
    }
    if (r.time > r.nextStorm) {
      this.triggerDataStorm();
      r.nextStorm += 46;
    }
    const targetFood = Math.min(22, 12 + Math.floor(r.level * 0.8));
    if (this.foods.length < targetFood && r.spawnCd <= 0) {
      this.spawnFoodAt(this.randomFoodType());
      r.spawnCd = rand(0.5, 1.2);
    }
    const targetMines = Math.min(15, 3 + Math.floor(r.threat * 1.1) + Math.floor(r.level / 5));
    if (this.mines.length < targetMines && r.mineCd <= 0) {
      let pos;
      for (let i = 0; i < 10; i++) {
        pos = new THREE.Vector3(rand(-30, 30), rand(-30, 30), rand(-32, 32));
        if (pos.distanceTo(p.pos) > 16) break;
      }
      this.spawnMineAt(pos);
      r.mineCd = rand(2.4, 4.2);
    }
    if ((r.time > 40 || r.level >= 4) && this.hunters.length < 1 + Math.floor((r.threat - 1) / 2.8) && r.hunterCd <= 0) {
      let pos;
      for (let i = 0; i < 10; i++) {
        pos = new THREE.Vector3(rand(-28, 28), rand(-22, 22), rand(-32, -10));
        if (pos.distanceTo(p.pos) > 24) break;
      }
      this.spawnHunter(pos, false);
      r.hunterCd = Math.max(9, 25 - r.threat * 1.8);
    }
    if (r.time > r.nextElite && this.hunters.filter((h) => h.data && h.data.elite).length < 1) {
      let pos;
      for (let i = 0; i < 10; i++) {
        pos = new THREE.Vector3(rand(-28, 28), rand(-22, 22), rand(-34, 34));
        if (pos.distanceTo(p.pos) > 26) break;
      }
      this.spawnHunter(pos, true);
      r.nextElite += 72;
    }
  }

  triggerDataStorm() {
    const r = this.run;
    r.stormIndex++;
    const center = new THREE.Vector3(rand(-8, 8), rand(-8, 12), rand(-8, 8));
    const count = 7 + Math.floor(r.threat * 0.5);
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + Math.random() * 0.2;
      const rad = rand(7, 28);
      this.spawnFoodAt(Math.random() < 0.3 ? 'rare' : 'common', new THREE.Vector3(
        center.x + Math.cos(a) * rad, center.y + rand(-9, 9), center.z + Math.sin(a) * rad
      ));
    }
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU;
      this.spawnFoodAt('elite', new THREE.Vector3(center.x + Math.cos(a) * 8, center.y + rand(-3, 8), center.z + Math.sin(a) * 8));
    }
    this.banner('DATA STORM', '数据风暴降临', '大量加密数据正在涌入虚空。风险与收益同时饱和。', 'gold', 2400);
    this.feed('数据风暴降临 · 稀有数据涌入。', 'gold');
    this.particles.burst(center, 45, 0xffd15c, { speed: 15, size: 2.8, life: 1.2 });
    this.ringFxAt(center, 0xffd15c, 1.5, 22, 0.8);
    audio.levelup();
  }

  updateBodyAuraHazards(dt) {
    if ((this.mods.tail || 0) <= 0) return;
    this.tailTimer = (this.tailTimer || 0) - Math.max(0.001, dt || 0.016);
    if (this.tailTimer > 0) return;
    this.tailTimer = 0.1;
    const segs = this.player.segments;
    if (!segs || segs.length < 6) return;
    const step = Math.max(2, Math.floor(segs.length / 12));
    for (let i = 2; i < segs.length; i += step) {
      const seg = segs[i];
      for (let mi = this.mines.length - 1; mi >= 0; mi--) {
        if (this.mines[mi].group.position.distanceTo(seg) < 2.8) {
          this.bolts.strike(seg, this.mines[mi].group.position.clone(), 0xff49d1, 0.12, 6, 0.8);
          this.destroyMine(this.mines[mi], 'tail');
        }
      }
      for (let hi = this.hunters.length - 1; hi >= 0; hi--) {
        if (this.hunters[hi].group.position.distanceTo(seg) < 3.2) {
          this.damageHunter(this.hunters[hi], 0.6 * this.mods.tail * this.mods.damageMul, 'tail');
        }
      }
    }
  }

  destroyMine(mine, source) {
    if (!mine || !mine.data) return;
    const pos = mine.group.position.clone();
    mine.data = null;
    mine.inUse = false;
    mine.group.visible = false;
    const idx = this.mines.indexOf(mine);
    if (idx >= 0) this.mines.splice(idx, 1);
    this.run.kills++;
    this.run.score += 28 * this.mods.scoreMul * (this.run.odActive ? 2 : 1);
    this.run.overdrive = Math.min(100, this.run.overdrive + 2.5 * this.mods.odGain);
    this.particles.burst(pos, 20, 0xff4a67, { speed: 7, size: 2.2, life: 0.6, drag: 2 });
    this.shockwave(pos, 0xff3d5b, 3.2, 0.3);
    this.spawnRing(pos, 0xff5a73, 0.4, 4, 0.35);
    audio.hit();
  }

  damageHunter(hunter, amount, source) {
    if (!hunter || !hunter.data) return;
    const d = hunter.data;
    d.hp -= amount;
    this.particles.burst(hunter.group.position, 6, 0xffb36b, { speed: 3.5, size: 1.3, life: 0.35 });
    if (d.hp > 0) {
      hunter.group.scale.setScalar((d.elite ? 1.65 : 1) * (1 + Math.sin(this.time * 24) * 0.04));
      return;
    }
    const pos = hunter.group.position.clone();
    const elite = d.elite;
    hunter.data = null;
    hunter.inUse = false;
    hunter.group.visible = false;
    hunter.group.scale.setScalar(1);
    const idx = this.hunters.indexOf(hunter);
    if (idx >= 0) this.hunters.splice(idx, 1);
    this.run.kills++;
    this.run.score += (elite ? 320 : 95) * this.mods.scoreMul * (this.run.odActive ? 2 : 1);
    this.run.overdrive = Math.min(100, this.run.overdrive + (elite ? 18 : 6) * this.mods.odGain);
    this.particles.burst(pos, elite ? 55 : 28, elite ? 0xffd15c : 0xff6b46, { speed: elite ? 13 : 8, size: elite ? 4 : 2.6, life: 0.9, drag: 1.8 });
    this.shockwave(pos, elite ? 0xffd15c : 0xff5a3c, elite ? 10 : 5, 0.55);
    this.spawnRing(pos, 0xffa072, 0.5, elite ? 13 : 7, 0.6);
    this.spawnFoodAt(elite ? 'elite' : 'rare', pos.clone().add(new THREE.Vector3(rand(-2,2), rand(1,3), rand(-2,2))));
    if (elite) this.spawnFoodAt('rare', pos.clone().add(new THREE.Vector3(rand(-3,3), rand(-1,3), rand(-3,3))));
    if (this.mods.timeDebt > 0) this.spawnFoodAt('rare', pos.clone().add(new THREE.Vector3(rand(-4,4), rand(-2,4), rand(-4,4))));
    this.toast(elite ? '<b>精英哨兵已粉碎</b> · 高纯度数据掉落' : '猎手哨兵已粉碎', elite ? 'gold' : '');
    this.feed(elite ? '精英哨兵被摧毁，数据喷涌。' : '猎手哨兵被摧毁。', 'gold');
  }

  applyDamage(amount, cause) {
    const p = this.player;
    const r = this.run;
    if (!r.active || this.mode !== 'playing' || p.invuln > 0) return;
    let incoming = amount;
    let absorbed = 0;
    if (p.shield > 0) {
      absorbed = Math.min(p.shield, incoming);
      p.shield -= absorbed;
      incoming -= absorbed;
      if (p.shield <= 0) {
        p.shield = 0;
        this.onShieldBreak();
      }
    }
    if (incoming > 0) {
      p.hp -= incoming;
      p.regenDelay = 4;
      this.floater(`−${Math.ceil(incoming)}`, p.pos, 'damage');
      this.particles.burst(p.pos, 24, 0xff4261, { speed: 6, size: 2.4, life: 0.75 });
    } else {
      this.floater(`护盾 −${Math.ceil(absorbed)}`, p.pos, 'system');
      this.particles.burst(p.pos, 14, 0x8bc7ff, { speed: 4, size: 1.9, life: 0.5 });
    }
    p.invuln = 1.0;
    p.shieldRegenDelay = 4.0;
    p.selfHitCd = Math.max(p.selfHitCd, 0.8);
    r.hitStop = 0.07;
    r.combo = 0;
    r.comboTimer = 0;
    this.cameraShake = Math.max(this.cameraShake, 0.9);
    this.fx.damage = Math.max(this.fx.damage, 0.95);
    this.fx.flash = Math.max(this.fx.flash, 0.24);
    this.fx.flashColor = 0xff2b4d;
    r.lastHitSource = cause;
    audio.hit();
    if (p.hp <= 0) {
      p.hp = 0;
      if (r.revives > 0) this.revive();
      else this.gameOver(cause);
    }
  }

  onShieldBreak() {
    if (!this.mods.nova) return;
    const p = this.player;
    const radius = 8 + this.mods.nova * 2;
    this.shockwave(p.pos, 0x6fb4ff, radius, 0.6);
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (this.mines[i].group.position.distanceTo(p.pos) < radius) this.destroyMine(this.mines[i], 'nova');
    }
    for (let i = this.hunters.length - 1; i >= 0; i--) {
      if (this.hunters[i].group.position.distanceTo(p.pos) < radius) this.damageHunter(this.hunters[i], 3 * this.mods.nova * this.mods.damageMul, 'nova');
    }
    this.bolts.strike(p.pos.clone().add(new THREE.Vector3(-8,0,-8)), p.pos.clone().add(new THREE.Vector3(8,0,8)), 0x9cd8ff, 0.3, 14, 2);
    this.banner('SHIELD COLLAPSE', '护盾破碎 · 新星反应', '量子护盾把最后一点能量还给了虚空。', 'cyan', 1500);
    this.cameraShake = Math.max(this.cameraShake, 0.8);
    audio.pulse();
  }

  revive() {
    const p = this.player;
    const r = this.run;
    r.revives--;
    p.hp = Math.max(1, Math.floor(p.maxHp * 0.48));
    p.shield = p.maxShield;
    p.invuln = 2.6;
    r.combo = 0;
    r.odActive = false;
    r.odTimer = 0;
    r.overdrive = 0;
    this.shockwave(p.pos, 0xffd15c, 18, 0.9);
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.removeProjectile(this.projectiles[i]);
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (this.mines[i].group.position.distanceTo(p.pos) < 20) this.destroyMine(this.mines[i], 'revive');
    }
    this.particles.burst(p.pos, 80, 0xffd15c, { speed: 13, size: 3.5, life: 1.4, drag: 1.2 });
    this.fx.flash = 0.5;
    this.fx.flashColor = 0xffd15c;
    this.cameraShake = 1.0;
    this.banner('SOUL RECONSTRUCTION', '机魂重构', '神经备份已接管机体。这一次，带着记忆继续吞噬。', 'gold', 2600);
    this.feed('机魂备份触发 · 机体已重构。', 'gold');
    audio.revive();
  }

  /* --------------------------------------------------------------------------
     FX
  -------------------------------------------------------------------------- */
  spawnRing(pos, color, startScale, endScale, life) {
    const ring = this.ringFx[this.ringFxCursor++ % this.ringFx.length];
    if (!ring) return;
    ring.active = true;
    ring.mesh.visible = true;
    ring.mesh.position.copy(pos);
    ring.mesh.scale.setScalar(startScale || 1);
    ring.mesh.quaternion.copy(this.camera.quaternion);
    ring.mat.color.set(color || 0x8ffcff);
    ring.mat.opacity = 0.9;
    ring.life = ring.maxLife = life || 0.5;
    ring.startScale = startScale || 1;
    ring.endScale = endScale || 5;
    ring.faceCamera = true;
  }

  ringFxAt(pos, color, start, end, life) { this.spawnRing(pos, color, start, end, life); }

  shockwave(pos, color, radius, life) {
    const s = this.shockFx[this.shockCursor++ % this.shockFx.length];
    if (!s) return;
    s.active = true;
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    s.mesh.scale.setScalar(0.3);
    s.mat.uniforms.uColor.value.set(color || 0x8ffcff);
    s.mat.uniforms.uOpacity.value = 0.9;
    s.life = s.maxLife = life || 0.6;
    s.maxScale = radius || 8;
  }

  updateEffects(dt) {
    for (const r of this.ringFx) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(lerp(r.startScale, r.endScale, t));
      if (r.faceCamera) r.mesh.quaternion.copy(this.camera.quaternion);
      r.mat.opacity = (1 - t) * 0.8;
    }
    for (const s of this.shockFx) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      const t = 1 - s.life / s.maxLife;
      const scale = lerp(0.3, s.maxScale, Math.pow(t, 0.52));
      s.mesh.scale.setScalar(scale);
      s.mat.uniforms.uOpacity.value = (1 - t) * 0.9;
    }
  }

  /* --------------------------------------------------------------------------
     Camera
  -------------------------------------------------------------------------- */
  updateCamera(dt, instant) {
    if (this.mode === 'title' || this.mode === 'meta') return;
    const p = this.player;
    const r = this.run;
    this.cameraIntro = Math.max(0, (this.cameraIntro || 0) - dt * 1.15);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, p.dir);
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(p.dir, right).normalize();
    const bank = clamp(-(this.yawVelocity || 0) * 0.025, -0.15, 0.15);
    this.cameraBank = damp(this.cameraBank || 0, bank, 5, dt);
    up.applyAxisAngle(p.dir, this.cameraBank);
    const speedFactor = clamp((p.speed - 20) / 30, -0.4, 1.2);
    const distance = 14.6 + speedFactor * 1.5 + (this.fx.slow > 0.5 ? 1.0 : 0) + this.cameraIntro * 15;
    const desired = p.pos.clone()
      .addScaledVector(p.dir, -distance)
      .addScaledVector(up, 4.8 + this.cameraIntro * 6)
      .addScaledVector(right, 0.55);
    if (instant) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-5.2 * dt));
    const look = p.pos.clone().addScaledVector(p.dir, 6.0).addScaledVector(up, 1.0);
    if (this.cameraShake > 0.001) {
      const shake = this.cameraShake;
      this.camera.position.x += rand(-1, 1) * shake * 0.6;
      this.camera.position.y += rand(-1, 1) * shake * 0.45;
      this.camera.position.z += rand(-1, 1) * shake * 0.5;
      look.x += rand(-1, 1) * shake * 0.8;
      look.y += rand(-1, 1) * shake * 0.6;
    }
    this.camera.up.copy(up);
    this.camera.lookAt(look);
    const targetFov = 72 + (this.boostActive ? 8 : 0) + (r && r.odActive ? 3 : 0) + (r && r.slowTimer > 0 ? -2 : 0) + this.cameraIntro * 8;
    this.camera.fov = damp(this.camera.fov, targetFov, 3.2, dt);
    this.camera.updateProjectionMatrix();
  }

  /* --------------------------------------------------------------------------
     HUD
  -------------------------------------------------------------------------- */
  _hudRefresh(force) {
    if (!this.player || !this.run) return;
    this.updateHud(force ? 1 : 0.016);
  }

  updateHud(dt) {
    const ui = this.ui;
    if (!ui || !this.run) return;
    this.updateFloaters(dt);
    this.hudTimer = (this.hudTimer || 0) + dt;
    const updateText = this.hudTimer > 0.055;
    if (updateText) this.hudTimer = 0;
    const p = this.player;
    const r = this.run;
    const inGame = this.mode === 'playing' || this.mode === 'paused' || this.mode === 'levelup';
    if (!inGame) return;
    const hpPct = clamp(p.hp / Math.max(1, p.maxHp), 0, 1);
    ui['hp-fill'].style.transform = `scaleX(${hpPct})`;
    ui['hp-fill'].parentElement.classList.toggle('low', hpPct < 0.3);
    ui['thrust-fill'].style.transform = `scaleX(${clamp(p.thrust / Math.max(1, p.maxThrust), 0, 1)})`;
    ui['xp-fill'].style.transform = `scaleX(${clamp(r.xp / Math.max(1, r.xpNeed), 0, 1)})`;
    ui['combo-fill'].style.transform = `scaleX(${clamp(r.comboTimer / Math.max(0.01, r.comboTimerMax), 0, 1)})`;
    const shieldPct = p.maxShield > 0 ? clamp(p.shield / p.maxShield, 0, 1) : 0;
    ui['shield-fill'].style.transform = `scaleX(${shieldPct})`;
    ui['od-fill'].style.width = `${clamp(r.overdrive, 0, 100)}%`;
    this._updateSkillHud();
    if (!updateText) return;

    ui['hp-text'].textContent = Math.ceil(p.hp);
    ui['thrust-text'].textContent = Math.ceil(p.thrust);
    ui['shield-row'].classList.toggle('hidden', p.maxShield <= 0);
    ui['shield-bar'].classList.toggle('hidden', p.maxShield <= 0);
    if (p.maxShield > 0) ui['shield-text'].textContent = `${Math.ceil(p.shield)} / ${Math.ceil(p.maxShield)}`;
    ui['run-time'].textContent = fmtTime(r.time);
    ui['revive-badge'].classList.toggle('hidden', r.revives <= 0);
    ui['revive-badge'].textContent = `机魂备份 ×${r.revives}`;
    ui['level-text'].textContent = pad2(r.level);
    ui['xp-text'].textContent = `${Math.floor(r.xp)} / ${r.xpNeed}`;
    ui['pending-levels'].textContent = r.pendingLevels > 1 ? `+${r.pendingLevels - 1} PENDING` : '';
    ui['score-text'].textContent = fmt(r.score);
    ui['hud-nano'].textContent = fmt(SAVE.nanites);
    ui['coord-x'].textContent = p.pos.x.toFixed(1);
    ui['coord-y'].textContent = p.pos.y.toFixed(1);
    ui['coord-z'].textContent = p.pos.z.toFixed(1);
    ui['speed-text'].textContent = String(Math.round(p.speed)).padStart(3, '0');
    ui['data-text'].textContent = String(Math.floor(r.data)).padStart(3, '0');
    ui['length-text'].textContent = String(p.segments ? p.segments.length : 0).padStart(3, '0');
    ui['combo-text'].textContent = `×${r.combo}`;
    ui['combo-mult'].textContent = `×${(1 + r.combo * 0.06).toFixed(1)}`;
    ui['combo-cluster'].classList.toggle('active', r.combo > 0);
    ui['combo-cluster'].classList.toggle('hot', r.combo > 8);
    ui['combo-tip'].textContent = r.combo > 0 ? '连击窗口正在收缩 · 继续吞噬' : '连续吞噬以提升倍率';
    ui['threat-text'].textContent = roman(r.threat);
    const pips = ui['threat-pips'].children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < Math.ceil(r.threat / 2));
    ui['threat-desc'].textContent = ['边界稳定', '有东西在看你', '猎手信号', '坐标污染', '高危跃迁', '虚空风暴'][Math.min(5, Math.floor((r.threat - 1) / 2))];
    const heading = ((-p.yaw * DEG) % 360 + 360) % 360;
    ui['heading-label'].textContent = `AZ ${String(Math.round(heading)).padStart(3, '0')}°`;
    ui['pitch-label'].textContent = `EL ${p.pitch >= 0 ? '+' : ''}${Math.round(p.pitch * DEG)}°`;
    ui['compass-track'].style.transform = `translateX(${-22 - heading / 360 * 528}px)`;
    ui['alt-text'].textContent = `${p.pos.y >= 0 ? '+' : ''}${Math.round(p.pos.y)}`;
    ui['alt-marker'].style.bottom = `${clamp((p.pos.y + BOUND) / (BOUND * 2), 0, 1) * 100}%`;
    ui['pitch-marker'].style.top = `${clamp(50 - p.pitch / 1.16 * 42, 5, 95)}%`;
    const odActive = r.odActive;
    ui['od-text'].textContent = odActive ? `${Math.ceil(r.odTimer)}s ACTIVE` : `${Math.round(r.overdrive)}%`;
    ui['btn-overdrive'].disabled = !odActive && r.overdrive < 100;
    ui['btn-overdrive'].classList.toggle('ready', !odActive && r.overdrive >= 100);
    ui['od-bar'].classList.toggle('full', !odActive && r.overdrive >= 100);
    const nearest = this._nearestThreatDistance();
    ui['threat-target'].classList.toggle('warn', nearest < 18);
    ui['threat-dist'].textContent = nearest < 900 ? `${nearest.toFixed(0)}m` : '—';
    ui['reticle'].classList.toggle('lock', nearest < 12);
    this._updateBuffs();
    this._drawRadar();
    if (this.mode === 'playing') {
      const time = r.time;
      if (time < 5) ui['hint-text'].textContent = '鼠标控制航向 · A/D 辅助转向 · Y 轴靠俯仰';
      else if (time < 11) ui['hint-text'].textContent = '吞噬数据 → 升级突变 · Q 清除弹幕 · E 减缓时间';
      else if (time < 17) ui['hint-text'].textContent = 'SPACE 折跃 · W 消耗推进剂加速 · R 超载';
      else ui['hint-text'].textContent = '尾巴会杀死你 · 边界会反弹你 · 贪婪会进化你';
    }
  }

  _updateSkillHud() {
    const ui = this.ui;
    for (const id of ['dash', 'pulse', 'chrono']) {
      const skill = this.skills[id];
      const pct = skill.cdMax > 0 ? clamp(skill.cd / skill.cdMax, 0, 1) * 100 : 0;
      const el = ui[`cd-${id}`];
      const text = ui[`cd-text-${id}`];
      if (el) el.style.setProperty('--p', `${pct}%`);
      if (text) text.textContent = skill.cd > 0.05 ? Math.ceil(skill.cd) : '';
      const button = document.querySelector(`.skill[data-skill="${id}"]`);
      if (button) {
        button.classList.toggle('ready', skill.cd <= 0.05);
        button.classList.toggle('active', id === 'chrono' && this.run.slowTimer > 0);
        button.classList.toggle('locked', skill.cd > 0.05);
      }
      const lv = ui[`skill-lv-${id}`];
      if (lv) {
        const level = this.run.cards[id === 'dash' ? 'dashNova' : id === 'pulse' ? 'pulse' : 'chrono'] || 0;
        lv.textContent = level ? `+${roman(level)}` : '';
      }
    }
  }

  _updateBuffs() {
    const r = this.run;
    const p = this.player;
    const m = this.mods;
    const buffs = [];
    if (r.slowTimer > 0) buffs.push(`<span class="buff time"><i></i>时间琥珀 ${r.slowTimer.toFixed(1)}s</span>`);
    if (r.odActive) buffs.push(`<span class="buff od"><i></i>超载 ${r.odTimer.toFixed(1)}s</span>`);
    if (p.shield > 0) buffs.push(`<span class="buff shield"><i></i>护盾 ${Math.ceil(p.shield)}</span>`);
    if (r.revives > 0) buffs.push(`<span class="buff"><i></i>机魂备份 ×${r.revives}</span>`);
    if (m.chainLevel > 0) buffs.push(`<span class="buff"><i></i>连锁 ${r.chainCounter}/${m.chainEvery}</span>`);
    const sig = buffs.join('');
    if (sig !== this._buffSig) {
      this._buffSig = sig;
      this.ui.buffs.innerHTML = sig;
    }
  }

  _nearestThreatDistance() {
    let best = 9999;
    for (const mine of this.mines) best = Math.min(best, mine.group.position.distanceTo(this.player.pos));
    for (const hunter of this.hunters) best = Math.min(best, hunter.group.position.distanceTo(this.player.pos));
    for (const proj of this.projectiles) best = Math.min(best, proj.group.position.distanceTo(this.player.pos));
    return best;
  }

  /* --------------------------------------------------------------------------
     Radar and floating text
  -------------------------------------------------------------------------- */
  _drawRadar() {
    const canvas = this.ui['radar'];
    if (!canvas) return;
    const dprScale = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = Math.max(80, Math.round(canvas.getBoundingClientRect().width || 184));
    if (canvas.width !== Math.round(cssSize * dprScale)) {
      canvas.width = canvas.height = Math.round(cssSize * dprScale);
    }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const scale = W / cssSize;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 4 * scale);
    const s = 1.02 * scale;
    const project = (v) => {
      const x = clamp(v.x, -BOUND, BOUND), y = clamp(v.y, -BOUND, BOUND), z = clamp(v.z, -BOUND, BOUND);
      return { x: (x - z) * 0.7 * s, y: ((x + z) * 0.34 - y * 0.55) * s };
    };
    ctx.strokeStyle = 'rgba(52,155,184,.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 0, i * 25 * scale, 0, TAU); ctx.stroke(); }
    const e = BOUND;
    const corners = [
      [-e,-e,-e],[ e,-e,-e],[ e, e,-e],[-e, e,-e],
      [-e,-e, e],[ e,-e, e],[ e, e, e],[-e, e, e]
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    ctx.strokeStyle = 'rgba(63,185,219,.2)';
    for (const edge of edges) {
      const pa = project(new THREE.Vector3(...corners[edge[0]]));
      const pb = project(new THREE.Vector3(...corners[edge[1]]));
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(49,133,156,.12)';
    for (let i = -BOUND; i <= BOUND; i += BOUND / 2) {
      let a = project(new THREE.Vector3(i, -BOUND, -BOUND));
      let b = project(new THREE.Vector3(i, -BOUND, BOUND));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = project(new THREE.Vector3(-BOUND, -BOUND, i));
      b = project(new THREE.Vector3(BOUND, -BOUND, i));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const t = this.time;
    ctx.save();
    ctx.rotate(t * 0.55);
    const sweepGrad = ctx.createLinearGradient(0, 0, 74 * scale, 0);
    sweepGrad.addColorStop(0, 'rgba(51,235,255,.22)');
    sweepGrad.addColorStop(1, 'rgba(51,235,255,0)');
    ctx.strokeStyle = sweepGrad;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(74 * scale, 0); ctx.stroke();
    ctx.restore();
    for (const f of this.foods) {
      if (!f.alive) continue;
      const pos = project(f.anchor);
      ctx.fillStyle = f.type === 'elite' ? '#ff4ed6' : f.type === 'rare' ? '#ffd15c' : f.type === 'unstable' ? '#69ffb3' : '#30dfe8';
      ctx.globalAlpha = 0.62;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, (f.type === 'common' ? 1.4 : 2.2) * scale, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const mine of this.mines) {
      const pos = project(mine.group.position);
      ctx.strokeStyle = '#ff4b68';
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(pos.x - 2.3 * scale, pos.y - 2.3 * scale); ctx.lineTo(pos.x + 2.3 * scale, pos.y + 2.3 * scale);
      ctx.moveTo(pos.x + 2.3 * scale, pos.y - 2.3 * scale); ctx.lineTo(pos.x - 2.3 * scale, pos.y + 2.3 * scale);
      ctx.stroke();
    }
    for (const hunter of this.hunters) {
      const pos = project(hunter.group.position);
      const elite = hunter.data && hunter.data.elite;
      ctx.strokeStyle = elite ? '#ffd15c' : '#ff8d6a';
      ctx.lineWidth = 1.2 * scale;
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(Math.PI / 4);
      const rr = (elite ? 4 : 3) * scale;
      ctx.strokeRect(-rr, -rr, rr * 2, rr * 2); ctx.restore();
    }
    for (const proj of this.projectiles) {
      const pos = project(proj.group.position);
      ctx.fillStyle = '#ffb45c';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.2 * scale, 0, TAU); ctx.fill();
    }
    const pp = project(this.player.pos);
    const dir = this.player.dir;
    const tip = project(new THREE.Vector3(this.player.pos.x + dir.x * 7, this.player.pos.y + dir.y * 7, this.player.pos.z + dir.z * 7));
    ctx.strokeStyle = 'rgba(180,255,255,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.save();
    ctx.translate(pp.x, pp.y);
    const ang = Math.atan2(tip.y - pp.y, tip.x - pp.x);
    ctx.rotate(ang);
    ctx.fillStyle = '#dcffff';
    ctx.beginPath();
    ctx.moveTo(6 * scale, 0); ctx.lineTo(-3.5 * scale, -3.6 * scale); ctx.lineTo(-1.5 * scale, 0); ctx.lineTo(-3.5 * scale, 3.6 * scale);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    const top = project(new THREE.Vector3(this.player.pos.x, BOUND, this.player.pos.z));
    const bottom = project(new THREE.Vector3(this.player.pos.x, -BOUND, this.player.pos.z));
    ctx.strokeStyle = 'rgba(104,240,255,.28)';
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke();
    ctx.fillStyle = '#eaffff';
    ctx.beginPath(); ctx.arc(top.x, top.y, 1.4 * scale, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.font = `${7 * scale}px "Cascadia Mono", monospace`;
    ctx.fillStyle = 'rgba(87,134,150,.8)';
    ctx.fillText('XZ / ISO', 7 * scale, 11 * scale);
    ctx.fillStyle = 'rgba(100,207,225,.62)';
    ctx.fillText(`Y ${Math.round(this.player.pos.y)}`, W - 38 * scale, H - 7 * scale);
  }

  floater(text, worldPos, kind) {
    const el = document.createElement('div');
    el.className = 'floater ' + (kind === 'damage' ? 'damage' : kind === 'epic' ? 'epic' : kind === 'rare' ? 'rare' : kind === 'system' ? 'system' : '');
    el.textContent = text;
    this.ui.floaters.appendChild(el);
    const arr = this._floaters || (this._floaters = []);
    arr.push({ el, pos: worldPos.clone().add(new THREE.Vector3(rand(-1,1), rand(1,2), rand(-1,1))), life: 0, maxLife: 1.1, drift: rand(-10, 10) });
    if (arr.length > 22) {
      const old = arr.shift();
      if (old && old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  updateFloaters(dt) {
    const arr = this._floaters;
    if (!arr || !arr.length) return;
    const v = new THREE.Vector3();
    for (let i = arr.length - 1; i >= 0; i--) {
      const f = arr[i];
      f.life += dt;
      if (f.life >= f.maxLife) {
        if (f.el.parentNode) f.el.parentNode.removeChild(f.el);
        arr.splice(i, 1);
        continue;
      }
      f.pos.y += dt * 1.9;
      v.copy(f.pos).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * this.width;
      const y = (-v.y * 0.5 + 0.5) * this.height;
      const visible = v.z < 1 && v.z > -1;
      f.el.style.opacity = visible ? String(1 - Math.pow(f.life / f.maxLife, 2.2)) : '0';
      f.el.style.transform = `translate3d(${x + f.drift * (f.life / f.maxLife)}px, ${y}px, 0) translate(-50%,-50%) scale(${1 + f.life * 0.15})`;
    }
  }

  /* --------------------------------------------------------------------------
     Toasts / feed / banner
  -------------------------------------------------------------------------- */
  toast(text, kind, duration) {
    if (!this.ui || !this.ui.toasts) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = text;
    this.ui.toasts.appendChild(el);
    while (this.ui.toasts.children.length > 4) this.ui.toasts.removeChild(this.ui.toasts.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    }, duration || 3600);
  }

  feed(text, kind) {
    if (!this.ui || !this.ui['event-feed']) return;
    const el = document.createElement('div');
    el.className = 'feed-item ' + (kind || '');
    el.innerHTML = '<i></i><span>' + text + '</span>';
    this.ui['event-feed'].appendChild(el);
    while (this.ui['event-feed'].children.length > 4) this.ui['event-feed'].removeChild(this.ui['event-feed'].firstChild);
    setTimeout(() => {
      if (el.parentNode) {
        el.style.transition = 'opacity .5s';
        el.style.opacity = '0';
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 520);
      }
    }, 6500);
  }

  banner(kicker, title, desc, kind, duration) {
    const el = this.ui['banner'];
    if (!el) return;
    this.ui['banner-kicker'].textContent = kicker || 'SYSTEM';
    this.ui['banner-title'].textContent = title || '';
    this.ui['banner-desc'].textContent = desc || '';
    el.className = 'banner show ' + (kind || '');
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { if (el) el.classList.remove('show'); }, duration || 2200);
  }

  /* --------------------------------------------------------------------------
     Small glue / compatibility
  -------------------------------------------------------------------------- */
  _updateCamera(dt, instant) { this.updateCamera(dt, instant); }

  checkMineImpact() {
    const p = this.player;
    if (p.invuln > 0) return;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      if (!mine.data) continue;
      if (mine.group.position.distanceToSquared(p.pos) < 6.8) {
        const pos = mine.group.position.clone();
        this.destroyMine(mine, 'impact');
        this.particles.burst(pos, 26, 0xffa36b, { speed: 8, size: 2.6, life: 0.8 });
        this.applyDamage(12 + this.run.threat, '虚空雷区');
        this.cameraShake = Math.max(this.cameraShake, 1.0);
        break;
      }
    }
  }

  /* --------------------------------------------------------------------------
     Boot
  -------------------------------------------------------------------------- */
  boot() {}
}

/* ----------------------------------------------------------------------------
   7. Cosmetic helper generators
---------------------------------------------------------------------------- */
function makeLabelSprite(text, color, scale) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = '600 54px Bahnschrift, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#' + new THREE.Color(color).getHexString();
  g.shadowBlur = 18;
  g.fillStyle = '#ffffff';
  g.fillText(text, 64, 66);
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.globalAlpha = 0.55;
  g.fillText(text, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 1.2, scale * 1.2, 1);
  return sprite;
}

function makeNebulaTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,.62)');
  grad.addColorStop(0.35, 'rgba(210,220,255,.22)');
  grad.addColorStop(0.7, 'rgba(120,140,255,.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    const x = rand(60, size - 60);
    const y = rand(60, size - 60);
    const r = rand(12, 95);
    const cloud = g.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, `rgba(255,255,255,${rand(0.015, 0.07).toFixed(3)})`);
    cloud.addColorStop(0.55, `rgba(170,190,255,${rand(0.008, 0.035).toFixed(3)})`);
    cloud.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cloud;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.12, 0.5).toFixed(2)})`;
    const x = rand(20, size - 20), y = rand(20, size - 20);
    g.beginPath(); g.arc(x, y, rand(0.4, 1.4), 0, TAU); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ----------------------------------------------------------------------------
   8. Ignition
---------------------------------------------------------------------------- */
try {
  const game = new VoidSerpent();
  window.__VOID_SERPENT__ = game;
  window.VOID_SERPENT_BOOT = false;
} catch (err) {
  console.error('[VOID SERPENT] Boot failure:', err);
  const fatal = document.getElementById('webgl-error');
  if (fatal) {
    fatal.classList.remove('hidden');
    const p = fatal.querySelector('p');
    if (p) p.textContent = '神经链接初始化失败：' + (err && err.message ? err.message : String(err));
  }
  const boot = document.getElementById('boot');
  if (boot) boot.classList.add('hidden');
}
})();
