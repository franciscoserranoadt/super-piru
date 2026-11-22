/* =========================================================
   SÚPER PIRU — juego de plataformas original
   Todo se dibuja con vectores a la resolución nativa del móvil
   ========================================================= */
'use strict';

const T = 32;          // tamaño de casilla en unidades de mundo
const ROWS = 15;       // filas visibles / altura de los niveles
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, TS = 32, S = 1, OY = 0, VIEWW = 20;

/* ---------- Guardado (Android o navegador) ---------- */
const Store = {
  get(k, d) {
    try {
      let v = null;
      if (window.Android && Android.load) v = Android.load(k);
      else v = localStorage.getItem(k);
      return (v === null || v === undefined || v === '') ? d : JSON.parse(v);
    } catch (e) { return d; }
  },
  set(k, v) {
    try {
      const s = JSON.stringify(v);
      if (window.Android && Android.save) Android.save(k, s); else localStorage.setItem(k, s);
    } catch (e) {}
  }
};
function vibrate(ms) { try { if (window.Android && Android.vibrate) Android.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

const save = Object.assign({ unlocked: 1, best: [0, 0, 0, 0], music: true, sfx: true }, Store.get('superpiru', {}));
function persist() { Store.set('superpiru', save); }

/* ---------- Sonido (sintetizado, sin archivos) ---------- */
const AU = {
  ac: null, master: null, mus: null, nextT: 0, step: 0, theme: -1,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ac.destination);
      this.mus = this.ac.createGain(); this.mus.gain.value = save.music ? 0.32 : 0; this.mus.connect(this.master);
      this.sfxG = this.ac.createGain(); this.sfxG.gain.value = save.sfx ? 1 : 0; this.sfxG.connect(this.master);
    } catch (e) { this.ac = null; }
  },
  tone(f, d, type = 'square', v = 0.15, f2 = 0, delay = 0, out) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(out || this.sfxG); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, v = 0.2, delay = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay, n = Math.floor(this.ac.sampleRate * d);
    const b = this.ac.createBuffer(1, n, this.ac.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(), g = this.ac.createGain(), fl = this.ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 1800; s.buffer = b; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(this.sfxG); s.start(t);
  },
  sfx(n) {
    if (!this.ac) return;
    switch (n) {
      case 'jump': this.tone(330, 0.16, 'square', 0.1, 700); break;
      case 'coin': this.tone(988, 0.08, 'square', 0.09); this.tone(1319, 0.28, 'square', 0.09, 0, 0.07); break;
      case 'stomp': this.tone(260, 0.12, 'square', 0.14, 90); break;
      case 'bump': this.tone(140, 0.1, 'triangle', 0.25, 80); break;
      case 'break': this.noise(0.25, 0.35); this.tone(200, 0.15, 'square', 0.08, 60); break;
      case 'item': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'square', 0.08, 0, i * 0.06)); break;
      case 'power': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.09, 0, i * 0.07)); break;
      case 'fire': this.tone(900, 0.08, 'sawtooth', 0.06, 300); break;
      case 'kick': this.tone(500, 0.08, 'square', 0.12, 900); break;
      case 'hurt': this.tone(500, 0.35, 'sawtooth', 0.1, 120); break;
      case 'die': [523, 494, 466, 440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.16, 'square', 0.1, 0, 0.3 + i * 0.13)); break;
      case 'up': [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, 0, i * 0.08)); break;
      case 'flag': [392, 523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.09, 0, i * 0.1)); break;
      case 'boss': this.tone(120, 0.4, 'sawtooth', 0.18, 50); this.noise(0.3, 0.3); break;
      case 'select': this.tone(660, 0.07, 'square', 0.08); this.tone(990, 0.1, 'square', 0.08, 0, 0.06); break;
      case 'pause': this.tone(784, 0.08, 'square', 0.08); this.tone(523, 0.12, 'square', 0.08, 0, 0.08); break;
    }
  },
  // Melodías originales (notas MIDI, 0 = silencio). 32 corcheas por vuelta
  songs: [
    { bpm: 150, w: 'square', m: [72,0,76,79, 76,0,77,81, 79,0,0,76, 79,84,83,81, 79,0,77,76, 74,0,72,74, 76,79,77,74, 72,0,0,0],
      b: [48,0,55,0, 53,0,57,0, 48,0,55,0, 53,0,55,0, 52,0,55,0, 50,0,53,0, 55,0,53,0, 48,0,43,0] },
    { bpm: 112, w: 'triangle', m: [69,0,72,0, 76,0,74,72, 71,0,0,0, 68,0,71,0, 69,0,72,0, 76,0,79,77, 76,0,0,0, 0,0,74,0],
      b: [45,0,0,45, 0,0,45,0, 40,0,0,40, 0,0,40,0, 41,0,0,41, 0,0,41,0, 40,0,0,40, 0,44,0,0] },
    { bpm: 140, w: 'square', m: [77,0,81,84, 0,81,0,77, 79,0,82,86, 0,82,0,79, 81,84,89,0, 88,86,84,0, 82,81,79,77, 76,0,77,0],
      b: [53,0,60,0, 53,0,60,0, 55,0,62,0, 55,0,62,0, 57,0,64,0, 57,0,64,0, 58,0,60,0, 48,0,53,0] },
    { bpm: 160, w: 'sawtooth', m: [62,0,62,65, 0,62,69,0, 68,0,65,0, 62,0,61,0, 62,0,62,65, 0,62,70,0, 69,0,65,62, 61,0,0,0],
      b: [38,38,0,38, 38,0,38,0, 37,37,0,37, 37,0,37,0, 34,34,0,34, 34,0,34,0, 33,33,0,33, 33,0,45,0] },
    { bpm: 132, w: 'square', m: [76,0,79,0, 84,0,83,81, 79,0,76,0, 77,79,81,0, 79,0,76,72, 74,0,76,0, 72,0,0,0, 0,0,0,0],
      b: [48,0,55,0, 52,0,55,0, 53,0,57,0, 53,0,55,0, 48,0,52,0, 55,0,43,0, 48,0,0,0, 0,0,0,0] }
  ],
  playSong(i) { this.theme = i; this.step = 0; if (this.ac) this.nextT = this.ac.currentTime + 0.05; },
  stopSong() { this.theme = -1; },
  tick() {
    if (!this.ac || this.theme < 0) return;
    const s = this.songs[this.theme], dt = 60 / s.bpm / 2;
    if (this.nextT < this.ac.currentTime - 0.3) this.nextT = this.ac.currentTime + 0.02;
    while (this.nextT < this.ac.currentTime + 0.15) {
      const i = this.step % 32, m = s.m[i], b = s.b[i];
      const mf = n => 440 * Math.pow(2, (n - 69) / 12);
      const t0 = this.nextT - this.ac.currentTime;
      if (m) this.tone(mf(m), dt * 0.9, s.w, 0.09, 0, t0, this.mus);
      if (b) this.tone(mf(b), dt * 0.95, 'triangle', 0.22, 0, t0, this.mus);
      this.nextT += dt; this.step++;
    }
  },
  setMusic(on) { save.music = on; persist(); if (this.mus) this.mus.gain.value = on ? 0.32 : 0; },
  setSfx(on) { save.sfx = on; persist(); if (this.sfxG) this.sfxG.gain.value = on ? 1 : 0; }
};

/* ---------- Utilidades ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* ---------- Temas visuales ---------- */
const THEMES = [
  { name: 'Pradera Dulce', sky: ['#5fb8ff', '#bfe7ff'], dirt: '#c27740', dirt2: '#94522a', top: '#62d13d', top2: '#3c9c25', song: 0 },
  { name: 'Cueva de Cristal', sky: ['#120a24', '#33204f'], dirt: '#5d4590', dirt2: '#3d2c66', top: '#9f84e6', top2: '#7058b8', song: 1 },
  { name: 'Reino de las Nubes', sky: ['#ff9f8b', '#ffd9a8'], dirt: '#f4f7ff', dirt2: '#cfdaf5', top: '#ffffff', top2: '#e3ebff', song: 2 },
  { name: 'Castillo de Chicle', sky: ['#160707', '#481212'], dirt: '#6c6a7a', dirt2: '#47465a', top: '#8c8a9c', top2: '#5d5b70', song: 3 }
];

/* ---------- Constructor de niveles ---------- */
function mk(w, theme, time) {
  const g = []; for (let y = 0; y < ROWS; y++) g.push(new Array(w).fill(' '));
  return { w, theme, time, g, ents: [], start: 3, cp: 0, flag: 0 };
}
function fill(L, x0, x1, y0, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < L.w && y >= 0 && y < ROWS) L.g[y][x] = ch; }
const gnd = (L, x0, x1, top = 13) => fill(L, x0, x1, top, 14, '#');
function put(L, x, y, s) { for (let i = 0; i < s.length; i++) if (s[i] !== '.') L.g[y][x + i] = s[i]; }
const en = (L, t, x, y, o) => L.ents.push(Object.assign({ t, x, y }, o || {}));
function column(L, x, h, top = 13) { fill(L, x, x + 1, top - h + 1, top - 1, 'C'); fill(L, x, x + 1, top - h, top - h, 'c'); }
function stairsUp(L, x, n, base = 13) { for (let i = 0; i < n; i++) fill(L, x + i, x + i, base - 1 - i, base - 1, 'X'); }
function stairsDown(L, x, n, base = 13) { for (let i = 0; i < n; i++) fill(L, x + i, x + i, base - n + i, base - 1, 'X'); }
function coinsRow(L, x, y, n) { for (let i = 0; i < n; i++) en(L, 'o', x + i, y); }
function coinArc(L, x, y, n) { for (let i = 0; i < n; i++) en(L, 'o', x + i, y - Math.round(Math.sin(i / (n - 1) * Math.PI) * 2)); }

