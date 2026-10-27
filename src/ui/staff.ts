import { TPB, type Note } from '../engine/types.ts';
import { toGlyphs, type Glyph } from '../engine/score.ts';
import { spell, keySignatureSteps, keyAccidental, accidentalSymbol } from '../engine/theory.ts';

// 높은음자리표 한 줄 악보를 SVG로 그린다. 음표마다 색·라벨·탭 선택을 직접 제어하기 위해 라이브러리를 쓰지 않는다.
const S = 10; // 줄 간격
const TOP = 40;
const HEIGHT = 158;
const y = (step: number) => TOP + (38 - step) * (S / 2);
const NS = 'http://www.w3.org/2000/svg';

export interface StaffOptions {
  notes: Note[];
  fifths: number;
  beatsPerBar: number;
  bars: number;
  /** Note 인덱스별 색 */
  color?: (src: number) => string | undefined;
  /** Note 인덱스별 아래 라벨 */
  label?: (src: number) => string | undefined;
  /** 이 인덱스 앞에 커서를 그린다 (notes.length면 끝) */
  cursor?: number;
  selected?: number | null;
  onTap?: (src: number) => void;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

const width = (g: Glyph) => Math.max(24, g.ticks * 2.2);

export function renderStaff(o: StaffOptions): SVGSVGElement {
  const glyphs = toGlyphs(o.notes, o.beatsPerBar);
  const svg = el('svg', { class: 'staff', height: HEIGHT });
  const ink = 'var(--ink)';

  // 머리: 음자리표, 조표, 박자표
  const clef = el('text', { x: 2, y: y(30) + 7, 'font-size': 58, fill: ink, class: 'clef' }, svg);
  clef.textContent = '𝄞';
  let x = 40;
  for (const k of keySignatureSteps(o.fifths)) {
    const t = el('text', { x, y: y(k.step) + 4, 'font-size': 15, fill: ink }, svg);
    t.textContent = accidentalSymbol(k.acc);
    x += 8;
  }
  x += 4;
  for (const [num, step] of [[o.beatsPerBar, 34], [4, 30]]) {
    const t = el('text', { x, y: y(step) - 1, 'font-size': 21, 'font-weight': 700, fill: ink }, svg);
    t.textContent = String(num);
  }
  x += 26;

  const len = o.beatsPerBar * TPB;
  const positions: number[] = [];
  const steps: number[] = [];
  const colors: string[] = [];
  const groups = beamGroups(glyphs);
  const beamed = new Set(groups.flat());
  const cursorX: Record<number, number> = {};
  let accState = new Map<number, number>();
  let bar = 0;
  const barLine = (bx: number) => el('line', { x1: bx, x2: bx, y1: y(38), y2: y(30), stroke: ink, 'stroke-width': 1 }, svg);

  glyphs.forEach((g, i) => {
    while (g.bar > bar) {
      x += 4;
      barLine(x);
      x += 10;
      bar++;
      accState = new Map();
    }
    if (!(g.src in cursorX)) cursorX[g.src] = x - 6;
    const color = o.color?.(g.src) ?? (o.selected === g.src ? 'var(--select)' : ink);
    colors.push(color);
    const grp = el('g', { fill: color, stroke: color }, svg);
    let hx = x + 10;
    if (g.midi !== null) {
      const sp = spell(g.midi, o.fifths);
      const cur = accState.get(sp.step) ?? keyAccidental(sp.letter, o.fifths);
      if (cur !== sp.acc && !(i > 0 && glyphs[i - 1].tie && glyphs[i - 1].midi === g.midi)) {
        const t = el('text', { x: hx - 4, y: y(sp.step) + 5, 'font-size': 15, stroke: 'none' }, grp);
        t.textContent = accidentalSymbol(sp.acc);
        hx += 10;
      }
      accState.set(sp.step, sp.acc);
      drawNote(grp, g, hx, sp.step, beamed.has(i));
      steps.push(sp.step);
    } else {
      drawRest(grp, g, hx);
      steps.push(34);
    }
    positions.push(hx);
    // 탭 영역
    if (o.onTap) {
      const hit = el('rect', { x: hx - 12, y: 0, width: 24, height: HEIGHT - 20, fill: 'transparent', stroke: 'none' }, grp);
      hit.addEventListener('click', () => o.onTap!(g.src));
    }
    const lab = o.label?.(g.src);
    if (lab && glyphs.findIndex((h) => h.src === g.src) === i) {
      const t = el('text', { x: hx, y: HEIGHT - 6, 'font-size': 11, 'text-anchor': 'middle', stroke: 'none' }, grp);
      t.textContent = lab;
    }
    x = hx + width(g) - 10 + (g.dotted ? 4 : 0);
  });

  // 빔: 같은 박 안의 8분·16분음표 꼬리를 잇는다
  for (const grp of groups) drawBeam(svg, grp.map((i) => ({ x: positions[i], step: steps[i], value: glyphs[i].value, color: colors[i] })), ink);

  // 붙임줄
  glyphs.forEach((g, i) => {
    if (!g.tie || !glyphs[i + 1] || g.midi === null) return;
    const st = spell(g.midi, o.fifths).step;
    const up = st >= 34;
    const yy = y(st) + (up ? -7 : 7);
    const x1 = positions[i] + 5, x2 = positions[i + 1] - 5;
    el('path', { d: `M${x1} ${yy} Q${(x1 + x2) / 2} ${yy + (up ? -8 : 8)} ${x2} ${yy}`, fill: 'none', stroke: o.color?.(g.src) ?? ink, 'stroke-width': 1.3 }, svg);
  });

  // 셋잇단 표시: 이어진 셋잇단 글리프 묶음마다 "3"
  for (let i = 0; i < glyphs.length; i++) {
    if (!glyphs[i].triplet) continue;
    let j = i, ticks = 0;
    while (j < glyphs.length && glyphs[j].triplet && ticks < TPB) ticks += glyphs[j++].ticks;
    const t = el('text', { x: (positions[i] + positions[j - 1]) / 2, y: y(44), 'font-size': 11, 'text-anchor': 'middle', 'font-style': 'italic', fill: ink }, svg);
    t.textContent = '3';
    el('path', { d: `M${positions[i] - 3} ${y(43)} v-3 H${positions[j - 1] + 3} v3`, fill: 'none', stroke: ink, 'stroke-width': 0.8 }, svg);
    i = j - 1;
  }

  // 마지막으로 그린 마디를 닫고, 아직 안 적은 빈 마디를 그린다
  const total = o.notes.reduce((t, n) => t + n.dur, 0);
  const endX = x + 6;
  cursorX[o.notes.length] = endX - 4;
  const closeBar = (last: boolean) =>
    el('line', { x1: x, x2: x, y1: y(38), y2: y(30), stroke: ink, 'stroke-width': last ? 3 : 1 }, svg);
  let started = 0;
  if (total > 0) {
    started = bar + 1;
    x = endX + (total % len ? 30 : 0);
    closeBar(started >= o.bars);
  }
  for (let k = started; k < o.bars; k++) {
    x += 70;
    closeBar(k === o.bars - 1);
  }
  x += 12;

  // 오선
  for (let s = 30; s <= 38; s += 2) el('line', { x1: 0, x2: x, y1: y(s), y2: y(s), stroke: 'var(--muted)', 'stroke-width': 0.9, opacity: 0.55 }, svg);

  if (o.cursor !== undefined && o.selected == null) {
    const cx = cursorX[o.cursor] ?? endX;
    el('rect', { x: cx - 1, y: y(40), width: 2.5, height: y(28) - y(40), fill: 'var(--accent)', class: 'cursor' }, svg);
  }
  svg.setAttribute('width', String(x));
  svg.setAttribute('viewBox', `0 0 ${x} ${HEIGHT}`);
  return svg;
}

/** 빔으로 묶을 글리프 인덱스 묶음: 같은 마디·같은 박 안에서 이어진 8분 이하 음표 2개 이상 */
function beamGroups(glyphs: Glyph[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  const key = (g: Glyph) => `${g.bar}:${Math.floor(g.start / TPB)}`;
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  glyphs.forEach((g, i) => {
    const ok = g.midi !== null && g.value <= 6;
    if (!ok) return flush();
    if (cur.length && key(glyphs[cur[cur.length - 1]]) !== key(g)) flush();
    cur.push(i);
  });
  flush();
  return out;
}

function drawBeam(svg: SVGSVGElement, notes: { x: number; step: number; value: number; color: string }[], ink: string) {
  const up = notes.reduce((a, n) => a + n.step, 0) / notes.length < 34;
  const d = up ? -1 : 1; // 기둥이 뻗는 방향
  const sx = notes.map((n) => n.x + (up ? 5 : -5));
  const ny = notes.map((n) => y(n.step));
  const x0 = sx[0], x1 = sx[sx.length - 1];
  let y0 = ny[0] + d * 30, y1 = ny[ny.length - 1] + d * 30;
  y1 = y0 + Math.max(-8, Math.min(8, y1 - y0)); // 기울기 제한
  const at = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  // 모든 기둥이 최소 24는 되도록 빔을 바깥으로 민다
  const shift = Math.max(0, ...notes.map((_, k) => (up ? at(sx[k]) - (ny[k] - 24) : ny[k] + 24 - at(sx[k]))));
  y0 += d * shift;
  y1 += d * shift;
  notes.forEach((n, k) => el('line', { x1: sx[k], x2: sx[k], y1: ny[k], y2: at(sx[k]), stroke: n.color, 'stroke-width': 1.3 }, svg));
  const bar = (xa: number, xb: number, level: number) => {
    const o = -d * level * 6;
    el('path', { d: `M${xa} ${at(xa) + o} L${xb} ${at(xb) + o} L${xb} ${at(xb) + o - d * 4} L${xa} ${at(xa) + o - d * 4} Z`, fill: ink, stroke: 'none' }, svg);
  };
  bar(x0, x1, 0);
  // 16분음표: 이어진 것끼리 둘째 빔, 홀로 있으면 짧은 토막
  for (let k = 0; k < notes.length; k++) {
    if (notes[k].value > 3) continue;
    let j = k;
    while (j + 1 < notes.length && notes[j + 1].value <= 3) j++;
    if (j > k) bar(sx[k], sx[j], 1);
    else bar(k === notes.length - 1 ? sx[k] - 7 : sx[k], k === notes.length - 1 ? sx[k] : sx[k] + 7, 1);
    k = j;
  }
}

function drawNote(g: SVGGElement, gl: Glyph, x: number, step: number, beamed = false) {
  const yy = y(step);
  for (let s = 28; s >= step; s -= 2) el('line', { x1: x - 9, x2: x + 9, y1: y(s), y2: y(s), 'stroke-width': 1 }, g);
  for (let s = 40; s <= step; s += 2) el('line', { x1: x - 9, x2: x + 9, y1: y(s), y2: y(s), 'stroke-width': 1 }, g);
  const filled = gl.value <= 12;
  el('ellipse', {
    cx: x, cy: yy, rx: 5.6, ry: 4, transform: `rotate(-20 ${x} ${yy})`,
    ...(filled ? { 'stroke-width': 0 } : { fill: 'none', 'stroke-width': 1.6 }),
  }, g);
  if (gl.dotted) el('circle', { cx: x + 10, cy: step % 2 === 0 ? yy - 4 : yy, r: 1.8, stroke: 'none' }, g);
  if (gl.value >= 48 || beamed) return;
  const up = step < 34;
  const sx = up ? x + 5 : x - 5;
  const ey = up ? yy - 32 : yy + 32;
  el('line', { x1: sx, x2: sx, y1: yy, y2: ey, 'stroke-width': 1.3 }, g);
  const flags = gl.value === 6 ? 1 : gl.value === 3 ? 2 : 0;
  for (let f = 0; f < flags; f++) {
    const fy = ey + (up ? f * 7 : -f * 7);
    el('path', { d: up ? `M${sx} ${fy} q2 8 8 12 q-3 -5 -8 -6` : `M${sx} ${fy} q2 -8 8 -12 q-3 5 -8 6`, 'stroke-width': 1.2 }, g);
  }
}

function drawRest(g: SVGGElement, gl: Glyph, x: number) {
  if (gl.value >= 48) el('rect', { x: x - 6, y: y(36), width: 12, height: 5, stroke: 'none' }, g);
  else if (gl.value === 24) el('rect', { x: x - 6, y: y(34) - 5, width: 12, height: 5, stroke: 'none' }, g);
  else if (gl.value === 12)
    el('path', { d: `M${x - 3} ${y(37)} l6 7 l-5 5 l6 7 q-7 -3 -4 6`, fill: 'none', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
  else {
    const n = gl.value === 6 ? 1 : 2;
    for (let k = 0; k < n; k++) el('circle', { cx: x - 3 + k * 1.5, cy: y(35) + k * 6, r: 2.3, stroke: 'none' }, g);
    el('line', { x1: x + 3, y1: y(35), x2: x - 2, y2: y(31) + (n - 1) * 3, 'stroke-width': 1.4 }, g);
  }
  if (gl.dotted) el('circle', { cx: x + 9, cy: y(35), r: 1.8, stroke: 'none' }, g);
}