function buildLevels() {
  const Ls = [];
  // ---------- 1. Pradera Dulce ----------
  let L = mk(215, 0, 300);
  gnd(L, 0, 68); gnd(L, 71, 86); gnd(L, 90, 142); gnd(L, 145, 214);
  put(L, 15, 9, '?'); put(L, 19, 9, 'BMB?B'); put(L, 21, 5, '?');
  column(L, 28, 2); column(L, 38, 3); column(L, 46, 4); column(L, 57, 4);
  en(L, 'g', 23, 12); en(L, 'g', 41, 12); en(L, 'g', 51, 12); en(L, 'g', 53, 12);
  coinArc(L, 66, 10, 7);
  put(L, 76, 9, 'B?B'); put(L, 79, 5, 'BBBBBBBB'); en(L, 'g', 81, 4); en(L, 'g', 83, 4);
  put(L, 92, 5, 'BBB?'); put(L, 95, 9, '$');
  en(L, 'g', 98, 12); en(L, 'g', 100, 12);
  put(L, 103, 9, 'BB'); en(L, 'k', 108, 12);
  put(L, 111, 9, '?..?..?'); put(L, 114, 5, 'M');
  put(L, 120, 9, 'B'); put(L, 122, 5, 'BBB'); put(L, 127, 5, 'B??B'); put(L, 128, 9, 'BB');
  en(L, 'g', 116, 12); en(L, 'g', 118, 12); en(L, 'g', 124, 12); en(L, 'g', 126, 12);
  stairsUp(L, 132, 4); stairsDown(L, 138, 4);
  coinArc(L, 141, 7, 6);
  stairsUp(L, 146, 4); stairsDown(L, 152, 4);
  column(L, 160, 2); put(L, 165, 9, 'BB?B'); en(L, 'k', 170, 12); en(L, 'g', 172, 12);
  column(L, 176, 2);
  stairsUp(L, 180, 8); fill(L, 188, 188, 5, 12, 'X');
  L.flag = 197; L.cp = 100;
  Ls.push(L);

  // ---------- 2. Cueva de Cristal ----------
  L = mk(205, 1, 300);
  fill(L, 0, 204, 0, 1, '#');
  gnd(L, 0, 40); gnd(L, 44, 70); gnd(L, 74, 75); gnd(L, 79, 120); gnd(L, 125, 204);
  put(L, 10, 9, 'BMBB'); en(L, 'g', 14, 12); en(L, 'g', 16, 12);
  fill(L, 20, 22, 10, 12, 'X'); put(L, 26, 7, 'B$BBB'); en(L, 'b', 28, 9);
  column(L, 34, 3); en(L, 's', 38, 12);
  coinArc(L, 40, 10, 5);
  put(L, 47, 9, '----'); put(L, 53, 6, '-----'); coinsRow(L, 53, 5, 5); en(L, 'b', 50, 8); en(L, 'b', 58, 7);
  en(L, 'k', 60, 12); en(L, 'g', 64, 12);
  fill(L, 66, 70, 2, 8, 'B'); put(L, 68, 8, 'M');
  put(L, 72, 9, '--'); put(L, 76, 9, '--');
  fill(L, 82, 83, 9, 12, 'X'); en(L, 's', 87, 12); en(L, 's', 92, 12);
  put(L, 88, 8, 'B?B?B'); put(L, 95, 5, '1');
  fill(L, 98, 99, 2, 9, 'B'); en(L, 'b', 104, 9); en(L, 'b', 109, 7);
  put(L, 103, 9, 'BBBBBB'); coinsRow(L, 103, 8, 6);
  en(L, 'g', 112, 12); en(L, 'g', 114, 12); en(L, 'k', 117, 12);
  put(L, 121, 9, '---'); coinsRow(L, 121, 8, 3);
  column(L, 130, 3); column(L, 136, 4); en(L, 's', 133, 12); en(L, 'b', 140, 7);
  put(L, 144, 9, 'B?MB'); en(L, 'g', 148, 12); en(L, 'g', 150, 12); en(L, 'g', 152, 12);
  fill(L, 156, 157, 10, 12, 'X'); fill(L, 162, 163, 8, 12, 'X'); fill(L, 168, 169, 10, 12, 'X');
  en(L, 'b', 160, 6); en(L, 'b', 166, 6); en(L, 's', 172, 12);
  stairsUp(L, 176, 6);
  L.flag = 188; L.cp = 100;
  Ls.push(L);

  // ---------- 3. Reino de las Nubes ----------
  L = mk(215, 2, 300);
  gnd(L, 0, 22); gnd(L, 30, 44); gnd(L, 55, 62); gnd(L, 80, 96); gnd(L, 108, 112); gnd(L, 128, 146); gnd(L, 160, 214);
  put(L, 12, 9, '?M?'); en(L, 'g', 18, 12);
  en(L, 'm', 24, 11, { dx: 3 }); coinsRow(L, 24, 9, 4);
  put(L, 34, 9, 'BB$BB'); en(L, 'k', 40, 12); en(L, 'b', 38, 6);
  put(L, 46, 10, '---'); put(L, 50, 8, '---'); coinsRow(L, 50, 7, 3);
  en(L, 'g', 58, 12); en(L, 'g', 60, 12);
  en(L, 'm', 64, 11, { dx: 4 }); en(L, 'm', 72, 8, { dy: 3 }); coinArc(L, 66, 8, 8);
  put(L, 84, 9, 'B?B?B'); put(L, 86, 5, 'M'); en(L, 'k', 90, 12); en(L, 'g', 93, 12);
  put(L, 99, 10, '---'); put(L, 103, 8, '---'); en(L, 'b', 101, 6);
  put(L, 110, 9, '1');
  en(L, 'm', 114, 10, { dx: 4 }); en(L, 'b', 118, 7); en(L, 'm', 122, 8, { dy: 3 });
  coinsRow(L, 115, 7, 6);
  column(L, 132, 3); en(L, 'g', 136, 12); en(L, 's', 140, 12); column(L, 143, 4);
  put(L, 148, 9, '---'); put(L, 152, 7, '---'); put(L, 156, 9, '---'); en(L, 'b', 152, 5); coinsRow(L, 152, 6, 3);
  put(L, 165, 9, 'BMB'); en(L, 'k', 170, 12); en(L, 'g', 173, 12); en(L, 'g', 175, 12);
  stairsUp(L, 180, 7);
  L.flag = 195; L.cp = 108;
  Ls.push(L);

  // ---------- 4. Castillo de Chicle ----------
  L = mk(200, 3, 360);
  fill(L, 0, 199, 0, 2, '#');
  gnd(L, 0, 24); fill(L, 25, 28, 13, 14, 'L'); gnd(L, 29, 44); fill(L, 45, 50, 13, 14, 'L'); gnd(L, 51, 74);
  fill(L, 75, 79, 13, 14, 'L'); gnd(L, 80, 104); fill(L, 105, 110, 13, 14, 'L'); gnd(L, 111, 199);
  put(L, 8, 9, 'BMB'); en(L, 'g', 14, 12);
  fill(L, 18, 18, 10, 12, 'X'); en(L, 'r', 18, 9, { sp: 1.6 });
  put(L, 26, 9, '-'); en(L, 'g', 33, 12); en(L, 's', 38, 12);
  fill(L, 40, 41, 10, 12, 'X'); en(L, 'r', 40, 10, { sp: -1.6, n: 5 });
  put(L, 46, 9, '--'); put(L, 49, 7, '-');
  put(L, 56, 8, 'B?B?B'); en(L, 's', 60, 12); en(L, 'g', 64, 12); en(L, 'r', 68, 10, { sp: 2.2, n: 7 }); fill(L, 68, 68, 11, 12, 'X');
  en(L, 'm', 75, 11, { dx: 2 });
  fill(L, 86, 87, 3, 9, 'X'); en(L, 'r', 87, 10, { sp: -2, n: 5 });
  en(L, 'k', 92, 12); en(L, 's', 97, 12); put(L, 94, 8, 'M');
  en(L, 'm', 106, 10, { dx: 2 });
  fill(L, 116, 116, 10, 12, 'X'); en(L, 'r', 116, 9, { sp: 2.4, n: 6 }); en(L, 'g', 120, 12); en(L, 'g', 122, 12);
  put(L, 126, 9, 'B$B');
  // Sala del jefe
  fill(L, 134, 134, 3, 9, 'X');
  en(L, 'boss', 150, 11);
  fill(L, 168, 168, 3, 12, 'W');
  L.flag = 182; L.cp = 111; L.bossGate = 168;
  Ls.push(L);
  return Ls;
}
let LEVELS = buildLevels();

/* ---------- Estado del juego ---------- */
let state = 'title', stateT = 0;
let lvlIndex = 0, lvl = null, grid = null;
let camX = 0, P = null, ents = [], parts = [], pops = [], bumps = [];
let score = 0, coins = 0, lives = 3, timeLeft = 300, cpReached = false, menuSel = 0;
let shake = 0, flash = 0, bossDead = false, timeT = 0;
const tileCache = {};

function isSolid(ch) { return ch === '#' || ch === 'B' || ch === '?' || ch === 'M' || ch === 'X' || ch === 'E' || ch === 'C' || ch === 'c' || ch === 'W' || ch === '$' || ch === '1'; }
function tileAt(tx, ty) {
  if (tx < 0 || tx >= lvl.w) return 'X';
  if (ty < 0 || ty >= ROWS) return ' ';
  return grid[ty][tx];
}

/* ---------- Pantalla ---------- */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 4);
  W = Math.round(window.innerWidth * DPR); H = Math.round(window.innerHeight * DPR);
  cv.width = W; cv.height = H;
  TS = Math.floor(H / ROWS); S = TS / T; OY = H - TS * ROWS; VIEWW = W / S;
  for (const k in tileCache) delete tileCache[k];
  layoutButtons();
}
window.addEventListener('resize', resize);

/* ---------- Dibujo de casillas (se generan una vez a la resolución real) ---------- */
function getTile(key, theme, draw) {
  const k = key + theme;
  if (tileCache[k]) return tileCache[k];
  const c = document.createElement('canvas'); c.width = TS; c.height = TS;
  const g = c.getContext('2d'); g.scale(S, S); draw(g, THEMES[theme]);
  tileCache[k] = c; return c;
}
function bevel(g, base, light, dark, r = 3) {
  g.fillStyle = dark; rr(g, 0, 0, 32, 32, r); g.fill();
  g.fillStyle = light; rr(g, 0, 0, 30, 30, r); g.fill();
  g.fillStyle = base; rr(g, 2, 2, 27, 27, r - 1); g.fill();
}
const TILE_DRAW = {
  groundFill(g, th) {
    g.fillStyle = th.dirt; g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 7; i++) { g.fillStyle = th.dirt2; const x = hash(i, 3) * 28, y = hash(i, 9) * 28; rr(g, x, y, 4 + hash(i, 1) * 4, 3 + hash(i, 2) * 3, 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, 32, 2);
  },
  groundTop(g, th) {
    TILE_DRAW.groundFill(g, th);
    g.fillStyle = th.top2; g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 0); g.lineTo(32, 11);
    for (let x = 32; x >= 0; x -= 4) g.lineTo(x, 9 + ((x / 4) % 2) * 3);
    g.closePath(); g.fill();
    g.fillStyle = th.top; g.fillRect(0, 0, 32, 7);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, 32, 2);
  },
  brick(g) {
    g.fillStyle = '#7a3415'; g.fillRect(0, 0, 32, 32);
    const b = (x, y, w) => { g.fillStyle = '#c8602c'; g.fillRect(x + 1, y + 1, w - 2, 14); g.fillStyle = '#e0814a'; g.fillRect(x + 1, y + 1, w - 2, 3); g.fillStyle = '#9c4520'; g.fillRect(x + 1, y + 12, w - 2, 3); };
    b(0, 0, 16); b(16, 0, 16); b(-8, 16, 16); b(8, 16, 16); b(24, 16, 16);
  },
  qbox(g, f) {
    bevel(g, '#ffb81c', '#ffe38a', '#a8650a', 5);
    const sh = [0, 0.15, 0.3][f];
    g.fillStyle = 'rgba(255,255,255,' + (0.15 + sh) + ')'; g.fillRect(4, 4, 23, 5);
    g.fillStyle = '#a8650a'; [[5, 5], [25, 5], [5, 25], [25, 25]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); });
    // caramelo en espiral
    g.save(); g.translate(16, 16);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 8.5, 0, 7); g.fill();
    g.strokeStyle = '#ff4f8b'; g.lineWidth = 2.6; g.beginPath();
    for (let t = 0; t < 12.5; t += 0.2) { const r = t / 12.5 * 7.5; g.lineTo(Math.cos(t + f) * r, Math.sin(t + f) * r); }
    g.stroke(); g.restore();
  },
  used(g) { bevel(g, '#8a5a32', '#b07a4c', '#4e2f17', 4); g.fillStyle = '#6d4426'; [[6, 6], [24, 6], [6, 24], [24, 24]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }); },
  hard(g, th) { bevel(g, th === THEMES[3] ? '#5d5b70' : '#9a8c7c', th === THEMES[3] ? '#8b89a0' : '#c9bba8', th === THEMES[3] ? '#2f2e3c' : '#5c5046', 3); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(6, 15, 20, 2); g.fillRect(15, 6, 2, 20); },
  colBody(g) {
    g.fillStyle = '#fff'; g.fillRect(2, 0, 28, 32);
    g.save(); g.beginPath(); g.rect(2, 0, 28, 32); g.clip(); g.fillStyle = '#ff3d6e';
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(32, i * 16 + 16); g.lineTo(32, i * 16 + 24); g.lineTo(0, i * 16 + 8); g.fill(); }
    g.restore();
    const gr = g.createLinearGradient(2, 0, 30, 0); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(2, 0, 28, 32);
  },
  colTop(g) {
    TILE_DRAW.colBody(g);
    g.fillStyle = '#d91e50'; rr(g, 0, 0, 32, 12, 4); g.fill();
    g.fillStyle = '#ff7a9e'; rr(g, 1, 1, 30, 5, 3); g.fill();
  },
  oneway(g, th) {
    if (th === THEMES[2]) {
      g.fillStyle = '#ffffff'; [[6, 8, 8], [16, 6, 10], [26, 8, 8]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
      g.fillStyle = '#dbe5ff'; g.fillRect(0, 10, 32, 4);
    } else {
      g.fillStyle = '#7b4a24'; rr(g, 0, 0, 32, 10, 3); g.fill();
      g.fillStyle = '#b07440'; rr(g, 0, 0, 32, 5, 3); g.fill();
      g.fillStyle = '#5a3417'; g.fillRect(4, 10, 3, 6); g.fillRect(25, 10, 3, 6);
    }
  },
  gate(g) {
    g.fillStyle = '#2a2a33'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#8f8fa3'; for (let x = 3; x < 32; x += 8) { g.fillRect(x, 0, 4, 32); g.fillStyle = '#c4c4d4'; g.fillRect(x, 0, 1, 32); g.fillStyle = '#8f8fa3'; }
    g.fillStyle = '#5c5c70'; g.fillRect(0, 13, 32, 5);
  }
};
function drawTiles() {
  const x0 = Math.max(0, Math.floor(camX / T)), x1 = Math.min(lvl.w - 1, Math.ceil((camX + VIEWW) / T));
  const ox = Math.round(camX * S), th = lvl.theme;
  const qf = Math.floor(timeT * 4) % 3;
  for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
    const ch = grid[ty][tx]; if (ch === ' ') continue;
    let img = null;
    switch (ch) {
      case '#': {
        const up = tileAt(tx, ty - 1);
        img = (up === '#' || ty === 0) ? getTile('gf', th, TILE_DRAW.groundFill) : getTile('gt', th, TILE_DRAW.groundTop); break;
      }
      case 'B': case '$': case '1': img = getTile('br', th, TILE_DRAW.brick); break;
      case '?': case 'M': img = getTile('q' + qf, th, g => TILE_DRAW.qbox(g, qf)); break;
      case 'E': img = getTile('us', th, TILE_DRAW.used); break;
      case 'X': img = getTile('hd', th, TILE_DRAW.hard); break;
      case 'C': img = getTile('cb', th, TILE_DRAW.colBody); break;
      case 'c': img = getTile('ct', th, TILE_DRAW.colTop); break;
      case '-': img = getTile('ow', th, TILE_DRAW.oneway); break;
      case 'W': img = getTile('gt8', th, TILE_DRAW.gate); break;
      case 'L': drawLava(tx, ty, ox); continue;
    }
    if (!img) continue;
    let by = 0; for (const b of bumps) if (b.tx === tx && b.ty === ty) by = -Math.sin(b.t / 0.18 * Math.PI) * 8 * S;
    ctx.drawImage(img, tx * TS - ox, OY + ty * TS + by);
  }
}
function drawLava(tx, ty, ox) {
  const x = tx * TS - ox, y = OY + ty * TS;
  const top = tileAt(tx, ty - 1) !== 'L';
  const gr = ctx.createLinearGradient(0, y, 0, y + TS); gr.addColorStop(0, '#ffcf3a'); gr.addColorStop(0.5, '#ff6a00'); gr.addColorStop(1, '#c41d00');
  ctx.fillStyle = gr;
  if (top) {
    ctx.beginPath(); ctx.moveTo(x, y + TS);
    for (let i = 0; i <= 8; i++) { const px = x + i / 8 * TS; ctx.lineTo(px, y + TS * (0.28 + 0.08 * Math.sin(timeT * 4 + (tx * 8 + i) * 0.8))); }
    ctx.lineTo(x + TS, y + TS); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,150,0.8)';
    for (let i = 0; i < 2; i++) { const p = (timeT * 0.6 + hash(tx, i)) % 1; ctx.beginPath(); ctx.arc(x + hash(tx, i + 5) * TS, y + TS * (0.9 - p * 0.6), TS * 0.05 * (1 - p), 0, 7); ctx.fill(); }
  } else ctx.fillRect(x, y, TS + 1, TS + 1);
}

/* ---------- Fondos con paralaje ---------- */
function drawBackground() {
  const th = THEMES[lvl ? lvl.theme : 0];
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  const t = lvl ? lvl.theme : 0, cx = camX * S;
  const hillLayer = (par, base, amp, col, freq, seed) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    const off = cx * par;
    for (let x = 0; x <= W + 20; x += 12 * DPR) {
      const wx = (x + off) / (TS * freq);
      const y = base - amp * (0.55 * Math.sin(wx + seed) + 0.3 * Math.sin(wx * 2.3 + seed * 2) + 0.15 * Math.sin(wx * 5.1));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.fill();
  };
  const cloud = (x, y, s, a) => {
    ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
    [[0, 0, 1], [0.9, -0.35, 1.2], [1.9, 0, 0.95], [0.9, 0.25, 1]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s * 0.75, 0, 7); ctx.fill(); });
  };
  if (t === 0) {
    ctx.fillStyle = 'rgba(255,250,210,0.9)'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, TS * 1.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,210,0.25)'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, TS * 2.1, 0, 7); ctx.fill();
    for (let i = 0; i < 9; i++) { const x = ((i * 560 * DPR - cx * 0.15 + timeT * 8 * DPR) % (W + 600 * DPR) + W + 600 * DPR) % (W + 600 * DPR) - 300 * DPR; cloud(x, H * (0.12 + hash(i, 1) * 0.25), TS * (0.9 + hash(i, 2)), 0.85); }
    hillLayer(0.2, H * 0.68, TS * 2.2, '#9fdc8a', 9, 1);
    hillLayer(0.4, H * 0.8, TS * 1.6, '#6cc35a', 5, 4);
    // árboles-piruleta al fondo
    const off = cx * 0.4;
    for (let i = Math.floor(off / (TS * 7)) - 1; i < (off + W) / (TS * 7) + 1; i++) {
      if (hash(i, 7) < 0.45) continue;
      const x = i * TS * 7 + hash(i, 3) * TS * 3 - off, y = H * 0.8 - TS * 0.4;
      ctx.fillStyle = '#f3e6d0'; ctx.fillRect(x - TS * 0.06, y - TS * 1.6, TS * 0.12, TS * 1.6);
      const cols = ['#ff7aa8', '#ffb347', '#8fd3ff', '#c39bff'];
      ctx.fillStyle = cols[i & 3 & 3]; ctx.beginPath(); ctx.arc(x, y - TS * 1.9, TS * 0.55, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = TS * 0.08; ctx.beginPath();
      for (let a = 0; a < 12; a += 0.3) { const r = a / 12 * TS * 0.45; ctx.lineTo(x + Math.cos(a) * r, y - TS * 1.9 + Math.sin(a) * r); }
      ctx.stroke();
    }
  } else if (t === 1) {
    for (let i = 0; i < 40; i++) {
      const x = ((hash(i, 1) * W * 3 - cx * 0.1) % W + W) % W, y = hash(i, 2) * H * 0.8;
      const a = 0.3 + 0.7 * Math.abs(Math.sin(timeT * (1 + hash(i, 3)) + i));
      ctx.fillStyle = 'rgba(190,160,255,' + a * 0.8 + ')'; ctx.beginPath(); ctx.arc(x, y, DPR * (1 + hash(i, 4) * 2), 0, 7); ctx.fill();
    }
    const off = cx * 0.3;
    for (let i = Math.floor(off / (TS * 3)) - 1; i < (off + W) / (TS * 3) + 1; i++) {
      const x = i * TS * 3 - off, h = TS * (1.5 + hash(i, 5) * 3);
      ctx.fillStyle = '#2a1a45'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + TS * 1.5, 0); ctx.lineTo(x + TS * 0.75, h); ctx.fill();
    }
    hillLayer(0.3, H * 0.78, TS * 1.8, '#2b1b48', 6, 2);
    const off2 = cx * 0.3;
    for (let i = Math.floor(off2 / (TS * 5)) - 1; i < (off2 + W) / (TS * 5) + 1; i++) {
      if (hash(i, 9) < 0.4) continue;
      const x = i * TS * 5 - off2 + hash(i, 2) * TS * 2, y = H * 0.76, hgt = TS * (0.8 + hash(i, 4));
      const gl = ctx.createLinearGradient(0, y - hgt, 0, y); gl.addColorStop(0, '#d6c4ff'); gl.addColorStop(1, '#7a5cd6');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(x - TS * 0.25, y); ctx.lineTo(x, y - hgt); ctx.lineTo(x + TS * 0.25, y); ctx.fill();
      ctx.fillStyle = 'rgba(200,170,255,0.12)'; ctx.beginPath(); ctx.arc(x, y - hgt * 0.5, hgt * 0.8, 0, 7); ctx.fill();
    }
  } else if (t === 2) {
    ctx.fillStyle = 'rgba(255,255,230,0.9)'; ctx.beginPath(); ctx.arc(W * 0.25, H * 0.55, TS * 2, 0, 7); ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      const par = 0.1 + layer * 0.15;
      for (let i = 0; i < 10; i++) {
        const span = W + 800 * DPR;
        const x = ((i * 420 * DPR + hash(i, layer) * 300 * DPR - cx * par + timeT * (6 + layer * 4) * DPR) % span + span) % span - 400 * DPR;
        cloud(x, H * (0.2 + layer * 0.22 + hash(i, layer + 5) * 0.1), TS * (1 + layer * 0.5), 0.5 + layer * 0.2);
      }
    }
  } else {
    const off = cx * 0.3, bw = TS * 1.4, bh = TS * 0.7;
    ctx.fillStyle = '#2a0d0d';
    for (let y = 0; y < H; y += bh) for (let x = -((off) % (bw * 2)) - bw * 2; x < W + bw; x += bw) {
      const sx = x + ((Math.floor(y / bh) % 2) ? bw / 2 : 0);
      ctx.fillStyle = (hash(Math.floor((sx + off) / bw), Math.floor(y / bh)) > 0.5) ? '#2e0f10' : '#260b0c';
      ctx.fillRect(sx + DPR, y + DPR, bw - 2 * DPR, bh - 2 * DPR);
    }
    for (let i = Math.floor(off / (TS * 8)) - 1; i < (off + W) / (TS * 8) + 1; i++) {
      const x = i * TS * 8 - off + TS * 3, y = H * 0.25;
      ctx.fillStyle = '#120404'; rr(ctx, x, y, TS * 1.4, TS * 2.4, TS * 0.7); ctx.fill();
      const fl = 0.6 + 0.4 * Math.sin(timeT * 9 + i);
      ctx.fillStyle = 'rgba(255,140,40,' + 0.25 * fl + ')'; ctx.beginPath(); ctx.arc(x + TS * 0.7, y + TS * 3.5, TS * 1.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.ellipse(x + TS * 0.7, y + TS * 3.3 - fl * TS * 0.1, TS * 0.15, TS * 0.3 * fl, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x + TS * 0.6, y + TS * 3.5, TS * 0.2, TS * 0.5);
    }
    const lg = ctx.createLinearGradient(0, H * 0.7, 0, H); lg.addColorStop(0, 'rgba(255,80,0,0)'); lg.addColorStop(1, 'rgba(255,80,0,0.3)');
    ctx.fillStyle = lg; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  }
}

/* ---------- Personajes (vectoriales) ---------- */
function swirl(g, r, ang, c1, c2) {
  g.fillStyle = c1; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = c2; g.lineWidth = r * 0.28; g.lineCap = 'round'; g.beginPath();
  for (let t = 0; t < 14; t += 0.25) { const rr2 = t / 14 * r * 0.85; g.lineTo(Math.cos(t + ang) * rr2, Math.sin(t + ang) * rr2); }
  g.stroke();
  const sh = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
}
function eyes(g, x, y, s, dir, angry, look) {
  for (const ex of [-1, 1]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + ex * s * 0.42 + dir * s * 0.2, y, s * 0.3, s * 0.4, 0, 0, 7); g.fill();
    g.fillStyle = '#1d1630'; g.beginPath(); g.ellipse(x + ex * s * 0.42 + dir * s * 0.32, y + (look || 0) * s * 0.1, s * 0.15, s * 0.22, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + ex * s * 0.42 + dir * s * 0.36, y - s * 0.1, s * 0.06, 0, 7); g.fill();
    if (angry) { g.strokeStyle = '#1d1630'; g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(x + ex * s * 0.15 + dir * s * 0.2, y - s * 0.4); g.lineTo(x + ex * s * 0.7 + dir * s * 0.2, y - s * 0.6); g.stroke(); }
  }
}
function drawPiru(p) {
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0 && p.state !== 'dead') return;
  const g = ctx; g.save();
  g.translate(p.x + p.w / 2, p.y + p.h);
  const run = p.onGround && Math.abs(p.vx) > 10;
  const step = run ? Math.sin(p.anim * 18) : 0;
  const fire = p.power === 2;
  const c1 = fire ? '#ff8a1c' : '#ff4f8b', c2 = fire ? '#fff3c4' : '#ffffff';
  const d = p.dir;
  // sombra
  if (p.onGround) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, 0, 12, 3, 0, 0, 7); g.fill(); }
  // pies
  g.fillStyle = '#5a2e14';
  const fy = p.onGround ? 0 : -2;
  g.beginPath(); g.ellipse(-6 + step * 4, fy - 3, 6, 4, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(6 - step * 4, fy - 3, 6, 4, 0, 0, 7); g.fill();
  if (p.power === 0) {
    g.translate(0, -16 + Math.abs(step) * -1.5);
    // bracitos
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-14, 3 + step * 2, 3.5, 0, 7); g.arc(14, 3 - step * 2, 3.5, 0, 7); g.fill();
    swirl(g, 14, p.roll, c1, c2);
    eyes(g, d * 2, -2, 9, d, false, p.vy > 50 ? 1 : 0);
    g.strokeStyle = '#7a1238'; g.lineWidth = 1.8; g.beginPath(); g.arc(d * 3, 5, 3.5, 0.2, Math.PI - 0.2); g.stroke();
  } else {
    // cuerpo
    g.translate(0, Math.abs(step) * -1.5);
    g.fillStyle = '#f3e6d0'; g.fillRect(-2.5, -24, 5, 14);
    g.fillStyle = fire ? '#ffffff' : '#3f7cff'; rr(g, -11, -26, 22, 20, 8); g.fill();
    g.fillStyle = fire ? '#ff8a1c' : '#2a5cd6'; g.fillRect(-11, -14, 22, 4);
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(0, -12, 2.2, 0, 7); g.fill();
    // brazos
    g.strokeStyle = fire ? '#ffffff' : '#3f7cff'; g.lineWidth = 5; g.lineCap = 'round';
    const sw = p.shootT > 0 ? -1 : step;
    g.beginPath(); g.moveTo(-10, -22); g.lineTo(-14 - sw * 3, -12); g.stroke();
    g.beginPath(); g.moveTo(10, -22); g.lineTo(14 + (p.shootT > 0 ? 6 * d : sw * 3), p.shootT > 0 ? -20 : -12); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-14 - sw * 3, -11, 3.5, 0, 7); g.arc(14 + (p.shootT > 0 ? 6 * d : sw * 3), p.shootT > 0 ? -20 : -11, 3.5, 0, 7); g.fill();
    g.translate(0, -40);
    swirl(g, 15, p.roll, c1, c2);
    eyes(g, d * 2, -2, 10, d, false, p.vy > 50 ? 1 : 0);
    g.strokeStyle = '#7a1238'; g.lineWidth = 2; g.beginPath(); g.arc(d * 3, 5, 4, 0.2, Math.PI - 0.2); g.stroke();
    // gorrita
    g.fillStyle = fire ? '#ff3b30' : '#ffcc00'; g.beginPath(); g.arc(0, -10, 11, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillRect(d > 0 ? 0 : -16, -12, 16, 3);
  }
  g.restore();
}
function drawGomi(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h);
  if (e.squash) { g.scale(1.3, 0.35); }
  const wob = Math.sin(e.anim * 10) * 1.5;
  g.fillStyle = '#2f8f3a'; g.beginPath(); g.ellipse(-7 + wob, -2, 6, 3.5, 0, 0, 7); g.ellipse(7 - wob, -2, 6, 3.5, 0, 0, 7); g.fill();
  const gr = g.createRadialGradient(-5, -22, 2, 0, -14, 18); gr.addColorStop(0, '#b6ff8c'); gr.addColorStop(1, '#3fb24a');
  g.fillStyle = gr; g.beginPath();
  g.moveTo(-15, -4); g.quadraticCurveTo(-17, -26 - wob, 0, -27); g.quadraticCurveTo(17, -26 + wob, 15, -4); g.closePath(); g.fill();
  if (!e.squash) {
    eyes(g, 0, -16, 8, e.vx > 0 ? 0.5 : -0.5, true);
    g.fillStyle = '#1d4a22'; g.beginPath(); g.ellipse(0, -8, 4, 2, 0, 0, 7); g.fill();
  }
  g.restore();
}
function drawSnail(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h);
  const d = e.vx > 0 ? 1 : -1;
  if (e.mode === 'walk') {
    g.fillStyle = '#ffd27a'; g.beginPath(); g.moveTo(-14 * d, 0); g.quadraticCurveTo(-14 * d, -10, 0, -8); g.lineTo(14 * d, -8);
    g.quadraticCurveTo(18 * d, -26, 10 * d, -28); g.quadraticCurveTo(4 * d, -20, 4 * d, -6); g.lineTo(-14 * d, 0); g.fill();
    g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.beginPath(); g.moveTo(10 * d, -27); g.lineTo(12 * d, -36); g.moveTo(14 * d, -26); g.lineTo(18 * d, -34); g.stroke();
    g.fillStyle = '#1d1630'; g.beginPath(); g.arc(12 * d, -36, 2.2, 0, 7); g.arc(18 * d, -34, 2.2, 0, 7); g.fill();
    g.translate(-3 * d, -14);
  } else g.translate(0, -14);
  const sp = e.mode === 'shell' ? e.anim * (Math.abs(e.vx) > 1 ? 20 : 0) : 0;
  swirl(g, 13, sp, '#4aa3ff', '#d9f0ff');
  g.strokeStyle = '#1c5aa8'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.stroke();
  if (e.mode === 'shell' && Math.abs(e.vx) < 1 && e.timer > 4) { g.fillStyle = '#1d1630'; g.beginPath(); g.arc(-4, 9, 2, 0, 7); g.arc(4, 9, 2, 0, 7); g.fill(); }
  g.restore();
}
function drawBat(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h / 2);
  const f = Math.sin(e.anim * 16);
  g.fillStyle = '#6b3fa0';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 6, -2); g.quadraticCurveTo(s * 18, -16 * f - 4, s * 24, -6 * f); g.quadraticCurveTo(s * 16, 0, s * 18, 6); g.quadraticCurveTo(s * 12, 2, s * 6, 6); g.fill(); }
  const gr = g.createRadialGradient(-3, -4, 1, 0, 0, 11); gr.addColorStop(0, '#b98cf0'); gr.addColorStop(1, '#6b3fa0');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill();
  g.beginPath(); g.moveTo(-8, -6); g.lineTo(-6, -14); g.lineTo(-2, -8); g.moveTo(8, -6); g.lineTo(6, -14); g.lineTo(2, -8); g.fill();
  eyes(g, 0, -1, 6, 0, true, 1);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-3, 5); g.lineTo(-1.5, 8); g.lineTo(0, 5); g.moveTo(3, 5); g.lineTo(1.5, 8); g.lineTo(0, 5); g.fill();
  g.restore();
}
function drawSpiky(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h - 12);
  const d = e.vx > 0 ? 1 : -1, wob = Math.sin(e.anim * 12);
  g.fillStyle = '#ffd5a0'; g.beginPath(); g.ellipse(-6 + wob * 2, 10, 5, 3, 0, 0, 7); g.ellipse(6 - wob * 2, 10, 5, 3, 0, 0, 7); g.fill();
  g.fillStyle = '#ffe9c9';
  for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; g.beginPath(); g.moveTo(Math.cos(a - 0.2) * 12, Math.sin(a - 0.2) * 12); g.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); g.lineTo(Math.cos(a + 0.2) * 12, Math.sin(a + 0.2) * 12); g.fill(); }
  const gr = g.createRadialGradient(-4, -4, 2, 0, 0, 14); gr.addColorStop(0, '#ff7b6b'); gr.addColorStop(1, '#c4231a');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fill();
  eyes(g, d * 3, -1, 7, d, true);
  g.restore();
}
function drawBoss(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h);
  if (e.hurt > 0 && Math.floor(e.hurt * 16) % 2) g.globalAlpha = 0.45;
  const d = P.x > e.x ? 1 : -1, wob = Math.sin(e.anim * 6) * 3;
  g.fillStyle = '#4b1a6b'; g.beginPath(); g.ellipse(-18, -4, 14, 7, 0, 0, 7); g.ellipse(18, -4, 14, 7, 0, 0, 7); g.fill();
  const gr = g.createRadialGradient(-12, -50, 4, 0, -34, 44); gr.addColorStop(0, '#e08cff'); gr.addColorStop(1, '#7b2aa8');
  g.fillStyle = gr; g.beginPath(); g.moveTo(-36, -6); g.quadraticCurveTo(-40, -70 - wob, 0, -72); g.quadraticCurveTo(40, -70 + wob, 36, -6); g.closePath(); g.fill();
  // corona
  g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-16, -66); g.lineTo(-18, -86); g.lineTo(-8, -76); g.lineTo(0, -90); g.lineTo(8, -76); g.lineTo(18, -86); g.lineTo(16, -66); g.closePath(); g.fill();
  g.fillStyle = '#ff3b6b'; g.beginPath(); g.arc(0, -78, 3, 0, 7); g.fill();
  eyes(g, d * 4, -44, 18, d, true);
  g.fillStyle = '#2b0a3d'; g.beginPath(); g.ellipse(d * 4, -22, 14, 7 + Math.abs(wob), 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(d * 4 + i * 5 - 2, -28); g.lineTo(d * 4 + i * 5, -22); g.lineTo(d * 4 + i * 5 + 2, -28); g.fill(); }
  g.restore();
  // barra de vida
  const bw = 120; ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, e.x + e.w / 2 - bw / 2, e.y - 40, bw, 10, 5); ctx.fill();
  ctx.fillStyle = '#ff3b6b'; rr(ctx, e.x + e.w / 2 - bw / 2 + 2, e.y - 38, (bw - 4) * Math.max(0, e.hp) / 12, 6, 3); ctx.fill();
}
function drawItem(e) {
  const g = ctx; g.save(); g.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.t === 'caramelo') {
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-12, 0); g.lineTo(-20, -8); g.lineTo(-20, 8); g.closePath(); g.moveTo(12, 0); g.lineTo(20, -8); g.lineTo(20, 8); g.closePath(); g.fill();
    swirl(g, 12, e.anim * 3, '#ff3b6b', '#ffffff');
    eyes(g, 0, -1, 6, 0, false);
  } else if (e.t === 'chile') {
    g.rotate(Math.sin(e.anim * 6) * 0.15);
    const gr = g.createLinearGradient(-10, -14, 10, 14); gr.addColorStop(0, '#ffb02e'); gr.addColorStop(1, '#ff3b1f');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-6, -10); g.quadraticCurveTo(14, -6, 8, 14); g.quadraticCurveTo(-2, 4, -10, -6); g.fill();
    g.fillStyle = '#3cb043'; g.beginPath(); g.ellipse(-8, -10, 5, 3, -0.6, 0, 7); g.fill(); g.fillRect(-10, -16, 2, 6);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-1, -4, 2, 4, -0.6, 0, 7); g.fill();
  } else if (e.t === 'vida') {
    swirl(g, 12, e.anim * 3, '#3ccf6b', '#ffffff');
    g.fillStyle = '#fff'; g.font = '900 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#0b5b25'; g.fillText('1UP', 0, 1);
  }
  g.restore();
}
function drawCoin(x, y, t, s = 1) {
  const g = ctx; const w = Math.abs(Math.cos(t * 4)) * 9 * s + 1.5;
  const gr = g.createLinearGradient(x - w, y - 12, x + w, y + 12); gr.addColorStop(0, '#fff1a0'); gr.addColorStop(0.5, '#ffc21a'); gr.addColorStop(1, '#d48a00');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, w, 12 * s, 0, 0, 7); g.fill();
  g.strokeStyle = '#b06f00'; g.lineWidth = 1.5; g.stroke();
  if (w > 5) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - 1.5, y - 7 * s, 3, 14 * s); }
}
function drawFlagAndHouse() {
  const fx = lvl.flag * T + T / 2, base = 13 * T;
  // poste
  ctx.fillStyle = '#e8e8f0'; ctx.fillRect(fx - 3, 3 * T, 6, base - 3 * T);
  ctx.fillStyle = '#9a9ab0'; ctx.fillRect(fx + 1, 3 * T, 2, base - 3 * T);
  ctx.save(); ctx.translate(fx, 3 * T - 6); swirl(ctx, 9, timeT * 2, '#ff4f8b', '#fff'); ctx.restore();
  // bandera
  const fy = lvl.flagY !== undefined ? lvl.flagY : 3 * T + 10;
  ctx.fillStyle = '#ff4f8b'; ctx.beginPath(); ctx.moveTo(fx - 3, fy);
  for (let i = 0; i <= 10; i++) ctx.lineTo(fx - 3 - i * 4.4, fy + 14 + Math.sin(timeT * 6 + i * 0.6) * 3 * (i / 10) - (i === 10 ? 0 : 0));
  ctx.lineTo(fx - 3, fy + 28); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(fx - 22, fy + 14); swirl(ctx, 7, 0, '#ffffff', '#ff4f8b'); ctx.restore();
  ctx.fillStyle = '#b07a4c'; ctx.fillRect(fx - 14, base - 8, 28, 8);
  // La Piruleta (meta)
  const hx = (lvl.flag + 5) * T, hy = base, hw = T * 7, hh = T * 5;
  ctx.fillStyle = '#fff4e6'; ctx.fillRect(hx, hy - hh, hw, hh);
  ctx.fillStyle = '#e9d6c0'; for (let y = hy - hh + 10; y < hy; y += 14) ctx.fillRect(hx, y, hw, 2);
  ctx.fillStyle = '#7a3415'; ctx.fillRect(hx - 8, hy - hh - 14, hw + 16, 16);
  // toldo
  for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4f8b'; ctx.beginPath(); const sx = hx - 8 + i * (hw + 16) / 9; ctx.moveTo(sx, hy - hh + 2); ctx.lineTo(sx + (hw + 16) / 9, hy - hh + 2); ctx.lineTo(sx + (hw + 16) / 9, hy - hh + 26); ctx.arc(sx + (hw + 16) / 18, hy - hh + 26, (hw + 16) / 18, 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = '#ffffff'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('LA PIRULETA', hx + hw / 2, hy - hh - 6);
  // puerta y ventanas
  ctx.fillStyle = '#6b3a1c'; rr(ctx, hx + hw / 2 - 18, hy - 70, 36, 70, 6); ctx.fill();
  ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(hx + hw / 2 + 10, hy - 34, 3, 0, 7); ctx.fill();
  for (const wx of [hx + 18, hx + hw - 70]) {
    ctx.fillStyle = '#8fd3ff'; rr(ctx, wx, hy - 100, 52, 50, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(wx + 6, hy - 94, 10, 38);
    ctx.save(); ctx.translate(wx + 32, hy - 75); swirl(ctx, 10, 1, '#ff4f8b', '#fff'); ctx.restore();
  }
}

/* ---------- Física ---------- */
function moveBody(b, dt, oneWay = true) {
  b.hitWall = 0; b.onGround = false; b.headTiles = null;
  // X
  b.x += b.vx * dt;
  let y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + b.w) / T);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = tx * T - b.w - 0.01; b.vx = 0; b.hitWall = 1; break; }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x / T);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = (tx + 1) * T + 0.01; b.vx = 0; b.hitWall = -1; break; }
  }
  // Y
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  const x0 = Math.floor((b.x + 0.5) / T), x1 = Math.floor((b.x + b.w - 0.5) / T);
  if (b.vy >= 0) {
    const ty = Math.floor((b.y + b.h) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const ch = tileAt(tx, ty);
      if (isSolid(ch) || (oneWay && ch === '-' && prevBottom <= ty * T + 2)) { b.y = ty * T - b.h; b.vy = 0; b.onGround = true; break; }
    }
  } else {
    const ty = Math.floor(b.y / T);
    const hits = [];
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tileAt(tx, ty))) hits.push(tx);
    if (hits.length) {
      b.y = (ty + 1) * T + 0.01; b.vy = 0;
      const cx = (b.x + b.w / 2) / T;
      hits.sort((a, c) => Math.abs(a + 0.5 - cx) - Math.abs(c + 0.5 - cx));
      b.headTiles = { tx: hits[0], ty };
    }
  }
}
function solidAtPoint(x, y) { return isSolid(tileAt(Math.floor(x / T), Math.floor(y / T))); }

/* ---------- Entrada (táctil + teclado + mando) ---------- */
const input = { left: false, right: false, jump: false, fire: false, jumpP: false, fireP: false, _pj: false, _pf: false, down: false };
const keys = {};
const pointers = new Map();
let BTN = {};
function layoutButtons() {
  const r = Math.min(H * 0.105, W * 0.07), m = r * 0.55;
  BTN = {
    r,
    left: { x: m + r, y: H - m - r },
    right: { x: m + r * 3.4, y: H - m - r },
    fire: { x: W - m - r * 3.4, y: H - m - r * 1.1 },
    jump: { x: W - m - r, y: H - m - r * 1.75 },
    pause: { x: W - r * 0.9, y: r * 0.9, r: r * 0.55 }
  };
}
function pollTouch() {
  let l = false, rt = false, j = false, f = false;
  for (const p of pointers.values()) {
    if (p.y < H * 0.2) continue;
    if (p.x < W * 0.38) { if (p.x < (BTN.left.x + BTN.right.x) / 2) l = true; else rt = true; }
    else if (p.x > W * 0.55) { const midx = (BTN.fire.x + BTN.jump.x) / 2; if (p.x > midx) j = true; else f = true; }
  }
  return { l, rt, j, f };
}
function updateInput() {
  const t = pollTouch();
  let gl = false, gr = false, gj = false, gf = false;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    gl = gl || ax < -0.4 || (gp.buttons[14] && gp.buttons[14].pressed);
    gr = gr || ax > 0.4 || (gp.buttons[15] && gp.buttons[15].pressed);
    gj = gj || (gp.buttons[0] && gp.buttons[0].pressed);
    gf = gf || (gp.buttons[2] && gp.buttons[2].pressed) || (gp.buttons[1] && gp.buttons[1].pressed);
  }
  input.left = t.l || keys.ArrowLeft || keys.KeyA || gl;
  input.right = t.rt || keys.ArrowRight || keys.KeyD || gr;
  input.jump = t.j || keys.Space || keys.ArrowUp || keys.KeyZ || keys.KeyW || gj;
  input.fire = t.f || keys.KeyX || keys.ShiftLeft || gf;
  input.jumpP = input.jump && !input._pj; input._pj = input.jump;
  input.fireP = input.fire && !input._pf; input._pf = input.fire;
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); AU.init();
  const x = e.clientX * DPR, y = e.clientY * DPR;
  pointers.set(e.pointerId, { x, y });
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  onTap(x, y);
}, { passive: false });
cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX * DPR, y: e.clientY * DPR }); }, { passive: false });
const endP = e => pointers.delete(e.pointerId);
cv.addEventListener('pointerup', endP); cv.addEventListener('pointercancel', endP); cv.addEventListener('pointerleave', endP);
window.addEventListener('keydown', e => {
  AU.init(); keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') onBack();
  if (e.code === 'Enter') onTap(-1, -1, true);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

/* ---------- Botones de menú ---------- */
let uiButtons = [];
function uiButton(id, x, y, w, h, label, opts = {}) {
  uiButtons.push({ id, x, y, w, h });
  const g = ctx; const r = h * 0.3;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, x, y + h * 0.1, w, h, r); g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, opts.c1 || '#ff7aa8'); gr.addColorStop(1, opts.c2 || '#e83e78');
  g.fillStyle = opts.disabled ? '#777' : gr; rr(g, x, y, w, h, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; rr(g, x + h * 0.08, y + h * 0.06, w - h * 0.16, h * 0.3, r * 0.6); g.fill();
  g.fillStyle = '#fff'; g.font = '900 ' + Math.round(h * 0.42) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, x + w / 2, y + h * 0.53);
  g.restore();
}
function onTap(x, y, enter) {
  if (state === 'play') {
    const b = BTN.pause; if (Math.hypot(x - b.x, y - b.y) < b.r * 1.6) { setPause(true); }
    return;
  }
  let hit = null;
  if (enter) hit = uiButtons.length ? uiButtons[0].id : null;
  else for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = b.id;
  if (state === 'title' && stateT > 0.3) { AU.sfx('select'); if (hit === 'music') { AU.setMusic(!save.music); } else { go('select'); } return; }
  if (!hit) return;
  AU.sfx('select');
  if (state === 'select') {
    if (hit === 'back') go('title');
    else if (hit.startsWith('L')) { const i = +hit.slice(1); if (i < save.unlocked) { lvlIndex = i; score = 0; coins = 0; lives = 3; startLevel(true); } }
  } else if (state === 'pause') {
    if (hit === 'resume') setPause(false);
    else if (hit === 'music') AU.setMusic(!save.music);
    else if (hit === 'sfx') AU.setSfx(!save.sfx);
    else if (hit === 'quit') { go('select'); }
  } else if (state === 'clear') {
    if (hit === 'next') { if (lvlIndex < LEVELS.length - 1) { lvlIndex++; startLevel(true, true); } else go('win'); }
    else if (hit === 'menu') go('select');
  } else if (state === 'over' || state === 'win') {
    go('select');
  }
}
function onBack() {
  if (state === 'play') setPause(true);
  else if (state === 'pause') setPause(false);
  else if (state === 'select') go('title');
  else if (state === 'title') { if (window.Android && Android.exit) Android.exit(); }
  else go('select');
}
window.onBack = onBack;
window.onAppPause = () => { if (state === 'play') setPause(true); if (AU.ac) AU.ac.suspend(); };
window.onAppResume = () => { if (AU.ac) AU.ac.resume(); };
function setPause(on) { AU.sfx('pause'); state = on ? 'pause' : 'play'; }
function go(s) {
  state = s; stateT = 0;
  if (s === 'title' || s === 'select') { lvl = null; AU.playSong(4); }
  if (s === 'win') AU.playSong(4);
}

/* ---------- Inicio de nivel ---------- */
function startLevel(fresh, keepCp) {
  LEVELS = buildLevels();
  lvl = LEVELS[lvlIndex];
  grid = lvl.g;
  if (fresh) { cpReached = false; }
  timeLeft = lvl.time; bossDead = false;
  delete lvl.flagY;
  ents = []; parts = []; pops = []; bumps = [];
  for (const s of lvl.ents) spawn(s);
  const sx = (cpReached && lvl.cp ? lvl.cp : lvl.start) * T;
  P = { x: sx, y: 12 * T - 28 + T - 0.01, w: 20, h: 28, vx: 0, vy: 0, dir: 1, power: P && !fresh ? 0 : (P && keepCp ? P.power : 0), onGround: false, anim: 0, roll: 0, inv: 0, coyote: 0, buf: 0, state: 'play', shootT: 0, fireCd: 0 };
  P.y = 13 * T - P.h - 0.01;
  if (P.power > 0) { P.h = 54; P.w = 22; P.y = 13 * T - P.h - 0.01; }
  camX = Math.max(0, P.x - VIEWW * 0.35);
  state = 'intro'; stateT = 0; AU.stopSong();
}
function spawn(s) {
  const x = s.x * T, y = s.y * T;
  switch (s.t) {
    case 'g': ents.push({ t: 'g', x: x + 4, y: y + 4, w: 26, h: 28, vx: -50, vy: 0, anim: Math.random(), active: false }); break;
    case 'k': ents.push({ t: 'k', x: x + 3, y: y + 2, w: 26, h: 30, vx: -45, vy: 0, mode: 'walk', anim: 0, timer: 0, active: false }); break;
    case 's': ents.push({ t: 's', x: x + 4, y: y + 6, w: 26, h: 26, vx: -40, vy: 0, anim: 0, active: false }); break;
    case 'b': ents.push({ t: 'b', x: x, y: y, w: 26, h: 20, vx: -60, vy: 0, by: y, anim: Math.random() * 6, active: false }); break;
    case 'o': ents.push({ t: 'o', x: x + 6, y: y + 4, w: 20, h: 24, anim: Math.random() * 3 }); break;
    case 'm': ents.push({ t: 'm', x: x, y: y + 4, w: T * 3, h: 14, ox: x, oy: y + 4, dx: (s.dx || 0) * T, dy: (s.dy || 0) * T, ph: 0, px: x, py: y + 4 }); break;
    case 'r': ents.push({ t: 'r', cx: x + T / 2, cy: y + T / 2, a: 0, sp: s.sp || 2, n: s.n || 6, x: x, y: y, w: T, h: T }); break;
    case 'boss': ents.push({ t: 'boss', x: x, y: y - 40, w: 72, h: 72, vx: -70, vy: 0, hp: 12, hurt: 0, anim: 0, jumpT: 2, active: false, x0: (s.x - 14) * T, x1: (lvl.bossGate - 1) * T }); break;
  }
}

/* ---------- Efectos ---------- */
function addScore(n, x, y) { score += n; pops.push({ x, y, text: '' + n, t: 0 }); }
function addCoin(x, y) {
  coins++; score += 100; AU.sfx('coin');
  if (coins >= 100) { coins -= 100; lives++; AU.sfx('up'); pops.push({ x, y: y - 20, text: '1UP', t: 0 }); }
}
function burst(x, y, col, n = 10, sp = 220) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.6 + Math.random() * 0.4, t: 0, col, r: 2 + Math.random() * 3, g: 900 }); }
}
function brickChunks(tx, ty) {
  for (let i = 0; i < 4; i++) parts.push({ x: tx * T + 8 + (i % 2) * 16, y: ty * T + 8 + Math.floor(i / 2) * 16, vx: (i % 2 ? 1 : -1) * (120 + Math.random() * 60), vy: -420 + Math.floor(i / 2) * 120, life: 1.4, t: 0, col: '#c8602c', r: 7, g: 1500, rot: 0, chunk: true });
}
function hurtPlayer() {
  if (P.inv > 0 || P.state !== 'play') return;
  if (P.power > 0) {
    AU.sfx('hurt'); vibrate(80);
    P.power = P.power === 2 ? 1 : 0;
    if (P.power === 0) { P.y += P.h - 28; P.h = 28; P.w = 20; }
    P.inv = 2;
  } else killPlayer();
}
function killPlayer() {
  if (P.state === 'dead') return;
  P.state = 'dead'; P.vy = -620; P.vx = 0; P.deadT = 0; AU.stopSong(); AU.sfx('die'); vibrate(200);
}
function powerUp(kind) {
  if (kind === 'vida') { lives++; AU.sfx('up'); pops.push({ x: P.x, y: P.y - 10, text: '1UP', t: 0 }); return; }
  addScore(1000, P.x, P.y - 10); AU.sfx('power'); vibrate(40);
  if (kind === 'caramelo') { if (P.power === 0) { P.power = 1; P.y -= 26; P.h = 54; P.w = 22; } }
  else if (kind === 'chile') { if (P.power === 0) { P.y -= 26; P.h = 54; P.w = 22; } P.power = 2; }
  flash = 0.25;
}

/* ---------- Golpe a bloques ---------- */
function hitBlock(tx, ty) {
  const ch = tileAt(tx, ty);
  bumps.push({ tx, ty, t: 0 });
  // enemigos encima mueren
  for (const e of ents) if ((e.t === 'g' || e.t === 'k' || e.t === 's') && !e.dead && e.x + e.w > tx * T && e.x < (tx + 1) * T && Math.abs(e.y + e.h - ty * T) < 4) killEnemy(e, true);
  for (const e of ents) if (e.t === 'o' && !e.dead && e.x + e.w > tx * T && e.x < (tx + 1) * T && Math.abs(e.y + e.h - ty * T) < 8) { e.dead = true; addCoin(e.x, e.y); }
  if (ch === '?') { grid[ty][tx] = 'E'; addCoin(tx * T, ty * T); parts.push({ coinPop: true, x: tx * T + T / 2, y: ty * T, vy: -520, t: 0, life: 0.55 }); }
  else if (ch === '$') {
    lvl.multi = lvl.multi || {}; const k = tx + ',' + ty; lvl.multi[k] = (lvl.multi[k] || 0) + 1;
    addCoin(tx * T, ty * T); parts.push({ coinPop: true, x: tx * T + T / 2, y: ty * T, vy: -520, t: 0, life: 0.55 });
    if (lvl.multi[k] >= 8) grid[ty][tx] = 'E';
  }
  else if (ch === 'M' || ch === '1') {
    grid[ty][tx] = 'E'; AU.sfx('item');
    const kind = ch === '1' ? 'vida' : (P.power === 0 ? 'caramelo' : 'chile');
    ents.push({ t: kind, x: tx * T + 2, y: ty * T, w: 28, h: 28, vx: 0, vy: 0, emerge: 0, ey: ty * T, anim: 0 });
  }
  else if (ch === 'B') {
    if (P.power > 0) { grid[ty][tx] = ' '; brickChunks(tx, ty); AU.sfx('break'); score += 50; shake = 0.12; vibrate(25); }
    else AU.sfx('bump');
  } else AU.sfx('bump');
}
function killEnemy(e, flip) {
  if (e.dead) return;
  if (e.t === 'boss') return;
  e.dead = true; e.flip = !!flip; e.vy = -380; e.deadT = 0;
  addScore(e.t === 'k' ? 200 : 100, e.x, e.y);
  AU.sfx('kick');
}

/* ---------- Actualización ---------- */
const GRAV = 2050, GRAV_HOLD = 1300, JUMP_V = 620, WALK = 175, RUN = 270, ACC_G = 1500, ACC_A = 950, FRIC = 1700;
function updatePlayer(dt) {
  const p = P;
  if (p.state === 'dead') {
    p.deadT += dt; if (p.deadT > 0.45) { p.vy += GRAV * dt; p.y += p.vy * dt; }
    if (p.deadT > 3) { lives--; if (lives <= 0) { go('over'); AU.playSong(1); } else startLevel(false); }
    return;
  }
  if (p.state === 'flag') {
    p.vx = 0; p.vy = 0;
    if (p.y + p.h < 13 * T - 1) { p.y = Math.min(13 * T - p.h, p.y + 260 * dt); lvl.flagY = Math.min(13 * T - 36, (lvl.flagY ?? 3 * T + 10) + 260 * dt); }
    else { p.state = 'walkout'; p.dir = 1; p.x += 14; }
    return;
  }
  if (p.state === 'walkout') {
    p.vx = 120; p.vy += GRAV * dt; moveBody(p, dt); p.anim += dt; p.roll += p.vx * dt / 14;
    const door = (lvl.flag + 5) * T + T * 3.5;
    if (p.x > door) { p.hidden = true; p.state = 'tally'; p.tallyT = 0; timeLeft = Math.ceil(timeLeft); }
    return;
  }
  if (p.state === 'tally') {
    p.tallyT += dt;
    if (timeLeft > 0) { const n = Math.min(timeLeft, Math.ceil(dt * 300)); timeLeft -= n; score += n * 50; if (Math.floor(p.tallyT * 30) % 2) AU.tone(1200, 0.03, 'square', 0.04); }
    else if (p.tallyT > 1) {
      const i = lvlIndex; save.best[i] = Math.max(save.best[i] || 0, score);
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, i + 2)); persist();
      state = 'clear'; stateT = 0;
    }
    return;
  }
  const run = input.fire;
  const max = run ? RUN : WALK;
  const acc = p.onGround ? ACC_G : ACC_A;
  if (input.left && !input.right) { p.vx = Math.max(-max, p.vx - acc * dt * (p.vx > 0 ? 2 : 1)); p.dir = -1; }
  else if (input.right && !input.left) { p.vx = Math.min(max, p.vx + acc * dt * (p.vx < 0 ? 2 : 1)); p.dir = 1; }
  else if (p.onGround) { const f = FRIC * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
  if (Math.abs(p.vx) > max) p.vx = Math.sign(p.vx) * Math.max(max, Math.abs(p.vx) - FRIC * dt);
  // salto con tiempo de gracia y búfer
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  p.buf = input.jumpP ? 0.12 : p.buf - dt;
  if (p.buf > 0 && p.coyote > 0) {
    p.vy = -(JUMP_V + Math.abs(p.vx) * 0.25); p.buf = 0; p.coyote = 0; AU.sfx('jump');
    for (let i = 0; i < 5; i++) parts.push({ x: p.x + p.w / 2, y: p.y + p.h, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, life: 0.35, t: 0, col: 'rgba(255,255,255,0.8)', r: 3, g: 0 });
  }
  const g = (p.vy < 0 && input.jump) ? GRAV_HOLD : GRAV;
  p.vy = Math.min(p.vy + g * dt, 900);
  if (!input.jump && p.vy < -260) p.vy = -260;
  // disparo
  p.fireCd -= dt; p.shootT -= dt;
  if (input.fireP && p.power === 2 && p.fireCd <= 0 && ents.filter(e => e.t === 'fb').length < 2) {
    ents.push({ t: 'fb', x: p.x + (p.dir > 0 ? p.w : -10), y: p.y + 14, w: 12, h: 12, vx: 460 * p.dir, vy: 120, anim: 0, life: 3 });
    p.fireCd = 0.2; p.shootT = 0.15; AU.sfx('fire');
  }
  const wasAir = !p.onGround;
  moveBody(p, dt);
  // plataformas móviles
  for (const e of ents) if (e.t === 'm') {
    const prevB = p.y + p.h - p.vy * dt;
    if (p.vy >= 0 && p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h >= e.y && prevB <= e.y + 6 + Math.abs(e.y - e.py)) {
      p.y = e.y - p.h; p.vy = 0; p.onGround = true; p.x += e.x - e.px;
    }
  }
  if (p.onGround && wasAir && p.vy === 0) { /* aterrizaje */ }
  if (p.headTiles) hitBlock(p.headTiles.tx, p.headTiles.ty);
  // límite izquierdo de la cámara
  if (p.x < camX) { p.x = camX; if (p.vx < 0) p.vx = 0; }
  if (p.x + p.w > lvl.w * T) p.x = lvl.w * T - p.w;
  p.anim += dt * (Math.abs(p.vx) / 175); p.roll += p.vx * dt / 14;
  if (p.inv > 0) p.inv -= dt;
  // lava / caída
  const cx0 = Math.floor((p.x + 4) / T), cx1 = Math.floor((p.x + p.w - 4) / T), cy = Math.floor((p.y + p.h - 6) / T);
  for (let tx = cx0; tx <= cx1; tx++) if (tileAt(tx, cy) === 'L' && p.y + p.h > cy * T + 12) { killPlayer(); return; }
  if (p.y > ROWS * T + 40) { killPlayer(); return; }
  // checkpoint
  if (lvl.cp && !cpReached && p.x > lvl.cp * T) { cpReached = true; pops.push({ x: p.x, y: p.y - 20, text: '¡Punto de control!', t: 0 }); AU.sfx('select'); }
  // meta
  const fx = lvl.flag * T + T / 2;
  if (p.x + p.w > fx - 4 && p.state === 'play') {
    p.state = 'flag'; p.x = fx - p.w - 2; p.dir = 1; AU.stopSong(); AU.sfx('flag');
    const h = 13 * T - (p.y + p.h); const bonus = h > 8 * T ? 5000 : h > 5 * T ? 2000 : h > 3 * T ? 800 : h > T ? 400 : 100;
    addScore(bonus, p.x, p.y); lvl.flagY = 3 * T + 10;
  }
}
function updateEnts(dt) {
  const left = camX - T * 4, right = camX + VIEWW + T * 3;
  for (const e of ents) {
    if (e.dead && e.deadT !== undefined) { e.deadT += dt; e.vy += GRAV * dt; e.y += e.vy * dt; if (e.y > ROWS * T + 100) e.gone = true; continue; }
    if (e.dead) { e.gone = true; continue; }
    if (!e.active && e.t !== 'boss' && e.x < right && e.x + (e.w || 0) > left - T * 10) e.active = true;
    if ((e.t === 'g' || e.t === 'k' || e.t === 's' || e.t === 'b') && !e.active) continue;
    if (e.anim !== undefined) e.anim += dt;
    switch (e.t) {
      case 'g': case 's':
        if (e.squash) { e.squashT -= dt; if (e.squashT <= 0) e.gone = true; break; }
        e.vy = Math.min(e.vy + GRAV * dt, 900);
        { const vx = e.vx; moveBody(e, dt); if (e.hitWall) e.vx = -vx; }
        if (e.t === 's' && e.onGround) { const ahead = e.vx > 0 ? e.x + e.w + 2 : e.x - 2; if (!solidAtPoint(ahead, e.y + e.h + 4)) e.vx = -e.vx; }
        if (e.y > ROWS * T + 50 || lavaAt(e)) e.gone = true;
        break;
      case 'k': {
        e.vy = Math.min(e.vy + GRAV * dt, 900);
        const vx = e.vx; moveBody(e, dt);
        if (e.hitWall) { e.vx = -vx; if (e.mode === 'shell' && Math.abs(vx) > 100 && Math.abs(e.x - (P.x)) < VIEWW) AU.sfx('bump'); }
        if (e.mode === 'walk' && e.onGround) { const ahead = e.vx > 0 ? e.x + e.w + 2 : e.x - 2; if (!solidAtPoint(ahead, e.y + e.h + 4)) e.vx = -e.vx; }
        if (e.mode === 'shell') {
          e.kickGrace = (e.kickGrace || 0) - dt;
          if (Math.abs(e.vx) < 1) { e.timer += dt; if (e.timer > 6) { e.mode = 'walk'; e.vx = P.x > e.x ? 45 : -45; e.h = 30; e.y -= 4; } }
          else {
            for (const o of ents) if (o !== e && !o.dead && (o.t === 'g' || o.t === 'k' || o.t === 's' || o.t === 'b') && overlap(e, o)) killEnemy(o, true);
          }
        }
        if (e.y > ROWS * T + 50 || lavaAt(e)) e.gone = true;
        break;
      }
      case 'b':
        e.x += e.vx * dt; e.y = e.by + Math.sin(e.anim * 2.4) * 36;
        if (e.anim > 0 && Math.random() < dt * 0.3) e.vx = (P.x > e.x ? 1 : -1) * 70;
        break;
      case 'o': break;
      case 'm': {
        e.px = e.x; e.py = e.y; e.ph += dt;
        e.x = e.ox + (e.dx ? Math.sin(e.ph * 0.9) * e.dx : 0);
        e.y = e.oy + (e.dy ? Math.sin(e.ph * 0.9) * e.dy : 0);
        break;
      }
      case 'r': e.a += e.sp * dt; break;
      case 'fb':
        e.vy = Math.min(e.vy + 1800 * dt, 700); e.life -= dt;
        { const vx = e.vx; moveBody(e, dt); if (e.onGround) e.vy = -340; if (e.hitWall || e.life <= 0 || e.y > ROWS * T || e.x < camX - 40 || e.x > camX + VIEWW + 40) { e.gone = true; burst(e.x + 6, e.y + 6, '#ffb02e', 6, 120); } else e.vx = vx; }
        for (const o of ents) if (!o.dead && !o.gone && (o.t === 'g' || o.t === 'k' || o.t === 's' || o.t === 'b' || o.t === 'boss') && overlap(e, o)) {
          e.gone = true; burst(e.x + 6, e.y + 6, '#ffb02e', 8, 160);
          if (o.t === 'boss') damageBoss(o, 1); else killEnemy(o, true);
          break;
        }
        break;
      case 'caramelo': case 'chile': case 'vida':
        if (e.emerge < 1) { e.emerge += dt * 1.6; e.y = e.ey - Math.min(1, e.emerge) * T + 2; if (e.emerge >= 1) { e.vx = e.t === 'chile' ? 0 : 85 * (P.x + P.w / 2 < e.x + e.w / 2 ? 1 : -1); } break; }
        e.vy = Math.min(e.vy + GRAV * dt, 900);
        { const vx = e.vx; moveBody(e, dt); if (e.hitWall) e.vx = -vx; }
        if (e.y > ROWS * T + 50) e.gone = true;
        break;
      case 'boss': updateBoss(e, dt); break;
    }
  }
  // colisiones con el jugador
  if (P.state === 'play') {
    for (const e of ents) {
      if (e.dead || e.gone) continue;
      if (e.t === 'o') { if (overlap(P, e)) { e.gone = true; addCoin(e.x, e.y); burst(e.x + 10, e.y + 12, '#ffe066', 6, 100); } continue; }
      if (e.t === 'caramelo' || e.t === 'chile' || e.t === 'vida') { if (e.emerge >= 1 && overlap(P, e)) { e.gone = true; powerUp(e.t); } continue; }
      if (e.t === 'r') {
        for (let i = 0; i < e.n; i++) {
          const bx = e.cx + Math.cos(e.a) * i * 13, by = e.cy + Math.sin(e.a) * i * 13;
          if (bx > P.x + 2 && bx < P.x + P.w - 2 && by > P.y + 2 && by < P.y + P.h - 2) { hurtPlayer(); break; }
        }
        continue;
      }
      if (!(e.t === 'g' || e.t === 'k' || e.t === 's' || e.t === 'b' || e.t === 'boss')) continue;
      if (e.squash || !e.active) continue;
      if (!overlap(P, e)) continue;
      const prevBottom = P.y + P.h - P.vy * (1 / 120) - 2;
      const stomp = P.vy > 0 && prevBottom <= e.y + Math.min(14, e.h * 0.5);
      if (e.t === 'boss') {
        if (stomp && e.hurt <= 0) { damageBoss(e, 4); P.vy = -560; } else if (e.hurt <= 0 || !stomp) hurtPlayer();
        continue;
      }
      if (e.t === 's') { hurtPlayer(); continue; }
      if (e.t === 'k' && e.mode === 'shell') {
        if (Math.abs(e.vx) < 1) {
          e.vx = (P.x + P.w / 2 < e.x + e.w / 2 ? 1 : -1) * 430; e.kickGrace = 0.25; e.timer = 0; AU.sfx('kick'); addScore(400, e.x, e.y);
          if (stomp) P.vy = -380;
        } else if (stomp) { e.vx = 0; e.timer = 0; P.vy = -420; AU.sfx('stomp'); }
        else if (e.kickGrace <= 0) hurtPlayer();
        continue;
      }
      if (stomp) {
        P.vy = input.jump ? -600 : -400; P.y = e.y - P.h;
        AU.sfx('stomp'); vibrate(20);
        if (e.t === 'g') { e.squash = true; e.squashT = 0.5; addScore(100, e.x, e.y); }
        else if (e.t === 'k') { e.mode = 'shell'; e.vx = 0; e.timer = 0; e.y += 4; e.h = 26; addScore(100, e.x, e.y); e.kickGrace = 0.2; }
        else if (e.t === 'b') { killEnemy(e, true); }
        burst(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 6, 120);
      } else hurtPlayer();
    }
  }
  ents = ents.filter(e => !e.gone);
}
function lavaAt(e) { const tx = Math.floor((e.x + e.w / 2) / T), ty = Math.floor((e.y + e.h - 4) / T); return tileAt(tx, ty) === 'L'; }
function updateBoss(e, dt) {
  if (e.hp <= 0) return;
  if (P.x > e.x0) e.active = true;
  if (!e.active) return;
  if (!lvl.bossStarted) { lvl.bossStarted = true; AU.playSong(3); fill(lvl, 133, 133, 3, 12, 'W'); AU.sfx('boss'); shake = 0.4; }
  e.hurt -= dt; e.jumpT -= dt;
  const spd = e.hp > 8 ? 80 : e.hp > 4 ? 120 : 160;
  if (e.onGround) e.vx = (P.x > e.x ? 1 : -1) * spd * (e.hurt > 0 ? -1.2 : 1);
  if (e.jumpT <= 0 && e.onGround) { e.vy = -(560 + Math.random() * 220); e.jumpT = 1.4 + Math.random() * 1.6; }
  e.vy = Math.min(e.vy + GRAV * dt, 900);
  const wasAir = !e.onGround;
  moveBody(e, dt);
  if (e.onGround && wasAir) { shake = 0.25; AU.sfx('bump'); vibrate(30); }
  e.x = clamp(e.x, 135 * T, e.x1 - e.w);
}
function damageBoss(e, n) {
  if (e.hurt > 0 && n > 1) return;
  e.hp -= n; AU.sfx('boss'); shake = 0.2; vibrate(50);
  if (n > 1) e.hurt = 1.2;
  burst(e.x + e.w / 2, e.y + e.h / 2, '#e08cff', 14, 260);
  if (e.hp <= 0) {
    e.dead = true; e.deadT = 0; e.vy = -500; e.flip = true;
    addScore(5000, e.x, e.y); bossDead = true;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < lvl.w; x++) if (grid[y][x] === 'W') { grid[y][x] = ' '; burst(x * T + 16, y * T + 16, '#9a9ab0', 4, 160); }
    AU.playSong(0); flash = 0.4;
  }
}
function updateCamera(dt) {
  if (!P) return;
  const target = P.x + P.w / 2 - VIEWW * 0.4;
  camX = Math.max(camX, Math.min(target, lvl.w * T - VIEWW));
  camX = Math.max(0, camX);
}
function updateFx(dt) {
  for (const p of parts) {
    p.t += dt;
    if (p.coinPop) { p.vy += 1800 * dt; p.y += p.vy * dt; continue; }
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.chunk) p.rot = (p.rot || 0) + dt * 12;
  }
  parts = parts.filter(p => p.t < p.life);
  for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1);
  for (const b of bumps) b.t += dt; bumps = bumps.filter(b => b.t < 0.18);
  if (shake > 0) shake -= dt; if (flash > 0) flash -= dt;
}

/* ---------- Bucle principal ---------- */
let last = performance.now(), acc = 0;
const STEP = 1 / 120;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  timeT += dt; stateT += dt;
  updateInput();
  AU.tick();
  if (state === 'play') {
    acc += dt;
    while (acc >= STEP) {
      updatePlayer(STEP); if (state !== 'play') { acc = 0; break; }
      updateEnts(STEP); updateFx(STEP); updateCamera(STEP);
      input.jumpP = false; input.fireP = false;
      acc -= STEP;
    }
    if (state === 'play' && P.state === 'play') { timeLeft -= dt / 0.7; if (timeLeft <= 0) { timeLeft = 0; killPlayer(); } }
    if (state === 'play' && P.state === 'play' && AU.theme !== THEMES[lvl.theme].song && !lvl.bossStarted) AU.playSong(THEMES[lvl.theme].song);
  } else if (state === 'intro') {
    if (stateT > 2.2) { state = 'play'; AU.playSong(THEMES[lvl.theme].song); }
  } else if (state === 'pause') {
    if (input.jumpP) setPause(false);
  }
  render();
  requestAnimationFrame(frame);
}

/* ---------- Render ---------- */
function text(str, x, y, size, col = '#fff', align = 'center', stroke = true) {
  ctx.font = '900 ' + Math.round(size) + 'px system-ui, "Roboto", sans-serif';
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = size * 0.18; ctx.strokeStyle = 'rgba(40,10,40,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = col; ctx.fillText(str, x, y);
}
function render() {
  uiButtons = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state === 'title') return renderTitle();
  if (state === 'select') return renderSelect();
  if (state === 'over') return renderOver();
  if (state === 'win') return renderWin();
  if (!lvl) return;
  if (state === 'intro') return renderIntro();
  const sx = shake > 0 ? (Math.random() - 0.5) * 10 * DPR : 0, sy = shake > 0 ? (Math.random() - 0.5) * 10 * DPR : 0;
  ctx.setTransform(1, 0, 0, 1, sx, sy);
  drawBackground();
  // mundo
  ctx.setTransform(S, 0, 0, S, -Math.round(camX * S) + sx, OY + sy);
  drawFlagAndHouse();
  ctx.setTransform(1, 0, 0, 1, sx, sy);
  drawTiles();
  ctx.setTransform(S, 0, 0, S, -Math.round(camX * S) + sx, OY + sy);
  for (const e of ents) {
    if (e.x > camX + VIEWW + 60 || e.x + (e.w || 0) < camX - 200) continue;
    ctx.save();
    if (e.dead && e.flip) { ctx.translate(e.x + e.w / 2, e.y + e.h / 2); ctx.scale(1, -1); ctx.translate(-(e.x + e.w / 2), -(e.y + e.h / 2)); }
    switch (e.t) {
      case 'g': drawGomi(e); break;
      case 'k': drawSnail(e); break;
      case 'b': drawBat(e); break;
      case 's': drawSpiky(e); break;
      case 'boss': drawBoss(e); break;
      case 'o': drawCoin(e.x + e.w / 2, e.y + e.h / 2, e.anim + timeT); break;
      case 'caramelo': case 'chile': case 'vida':
        if (e.emerge < 1) { ctx.beginPath(); ctx.rect(e.x - 10, e.ey - T - 10, e.w + 20, T + 10); ctx.clip(); }
        drawItem(e); break;
      case 'm': {
        const th = lvl.theme;
        const gr = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
        gr.addColorStop(0, th === 2 ? '#ffffff' : '#ffd24a'); gr.addColorStop(1, th === 2 ? '#c9d6ff' : '#c98a00');
        ctx.fillStyle = gr; rr(ctx, e.x, e.y, e.w, e.h, 7); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 1; i < 6; i++) ctx.fillRect(e.x + i * e.w / 6, e.y + 3, 2, e.h - 6);
        break;
      }
      case 'r': {
        ctx.fillStyle = '#3a3a48'; ctx.beginPath(); ctx.arc(e.cx, e.cy, 6, 0, 7); ctx.fill();
        for (let i = 0; i < e.n; i++) {
          const bx = e.cx + Math.cos(e.a) * i * 13, by = e.cy + Math.sin(e.a) * i * 13;
          const gr = ctx.createRadialGradient(bx, by, 1, bx, by, 9); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.5, '#ffa21a'); gr.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill();
        }
        break;
      }
      case 'fb': {
        const gr = ctx.createRadialGradient(e.x + 6, e.y + 6, 1, e.x + 6, e.y + 6, 10); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.5, '#ff8a1c'); gr.addColorStop(1, 'rgba(255,40,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(e.x + 6, e.y + 6, 10, 0, 7); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
  if (P && !P.hidden) drawPiru(P);
  // partículas
  for (const p of parts) {
    const a = 1 - p.t / p.life;
    if (p.coinPop) { drawCoin(p.x, p.y, p.t * 3, 0.9); continue; }
    if (p.chunk) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = '#c8602c'; ctx.fillRect(-7, -5, 14, 10); ctx.fillStyle = '#e0814a'; ctx.fillRect(-7, -5, 14, 3); ctx.restore(); continue; }
    ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const p of pops) { ctx.globalAlpha = 1 - p.t; text(p.text, p.x + 10, p.y - p.t * 40, p.text.length > 6 ? 14 : 13, '#fff'); ctx.globalAlpha = 1; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash + ')'; ctx.fillRect(0, 0, W, H); }
  renderHUD();
  if (state === 'play' && P.state === 'play') renderControls();
  if (state === 'pause') renderPause();
  if (state === 'clear') renderClear();
}
function renderHUD() {
  const s = TS * 0.55, y = TS * 0.75, m = TS * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, TS * 1.5);
  text('PUNTOS', m, y - s * 0.55, s * 0.55, '#ffd9e8', 'left');
  text(String(Math.floor(score)).padStart(6, '0'), m, y + s * 0.45, s, '#fff', 'left');
  ctx.save(); ctx.translate(W * 0.3, y); ctx.scale(S, S); drawCoin(0, 0, timeT, 0.8); ctx.restore();
  text('× ' + String(coins).padStart(2, '0'), W * 0.3 + TS * 0.55, y, s, '#fff', 'left');
  text('MUNDO', W * 0.5, y - s * 0.55, s * 0.55, '#ffd9e8');
  text('1-' + (lvlIndex + 1), W * 0.5, y + s * 0.45, s);
  ctx.save(); ctx.translate(W * 0.65, y); ctx.scale(S * 0.8, S * 0.8); swirl(ctx, 12, 0, '#ff4f8b', '#fff'); ctx.restore();
  text('× ' + lives, W * 0.65 + TS * 0.5, y, s, '#fff', 'left');
  text('TIEMPO', W * 0.8, y - s * 0.55, s * 0.55, '#ffd9e8');
  text(String(Math.ceil(timeLeft)), W * 0.8, y + s * 0.45, s, timeLeft < 60 ? '#ff6b6b' : '#fff');
  // botón pausa
  const b = BTN.pause;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.25, b.r * 0.8); ctx.fillRect(b.x + b.r * 0.1, b.y - b.r * 0.4, b.r * 0.25, b.r * 0.8);
}
function renderControls() {
  const t = pollTouch(), r = BTN.r;
  const circle = (b, on, draw, col) => {
    ctx.fillStyle = on ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = DPR * 2; ctx.stroke();
    ctx.fillStyle = col || 'rgba(255,255,255,0.9)'; draw(b);
  };
  const arrow = d => b => { ctx.beginPath(); ctx.moveTo(b.x + d * r * 0.4, b.y); ctx.lineTo(b.x - d * r * 0.25, b.y - r * 0.4); ctx.lineTo(b.x - d * r * 0.25, b.y + r * 0.4); ctx.closePath(); ctx.fill(); };
  circle(BTN.left, t.l, arrow(-1)); circle(BTN.right, t.rt, arrow(1));
  circle(BTN.jump, t.j, b => text('A', b.x, b.y + r * 0.04, r * 0.75, '#fff', 'center', false));
  circle(BTN.fire, t.f, b => text(P.power === 2 ? '🔥' : 'B', b.x, b.y + r * 0.04, r * (P.power === 2 ? 0.6 : 0.75), '#fff', 'center', false));
  text('SALTAR', BTN.jump.x, BTN.jump.y + r * 1.25, r * 0.28, 'rgba(255,255,255,0.8)');
  text(P.power === 2 ? 'FUEGO/CORRER' : 'CORRER', BTN.fire.x, BTN.fire.y + r * 1.25, r * 0.28, 'rgba(255,255,255,0.8)');
}
function panel(w, h) {
  ctx.fillStyle = 'rgba(10,5,25,0.6)'; ctx.fillRect(0, 0, W, H);
  const x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, x, y + 8 * DPR, w, h, 24 * DPR); ctx.fill();
  const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#3b2370'); gr.addColorStop(1, '#22134a');
  ctx.fillStyle = gr; rr(ctx, x, y, w, h, 24 * DPR); ctx.fill();
  ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = 3 * DPR; ctx.stroke();
  return { x, y };
}
function renderPause() {
  const w = Math.min(W * 0.5, H * 0.9), h = H * 0.78, p = panel(w, h);
  text('PAUSA', W / 2, p.y + h * 0.12, h * 0.09);
  const bw = w * 0.8, bh = h * 0.13, bx = W / 2 - bw / 2;
  uiButton('resume', bx, p.y + h * 0.24, bw, bh, 'Continuar');
  uiButton('music', bx, p.y + h * 0.42, bw, bh, 'Música: ' + (save.music ? 'Sí' : 'No'), { c1: '#7aa8ff', c2: '#3e6be8' });
  uiButton('sfx', bx, p.y + h * 0.60, bw, bh, 'Efectos: ' + (save.sfx ? 'Sí' : 'No'), { c1: '#7aa8ff', c2: '#3e6be8' });
  uiButton('quit', bx, p.y + h * 0.78, bw, bh, 'Salir al mapa', { c1: '#999', c2: '#666' });
}
function renderClear() {
  const w = Math.min(W * 0.55, H * 1.1), h = H * 0.7, p = panel(w, h);
  text('¡NIVEL SUPERADO!', W / 2, p.y + h * 0.15, h * 0.09, '#ffd24a');
  text(THEMES[lvl.theme].name, W / 2, p.y + h * 0.3, h * 0.06, '#ffd9e8');
  text('Puntos: ' + score, W / 2, p.y + h * 0.45, h * 0.07);
  const bw = w * 0.42, bh = h * 0.17;
  uiButton('menu', W / 2 - bw - w * 0.03, p.y + h * 0.66, bw, bh, 'Mapa', { c1: '#7aa8ff', c2: '#3e6be8' });
  uiButton('next', W / 2 + w * 0.03, p.y + h * 0.66, bw, bh, lvlIndex < LEVELS.length - 1 ? 'Siguiente' : 'Final');
}
function renderIntro() {
  ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, W, H);
  text('MUNDO 1-' + (lvlIndex + 1), W / 2, H * 0.32, H * 0.08, '#ffd9e8');
  text(THEMES[lvl.theme].name, W / 2, H * 0.45, H * 0.1, '#fff');
  ctx.save(); ctx.translate(W / 2 - H * 0.08, H * 0.66); ctx.scale(S * 1.5, S * 1.5); swirl(ctx, 14, timeT * 2, '#ff4f8b', '#fff'); eyes(ctx, 2, -2, 9, 1, false); ctx.restore();
  text('× ' + lives, W / 2 + H * 0.05, H * 0.66, H * 0.08);
}
function titleBg() {
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff8fc1'); gr.addColorStop(0.55, '#ffc9a8'); gr.addColorStop(1, '#8fd3ff');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H * 1.25); ctx.rotate(timeT * 0.08);
  for (let i = 0; i < 24; i++) { ctx.rotate(Math.PI / 12); ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.0)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-W * 0.12, -W * 1.5); ctx.lineTo(W * 0.12, -W * 1.5); ctx.fill(); }
  ctx.restore();
  for (let i = 0; i < 14; i++) {
    const x = (hash(i, 1) * W + timeT * 20 * DPR * (0.5 + hash(i, 2))) % (W + 100 * DPR) - 50 * DPR, y = H * (0.1 + hash(i, 3) * 0.8);
    ctx.save(); ctx.translate(x, y); ctx.scale(S * (0.6 + hash(i, 4)), S * (0.6 + hash(i, 4))); ctx.globalAlpha = 0.5;
    swirl(ctx, 12, timeT + i, ['#ff4f8b', '#4aa3ff', '#3ccf6b', '#ffb02e'][i % 4], '#fff'); ctx.restore();
  }
  ctx.fillStyle = '#62d13d'; ctx.fillRect(0, H * 0.86, W, H * 0.14); ctx.fillStyle = '#c27740'; ctx.fillRect(0, H * 0.9, W, H * 0.1);
}
function renderTitle() {
  if (AU.theme !== 4 && AU.ac) AU.playSong(4);
  titleBg();
  const bounce = Math.sin(timeT * 3) * H * 0.01;
  ctx.save(); ctx.translate(W / 2, H * 0.22 + bounce); ctx.rotate(-0.04);
  text('SÚPER', 0, -H * 0.03, H * 0.09, '#ffd24a');
  text('PIRU', 0, H * 0.1, H * 0.2, '#ffffff');
  ctx.restore();
  // Piru grande
  const fake = { x: 0, y: 0, w: 22, h: 54, vx: 175, vy: 0, dir: 1, power: 1, onGround: true, anim: timeT * 0.6, roll: timeT * 3, inv: 0, state: 'play', shootT: 0 };
  ctx.save(); ctx.translate(W / 2 - 11 * S * 2.2, H * 0.86 - 54 * S * 2.2); ctx.scale(S * 2.2, S * 2.2); drawPiru(fake); ctx.restore();
  if (Math.floor(timeT * 2) % 2 === 0) text('Toca para jugar', W / 2, H * 0.48, H * 0.065, '#fff');
  const bw = H * 0.32, bh = H * 0.1;
  uiButton('music', W - bw - H * 0.05, H * 0.05, bw, bh, '♪ ' + (save.music ? 'Sí' : 'No'), { c1: '#7aa8ff', c2: '#3e6be8' });
  text('La Piruleta Café Pan · Alcorcón', W / 2, H * 0.95, H * 0.035, '#fff');
}
function renderSelect() {
  titleBg();
  text('ELIGE MUNDO', W / 2, H * 0.12, H * 0.09);
  const n = LEVELS.length, gap = W * 0.025, cw = Math.min((W * 0.9 - gap * (n - 1)) / n, H * 0.55), ch = cw * 1.25;
  const x0 = W / 2 - (cw * n + gap * (n - 1)) / 2, y0 = H * 0.25;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap), locked = i >= save.unlocked, th = THEMES[i];
    uiButtons.push({ id: 'L' + i, x, y: y0, w: cw, h: ch });
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, x, y0 + 6 * DPR, cw, ch, 18 * DPR); ctx.fill();
    const gr = ctx.createLinearGradient(0, y0, 0, y0 + ch); gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
    ctx.fillStyle = gr; rr(ctx, x, y0, cw, ch, 18 * DPR); ctx.fill();
    ctx.save(); rr(ctx, x, y0, cw, ch, 18 * DPR); ctx.clip();
    ctx.fillStyle = th.dirt; ctx.fillRect(x, y0 + ch * 0.72, cw, ch * 0.28);
    ctx.fillStyle = th.top; ctx.fillRect(x, y0 + ch * 0.72, cw, ch * 0.06);
    ctx.save(); ctx.translate(x + cw / 2, y0 + ch * 0.5); ctx.scale(cw / 80, cw / 80);
    if (i === 0) drawGomi({ x: -13, y: -28, w: 26, h: 28, anim: timeT, vx: 1 });
    else if (i === 1) drawBat({ x: -13, y: -10, w: 26, h: 20, anim: timeT });
    else if (i === 2) drawSnail({ x: -13, y: -30, w: 26, h: 30, anim: timeT, vx: 1, mode: 'walk' });
    else { ctx.scale(0.55, 0.55); const fp = P; P = { x: 0 }; drawBoss({ x: -36, y: -50, w: 72, h: 72, anim: timeT, hurt: 0, hp: 12 }); P = fp; }
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = locked ? '#555' : '#fff'; ctx.lineWidth = 4 * DPR; rr(ctx, x, y0, cw, ch, 18 * DPR); ctx.stroke();
    text('1-' + (i + 1), x + cw / 2, y0 + ch * 0.12, cw * 0.14);
    text(th.name, x + cw / 2, y0 + ch * 0.86, cw * 0.075);
    if (save.best[i]) text('★ ' + save.best[i], x + cw / 2, y0 + ch * 0.95, cw * 0.06, '#ffd24a');
    if (locked) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x, y0, cw, ch, 18 * DPR); ctx.fill(); text('🔒', x + cw / 2, y0 + ch / 2, cw * 0.25, '#fff', 'center', false); }
  }
  uiButton('back', H * 0.05, H * 0.04, H * 0.3, H * 0.1, '‹ Volver', { c1: '#999', c2: '#666' });
}
function renderOver() {
  ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, W, H);
  text('FIN DE LA PARTIDA', W / 2, H * 0.35, H * 0.1, '#ff6b8b');
  text('Puntos: ' + score, W / 2, H * 0.5, H * 0.07);
  const bw = H * 0.6, bh = H * 0.13; uiButton('menu', W / 2 - bw / 2, H * 0.65, bw, bh, 'Volver al mapa');
}
function renderWin() {
  titleBg();
  text('¡HAS GANADO!', W / 2, H * 0.2, H * 0.12, '#ffd24a');
  text('Piru ha vencido al Rey Chicle', W / 2, H * 0.34, H * 0.06);
  text('Puntos: ' + score, W / 2, H * 0.45, H * 0.07);
  const fake = { x: 0, y: 0, w: 22, h: 54, vx: 0, vy: 0, dir: 1, power: 2, onGround: true, anim: 0, roll: timeT * 2, inv: 0, state: 'play', shootT: 0 };
  ctx.save(); ctx.translate(W / 2 - 11 * S * 2, H * 0.86 - 54 * S * 2 - Math.abs(Math.sin(timeT * 5)) * H * 0.05); ctx.scale(S * 2, S * 2); drawPiru(fake); ctx.restore();
  const bw = H * 0.6, bh = H * 0.12; uiButton('menu', W / 2 - bw / 2, H * 0.55, bw, bh, 'Volver al mapa');
}

/* ---------- Arranque ---------- */
resize();
go('title');
requestAnimationFrame(frame);
