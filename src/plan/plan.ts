/* Plano 2D animado: se dibuja en SVG a partir del layout (metros) y se
   anima reproduciendo el log de eventos de la simulación. */
import type { LogEv, Sample, SimResult } from '../engine/simulate';
import { PROCESSES, type Layout, type PlanBackground, type ProcessKey, type Warehouse, type Zone, type ZoneKind } from '../model/types';
import { autoLayout } from '../model/layout';
import { DAY, fmtHM, hm } from '../model/time';
import { nf, t } from '../i18n';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const trunc = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

export interface PlayState {
  inDoor: number; stB: number; stU: number; stL: number; openB: number; openU: number;
  unl: number; trucks: number; sorted: number; rv: number; br: number; rc0: number; picked: number;
  bk: Record<string, number>; closed: Record<string, boolean>;
  lane: number[]; lanePk: number[]; tk: number[]; tkPk: number[]; tkLeft: (number | null)[];
  route: number[]; pm: boolean[];
  hos: number; hosR: number; hosD: number;
  /** Retornos: paquetes en estantería, esperando RT-1, cajas llenas y camión RT-2 en la puerta. */
  shelf: number; rtq: number; boxes: number; rt2: number;
}

export function freshState(w: Warehouse): PlayState {
  const n = w.groups.length, R = w.routes.count;
  return { inDoor: 0, stB: 0, stU: 0, stL: 0, openB: 0, openU: 0, unl: 0, trucks: 0, sorted: 0, rv: 0, br: 0, rc0: 0, picked: 0,
    bk: {}, closed: {}, lane: new Array(n).fill(0), lanePk: new Array(n).fill(0), tk: new Array(n).fill(0), tkPk: new Array(n).fill(0), tkLeft: new Array(n).fill(null),
    route: new Array(R).fill(0), pm: new Array(R).fill(false), hos: 0, hosR: 0, hosD: 0, shelf: 0, rtq: 0, boxes: 0, rt2: 0 };
}

export type Fx = (kind: 'sort' | 'stage' | 'load' | 'route', a: string | number, b?: string | null) => void;

export function apply(S: PlayState, e: LogEv, fx?: Fx): void {
  const n = (e.n as number) ?? 0;
  switch (e.e) {
    case 'inA': S.inDoor++; S.trucks++; break;
    case 'inD': S.inDoor--; break;
    case 'unl': S.unl++; if (e.k === 'b') S.stB++; else if (e.k === 'u') S.stU++; else S.stL++; break;
    case 'decS': if (e.k === 'b') { S.stB--; S.openB++; } else { S.stU--; S.openU++; } break;
    case 'decE': if (e.k === 'b') S.openB--; else S.openU--; break;
    case 'lrel': S.stL -= n; break;
    case 'sortE': { const k = e.sk as string; S.bk[k] = (S.bk[k] ?? 0) + 1; S.closed[k] = false; S.sorted++; fx?.('sort', k); break; }
    case 'close': for (const k of Object.keys(S.bk)) if (S.bk[k] > 0) S.closed[k] = true; break;
    case 'rvS': S.bk[e.sk as string] -= n; break;
    case 'rvE': S.rv += n; break;
    case 'stage': { const g = e.g as number; if (e.sk) S.bk[e.sk as string] -= n; S.lane[g]++; S.lanePk[g] += n; fx?.('stage', g, e.sk as string | null); break; }
    case 'brT': if (e.sk) S.bk[e.sk as string] -= n; S.rc0 += n; break;
    case 'brE': { let first: number | null = null; for (const [r, c] of Object.entries(e.rc as Record<string, number>)) { S.route[+r] += c; S.br += c; if (first == null) first = +r; } if (first != null) fx?.('route', first); break; }
    case 'pmA': S.pm[e.r as number] = true; break;
    case 'pick': S.route[e.r as number] -= n; S.picked += n; S.pm[e.r as number] = false; break;
    case 'otA': { const g = e.g as number; S.tk[g] = 1; S.tkPk[g] = 0; break; }
    case 'ld': { const g = e.g as number; S.lane[g]--; S.lanePk[g] -= n; S.tkPk[g] += n; S.rc0 += n; fx?.('load', g); break; }
    case 'otD': { const g = e.g as number; S.tk[g] = 0; S.tkLeft[g] = e.t; break; }
    case 'hosIn': S.hos++; break;
    case 'hosOut': S.hos--; if (e.k === 'r') S.hosR++; else S.hosD++; break;
    case 'shelf0': S.shelf = n; break;
    case 'dv1': S.shelf += n; break;
    case 'cust': S.shelf--; break;
    case 'exp': S.shelf -= n; break;
    case 'rtIn': S.rtq += n; break;
    case 'rt1': S.rtq--; break;
    case 'box': S.boxes++; break;
    case 'rt2A': S.boxes -= n; S.rt2 = 1; break;
    case 'rt2D': S.rt2 = 0; break;
  }
}

/* --------------------------- geometría --------------------------- */
/** Unidades de dibujo por metro (con 20, los textos del plano miden lo mismo que en el esquemático original). */
export const K = 20;
type Box = { x: number; y: number; w: number; h: number };
export interface Geo {
  so: number[]; br: number[];
  bk: Record<string, Box>;
  lane: Record<number, { cx: number; cy: number }>;
  door: Record<number, { cx: number; cy: number }>;
  route: Box[];
  dots: Record<ProcessKey, number>;
  sortC: [number, number]; rvC: [number, number]; brC: [number, number];
}

/** Layout a dibujar: el de la bodega o, si todavía no tiene, el de por defecto. */
export const viewLayout = (w: Warehouse): Layout => w.layout ?? autoLayout(w);

/** Pared más cercana a una zona: ahí afuera se dibuja el camión. */
export function side(z: Zone, L: Layout): 'l' | 'r' | 't' | 'b' {
  const d = { l: z.x, r: L.widthM - (z.x + z.w), t: z.y, b: L.heightM - (z.y + z.h) };
  return (['r', 'l', 't', 'b'] as const).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** viewBox (unidades de dibujo) con lugar afuera para los camiones de salida. */
export function planBox(L: Layout): Box {
  const m = { l: 1, r: 1, t: 1.5, b: 1 };
  L.zones.filter(z => z.kind === 'outDoor').forEach(z => { m[side(z, L)] = 8; });
  // también entran las zonas que quedaron fuera de las paredes
  const x0 = Math.min(0, ...L.zones.map(z => z.x)), y0 = Math.min(0, ...L.zones.map(z => z.y));
  const x1 = Math.max(L.widthM, ...L.zones.map(z => z.x + z.w)), y1 = Math.max(L.heightM, ...L.zones.map(z => z.y + z.h));
  return { x: (x0 - m.l) * K, y: (y0 - m.t) * K, w: (x1 - x0 + m.l + m.r) * K, h: (y1 - y0 + m.t + m.b) * K };
}

/** Fondo: imagen o trazos del CAD, escalados a metros. */
export function backgroundSvg(bg: PlanBackground | null | undefined): string {
  if (!bg) return '';
  const k = bg.scale * K;
  return bg.kind === 'image'
    ? `<image href="${esc(bg.data)}" x="0" y="0" width="${bg.w * k}" height="${bg.h * k}" preserveAspectRatio="none" class="p-bgimg"/>`
    : `<path class="p-cad" d="${esc(bg.data)}" transform="scale(${k})"/>`;
}

export function buildPlan(svg: SVGSVGElement, w: Warehouse, bg: PlanBackground | null): Geo {
  const L = viewLayout(w), gs = w.groups, so: number[] = [], br: number[] = [];
  gs.forEach((g, i) => (g.dest === 'branch' ? br : so).push(i));
  const G: Geo = { so, br, bk: {}, lane: {}, door: {}, route: [], dots: {} as Record<ProcessKey, number>, sortC: [0, 0], rvC: [0, 0], brC: [0, 0] };
  const vb = planBox(L);
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const Z = (kind: ZoneKind, ref = ''): Zone | undefined => L.zones.find(z => z.kind === kind && z.ref === ref);
  // se dibuja 1 unidad hacia adentro para que dos zonas que se tocan se vean separadas
  const R = (z: Zone): Box => ({ x: z.x * K + 1, y: z.y * K + 1, w: Math.max(6, z.w * K - 2), h: Math.max(6, z.h * K - 2) });
  const W = L.widthM * K, H = L.heightM * K;
  const people = Math.max(0, ...w.shifts.map(s => PROCESSES.reduce((a, p) => a + (s.staff[p] || 0), 0)));
  // shortcut: se dibujan como mucho `max` puntos por zona; alcanza para bodegas de hasta ~40 personas por turno
  const dots = (k: ProcessKey, x: number, y: number, per: number, gap: number, max = per * 2): string => {
    const n2 = Math.min(people, max);
    G.dots[k] = n2;
    let s = '';
    for (let i = 0; i < n2; i++) s += `<circle id="w${k}${i}" class="w-dot" cx="${x + (i % per) * gap}" cy="${y + Math.floor(i / per) * gap}" r="4"><title>${t('p.' + k)}</title></circle>`;
    return s;
  };
  const area = (r: Box, title: string, sub = ''): string => `<rect class="p-area" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6"/><text class="p-az" x="${r.x + 7}" y="${r.y + 14}">${title}</text>${sub ? `<text class="p-sm" x="${r.x + 7}" y="${r.y + 25}">${sub}</text>` : ''}`;

  let h = `<defs><pattern id="pgrid" width="${K}" height="${K}" patternUnits="userSpaceOnUse"><path d="M${K} 0H0V${K}" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>`;
  h += backgroundSvg(bg);
  h += `<rect class="p-floor${bg ? ' bg' : ''}" x="0" y="0" width="${W}" height="${H}"/><rect class="p-wall" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;

  /* entrada, desconsolidación y hospital */
  const zi = Z('inbound');
  if (zi) {
    const r = R(zi);
    h += area(r, t('plan.inbound'), t('plan.unloading')) + `<text class="p-sm" id="ind" x="${r.x + 7}" y="${r.y + 37}"></text>`;
    const cols = Math.max(1, Math.floor((r.w - 14) / 11.5)), rows = Math.max(0, Math.floor((r.h - 81) / 11));
    for (let i = 0; i < Math.min(24, cols * rows); i++) h += `<rect id="ibx${i}" class="p-box" x="${r.x + 7 + (i % cols) * 11.5}" y="${r.y + 43 + Math.floor(i / cols) * 11}" width="9" height="9" rx="1.2" style="display:none"/>`;
    h += `<text class="p-md" id="stB" x="${r.x + 7}" y="${r.y + r.h - 32}"></text><text class="p-md" id="stU" x="${r.x + 7}" y="${r.y + r.h - 20}"></text><text class="p-md" id="stL" x="${r.x + 7}" y="${r.y + r.h - 8}"></text>`;
    h += dots('unload', r.x + r.w - 30, r.y + 12, 3, 10);
  }
  const zd = Z('decon');
  if (zd) { const r = R(zd); h += area(r, `<tspan style="font-size:7.6px;letter-spacing:0">${t('plan.decon')}</tspan>`) + `<text class="p-val" id="opn" x="${r.x + 7}" y="${r.y + 36}"></text>` + dots('decon', r.x + r.w - 30, r.y + r.h - 22, 3, 10); }
  const zh = Z('hospital');
  if (zh) { const r = R(zh); h += area(r, t('plan.hospital')) + `<text class="p-val" id="hos" x="${r.x + 7}" y="${r.y + 36}"></text><text class="p-sm" id="hosd" x="${r.x + 7}" y="${r.y + 50}"></text>` + dots('hospital', r.x + r.w - 30, r.y + 12, 3, 10); }

  /* sorting de entrada: la cinta existe solo con sorter (manual y Pick to Light se hacen a pie) */
  const zs = Z('sort');
  if (zs) {
    const r = R(zs), ST = w.sorting.type, n = ST === 'sorter' ? w.sorting.sorter.inductionPoints : w.capacity.stations.sort;
    G.sortC = [r.x + r.w / 2, r.y + r.h / 2];
    if (ST === 'sorter') {
      const by = r.y + r.h - 18;
      let rolls = '';
      for (let x = r.x + 8; x < r.x + r.w - 4; x += 12) rolls += `<line class="p-roll" x1="${x}" y1="${by + 1}" x2="${x}" y2="${by + 13}"/>`;
      h += `<rect class="p-belt" x="${r.x}" y="${by}" width="${r.w}" height="14" rx="3"/>${rolls}`;
      G.sortC = [r.x + 10, by + 7];
    } else h += `<rect class="p-area" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6"/>`;
    const gap = Math.max(4, Math.min(22, (r.w - 20) / Math.max(1, n)));
    for (let i = 0; i < n; i++) h += `<rect class="p-st" x="${r.x + 8 + i * gap}" y="${r.y + 5}" width="${Math.min(16, gap - 3)}" height="15" rx="2"/>`;
    const label = ST === 'sorter' ? t('plan.sorter', { b: w.sorting.sorter.chutes }) : ST === 'ptl' ? t('plan.ptl') : t('plan.scan1');
    h += `<text class="p-az" x="${r.x + 8}" y="${r.y + 33}">${label}</text><text class="p-sm" id="sq" x="${r.x + 16 + label.length * 6.4}" y="${r.y + 33}"></text>`;
    if (r.h > 44) h += dots('sort', r.x + 12, r.y + 45, Math.max(1, Math.floor((r.w - 24) / 11)), 11, 42);
  }

  /* zonas de canastos de cada grupo */
  gs.forEach((g, gi) => {
    const z = Z('group', g.id);
    if (!z) return;
    const r = R(z), m = g.services.length;
    const cols = Math.max(1, Math.min(m, Math.floor((r.w - 8) / 46))), rows = Math.max(1, Math.ceil(m / cols));
    const bw = Math.max(8, Math.min(74, (r.w - 10 - 6 * (cols - 1)) / cols)), bh = Math.max(8, Math.min(58, (r.h - 32 - 6 * (rows - 1)) / rows));
    h += `<g><rect class="p-zone ${g.reverify ? 'rc' : ''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="7"/><title>${esc(g.name)}</title>`;
    h += `<text class="p-zt" x="${r.x + 7}" y="${r.y + 15}">${esc(trunc(g.name, Math.floor((r.w - 12) / 6.1)))}</text>`;
    g.services.forEach((sv, j) => {
      const b = { x: r.x + 5 + (j % cols) * (bw + 6), y: r.y + 26 + Math.floor(j / cols) * (bh + 6), w: bw, h: bh }, id = gi + '-' + j;
      G.bk[id] = b;
      h += `<g><title>${esc(sv.name)}</title><rect id="bkr${id}" class="p-bk" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4"/>`;
      h += `<rect id="bkf${id}" class="p-bkf ${g.reverify ? 'rc' : ''}" x="${b.x + 1.5}" y="${b.y + b.h - 1.5}" width="${b.w - 3}" height="0" rx="2.5"/>`;
      h += `<text class="p-bkn" x="${b.x + b.w / 2}" y="${b.y + 12}">${esc(trunc(sv.name, Math.max(3, Math.floor(b.w / 5.2))))}</text><text class="p-bkc" id="bkc${id}" x="${b.x + b.w / 2}" y="${b.y + b.h - 6}"></text></g>`;
    });
    h += `</g>`;
  });

  /* reverificación (Scan 2) */
  const zr = Z('reverify');
  if (zr) {
    const r = R(zr), n = w.capacity.stations.reverify, vert = r.h >= r.w;
    G.rvC = [r.x + r.w / 2, r.y + r.h / 2];
    h += `<rect class="p-area" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6"/><text class="p-az" x="${r.x + 5}" y="${r.y + 12}" style="font-size:9px">${t('plan.scan2')}</text><text class="p-sm" x="${r.x + 5}" y="${r.y + 22}" style="font-size:8px">${t('plan.reverif')}</text>`;
    const len = vert ? Math.max(4, Math.min(26, (r.h - 70 - 4 * (n - 1)) / n)) : Math.max(4, Math.min(44, (r.w - 12 - 4 * (n - 1)) / n));
    for (let i = 0; i < n; i++) h += vert ? `<rect class="p-st2" x="${r.x + 6}" y="${r.y + 28 + i * (len + 4)}" width="${Math.min(44, r.w - 12)}" height="${len}" rx="3"/>` : `<rect class="p-st2" x="${r.x + 6 + i * (len + 4)}" y="${r.y + 28}" width="${len}" height="${Math.min(26, r.h - 34)}" rx="3"/>`;
    const qy = vert ? r.y + 38 + n * (len + 4) : r.y + r.h - 6;
    h += `<text class="p-sm" id="rvq" x="${r.x + 5}" y="${qy}"></text>` + (vert ? dots('reverify', r.x + 10, qy + 14, Math.max(1, Math.floor((r.w - 14) / 10)), 10) : '');
  }

  /* Stage out: un carril por grupo, con su puerta y su camión afuera */
  const K2 = w.capacity.stageOutSlots, lanes = so.map(gi => Z('stage', gs[gi].id)).filter((z): z is Zone => !!z);
  if (lanes.length) {
    const ux = Math.min(...lanes.map(z => z.x)) * K, uy = Math.min(...lanes.map(z => z.y)) * K, uy1 = Math.max(...lanes.map(z => z.y + z.h)) * K;
    h += `<text class="p-az" x="${ux + 2}" y="${uy - 6}">${t('plan.stageout')}</text><text class="p-sm" x="${ux + 82}" y="${uy - 6}">${t('plan.stageoutSub')}</text>`;
    h += dots('load', ux + 48, uy1 + 14, 8, 10, 8) + `<text class="p-az" x="${ux + 2}" y="${uy1 + 18}" style="font-size:9px">${t('plan.load')}</text>`;
  }
  let dockLabel = false;
  so.forEach(gi => {
    const g = gs[gi], zl = Z('stage', g.id), zo = Z('outDoor', g.id);
    if (zl) {
      const r = R(zl), cy = r.y + r.h / 2;
      G.lane[gi] = { cx: r.x + Math.min(r.w, 90), cy };
      h += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="var(--surface-2)" stroke="var(--line-2)"/>`;
      h += `<text class="p-md" x="${r.x + 6}" y="${cy - 1}">${esc(trunc(g.name.replace(/ Branch$/, ''), 12))}</text><text class="p-sm" id="lnp${gi}" x="${r.x + 6}" y="${cy + 10}"></text>`;
      const sw = Math.max(3, Math.min(22, (r.w - 96 - 3 * (K2 - 1)) / K2)), shh = Math.max(3, Math.min(r.h - 14, 22));
      for (let i = 0; i < K2; i++) h += `<rect id="sl${gi}_${i}" class="p-slot${g.reverify ? '' : ' dir'}" x="${r.x + 84 + i * (sw + 3)}" y="${r.y + (r.h - shh) / 2}" width="${sw}" height="${shh}" rx="3"/>`;
      h += `<text class="p-ovf" id="lno${gi}" x="${r.x + 86 + K2 * (sw + 3)}" y="${cy + 3}"></text>`;
    }
    if (zo) {
      const r = R(zo), cx = r.x + r.w / 2, cy = r.y + r.h / 2, sd = side(zo, L);
      G.door[gi] = { cx, cy };
      h += `<rect class="p-dock" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1"/>`;
      const tw = 118, th = Math.max(14, Math.min(40, (sd === 'l' || sd === 'r' ? r.h : r.w) - 2));
      const tx = sd === 'r' ? W + 12 : sd === 'l' ? -12 - tw : cx - tw / 2, ty = sd === 't' ? -12 - th : sd === 'b' ? H + 12 : cy - th / 2;
      const cab = sd === 'r' ? `<rect x="${tx + tw + 2}" y="${ty + th * 0.15}" width="24" height="${th * 0.7}" rx="4" fill="var(--text-2)" opacity=".7"/>` : sd === 'l' ? `<rect x="${tx - 26}" y="${ty + th * 0.15}" width="24" height="${th * 0.7}" rx="4" fill="var(--text-2)" opacity=".7"/>` : '';
      h += `<g id="tk${gi}" class="tk"><rect class="b" x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="4"/>${cab}`;
      h += `<text class="p-md" x="${tx + 8}" y="${ty + th / 2 - (th > 28 ? 2 : -3)}">${esc(trunc(g.name.replace(/ Branch$/, ''), 14))}</text>`;
      h += (th > 28 ? `<text class="p-sm" id="tks${gi}" x="${tx + 8}" y="${ty + th / 2 + 10}"></text>` : '') + `</g>`;
      if (!dockLabel) { h += `<text class="p-az" x="${tx}" y="${ty - 6}" style="font-size:9px">${t('plan.dock')}</text>`; dockLabel = true; }
    }
  });

  /* Branch: sorting de rutas y lugar de cada ruta hasta que pasa el cartero */
  const zb = Z('branch');
  if (zb) {
    const r = R(zb), nB = w.capacity.stations.branch, bh2 = Math.max(4, Math.min(26, (r.h - 80 - 4 * (nB - 1)) / nB)), R2 = w.routes.count;
    G.brC = [r.x + 28, r.y + 34];
    h += `<rect class="p-area" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="7"/><text class="p-az" x="${r.x + 8}" y="${r.y + 15}">${t('plan.branch')}</text><text class="p-sm" x="${r.x + 124}" y="${r.y + 15}">${t('plan.branchSub')}</text>`;
    h += `<text class="p-sm" x="${r.x + 6}" y="${r.y + 30}" style="font-size:8px">${t('plan.routeSort')}</text>`;
    for (let i = 0; i < nB; i++) h += `<rect class="p-st" x="${r.x + 6}" y="${r.y + 36 + i * (bh2 + 4)}" width="44" height="${bh2}" rx="3"/>`;
    const qy = r.y + 46 + nB * (bh2 + 4);
    h += `<text class="p-sm" id="brq" x="${r.x + 6}" y="${qy}"></text>` + dots('branch', r.x + 10, qy + 12, 4, 10);
    const x0 = r.x + 60, y0 = r.y + 24, aw = r.w - 66, ah = r.h - 30;
    const rRows = R2 <= 5 ? 1 : R2 <= 12 ? 2 : R2 <= 24 ? 3 : 4, rCols = Math.ceil(R2 / rRows);
    const rw = Math.max(8, Math.min(80, (aw - 6 * (rCols - 1)) / rCols)), rh = Math.max(8, Math.min(70, (ah - 6 * (rRows - 1)) / rRows));
    for (let i = 0; i < R2; i++) {
      const x = x0 + (i % rCols) * (rw + 6), y = y0 + Math.floor(i / rCols) * (rh + 6);
      G.route[i] = { x, y, w: rw, h: rh };
      const times = w.routes.windows.map(v => fmtHM((hm(v.first) ?? 0) + i * v.everyMin)), tm = times[0] ?? '';
      h += `<g id="rt${i}" class="rt"><title>R${i + 1} · ${times.join(' · ')}</title><rect class="b" x="${x}" y="${y}" width="${rw}" height="${rh}" rx="5"/><rect class="f" id="rtf${i}" x="${x + 1.5}" y="${y + rh - 1.5}" width="${rw - 3}" height="0" rx="3"/>`;
      h += `<text class="p-md" x="${x + 4}" y="${y + 11}" style="font-size:9px">R${i + 1}</text>${rw > 40 ? `<text class="p-sm" x="${x + rw - 3}" y="${y + 11}" text-anchor="end" style="font-size:7.5px">${tm}</text>` : ''}`;
      h += `<text class="p-bkc" id="rtc${i}" x="${x + rw / 2}" y="${y + rh / 2 + 5}"></text></g>`;
    }
  }
  const ze = Z('exit');
  if (ze) {
    const r = R(ze), sd = side(ze, L);
    h += `<rect class="p-dock" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1"/>`;
    h += sd === 'r' ? `<text class="p-az" x="${W + 8}" y="${r.y + r.h / 2 + 3}" style="font-size:9px">${t('plan.exit')}</text>` : `<text class="p-az" x="${r.x}" y="${sd === 't' ? r.y - 4 : r.y + r.h + 12}" style="font-size:9px">${t('plan.exit')}</text>`;
  }
  /* retornos: estantería de retiro (LM-4), RT-1 con sus cajas y la puerta del camión RT-2 */
  const zsh = Z('shelf');
  if (zsh) { const r = R(zsh); h += area(r, t('plan.shelf'), t('plan.shelfSub')) + `<text class="p-val" id="shf" x="${r.x + 7}" y="${r.y + 46}"></text>`; }
  const zrt = Z('returns');
  if (zrt) {
    const r = R(zrt);
    h += area(r, t('plan.returns'), t('plan.returnsSub')) + `<text class="p-md" id="rtq" x="${r.x + 7}" y="${r.y + 42}"></text><text class="p-md" id="rtb" x="${r.x + 7}" y="${r.y + 56}"></text>`;
    h += dots('returns', r.x + r.w - 46, r.y + 12, 4, 10);
  }
  const zr2 = Z('rt2Door');
  if (zr2) {
    const r = R(zr2), sd = side(zr2, L);
    h += `<rect class="p-dock" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1"/>`;
    h += sd === 'r' ? `<text class="p-az" x="${W + 8}" y="${r.y + r.h / 2 - 2}" style="font-size:9px">RT-2</text><text class="p-sm" id="rt2" x="${W + 8}" y="${r.y + r.h / 2 + 10}"></text>`
      : `<text class="p-az" x="${r.x}" y="${r.y - 4}" style="font-size:9px">RT-2</text><text class="p-sm" id="rt2" x="${r.x + 30}" y="${r.y - 4}"></text>`;
  }
  if (!so.length) h += `<text class="p-sm" x="${W / 2}" y="${K * 6}" text-anchor="middle">${t('plan.noStage')}</text>`;
  if (!br.length) h += `<text class="p-sm" x="${W / 2}" y="${H - K * 5}" text-anchor="middle">${t('plan.noBranch')}</text>`;
  h += `<g id="fx"></g>`;
  svg.innerHTML = h;
  return G;
}

/* ----------------------------- render ----------------------------- */
const setTxt = (id: string, v: string) => { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; };
const setCls = (id: string, c: string) => { const e = document.getElementById(id); if (e && e.getAttribute('class') !== c) e.setAttribute('class', c); };

function nextArrival(w: Warehouse, gi: number, tNow: number): number | null {
  let best: number | null = null;
  for (const o of w.groups[gi].outbound) for (let d = 0; d < 14; d++) {
    if (!o.days[d % 7]) continue;
    const x = d * DAY + (hm(o.arrival) ?? 0);
    if (x > tNow && (best == null || x < best)) best = x;
  }
  return best;
}
const dayTime = (x: number) => `${t('d' + (Math.floor(x / DAY) % 7))} ${fmtHM(x)}`;

export function renderPlan(G: Geo, S: PlayState, tNow: number, w: Warehouse, r: SimResult, smp: Sample | null): void {
  const queue = { sort: smp?.wip.sort ?? 0, reverify: smp?.wip.reverify ?? 0, branch: smp?.wip.branch ?? 0 };
  const cap = w.capacity.basketPkgs;
  setTxt('ind', S.inDoor ? t('plan.trucksAtDoor', { n: S.inDoor }) : '');
  const units = S.stU + S.stB;
  for (let i = 0; i < 24; i++) {
    const e = document.getElementById('ibx' + i);
    if (!e) continue;
    const v = i < units ? '' : 'none';
    if (e.style.display !== v) e.style.display = v;
    const c = i < S.stU ? 'p-box uld' : 'p-box';
    if (e.getAttribute('class') !== c) e.setAttribute('class', c);
  }
  setTxt('stB', `${nf(S.stB)} ${t('plan.boxes')}`);
  setTxt('stU', `${nf(S.stU)} ${t('plan.ulds')}`);
  setTxt('stL', `${nf(S.stL)} ${t('plan.loose')}`);
  setTxt('opn', t('plan.opening', { n: S.openB + S.openU }));
  setTxt('hos', t('plan.inHospital', { n: nf(S.hos) }));
  setTxt('hosd', t('plan.hosOut', { r: nf(S.hosR), d: nf(S.hosD) }));
  setTxt('shf', t('plan.shelfN', { n: nf(Math.max(0, S.shelf)) }));
  setTxt('rtq', t('plan.rtQueue', { n: nf(Math.max(0, S.rtq)) }));
  setTxt('rtb', t('plan.rtBoxes', { n: nf(Math.max(0, S.boxes)) }));
  setTxt('rt2', S.rt2 ? t('plan.rt2Here') : '');
  Object.keys(G.bk).forEach(k => {
    const b = G.bk[k], c = Math.max(0, S.bk[k] ?? 0);
    const nb = c ? Math.ceil(c / cap) : 0, cur = c ? (c % cap || cap) : 0, fh = (b.h - 3) * cur / cap;
    const f = document.getElementById('bkf' + k);
    if (f) { f.setAttribute('y', (b.y + b.h - 1.5 - fh).toFixed(1)); f.setAttribute('height', fh.toFixed(1)); }
    setTxt('bkc' + k, c ? (nb > 1 ? `${c}·${nb}` : String(c)) : '');
    setCls('bkr' + k, 'p-bk' + (S.closed[k] && c ? ' closed' : ''));
  });
  setTxt('sq', t('plan.queue', { n: nf(queue.sort) }));
  setTxt('rvq', t('plan.queue', { n: nf(queue.reverify) }));
  setTxt('brq', t('plan.queue', { n: nf(queue.branch) }));
  const K = w.capacity.stageOutSlots;
  G.so.forEach(gi => {
    for (let i = 0; i < K; i++) setCls(`sl${gi}_${i}`, 'p-slot' + (w.groups[gi].reverify ? '' : ' dir') + (i < S.lane[gi] ? ' on' : ''));
    setTxt('lno' + gi, S.lane[gi] > K ? `+${S.lane[gi] - K}` : '');
    setTxt('lnp' + gi, t('plan.pkg', { n: nf(S.lanePk[gi]) }));
    const here = S.tk[gi] === 1, left = S.tkLeft[gi];
    setCls('tk' + gi, 'tk' + (here ? ' here' : left != null && tNow - left < 120 ? ' gone' : ''));
    const nx = nextArrival(w, gi, tNow);
    setTxt('tks' + gi, here ? t('plan.truckHere', { n: nf(S.tkPk[gi]) }) : left != null && tNow - left < 120 ? t('plan.truckGone', { t: fmtHM(left) }) : nx != null ? t('plan.truckWait', { t: dayTime(nx) }) : '');
  });
  const maxR = Math.max(1, ...r.routeTotals.map(x => x / 6));
  G.route.forEach((R, i) => {
    const c = Math.max(0, S.route[i]);
    const fh = Math.min(1, c / maxR) * (R.h - 3);
    const f = document.getElementById('rtf' + i);
    if (f) { f.setAttribute('y', (R.y + R.h - 1.5 - fh).toFixed(1)); f.setAttribute('height', fh.toFixed(1)); }
    setTxt('rtc' + i, c ? nf(c) : '');
    setCls('rt' + i, 'rt' + (S.pm[i] ? ' wait' : c ? ' ready' : ''));
  });
  PROCESSES.forEach(p => {
    const nn = G.dots[p] || 0, b = smp?.busy[p] ?? 0, d = smp?.duty[p] ?? 0;
    for (let i = 0; i < nn; i++) setCls(`w${p}${i}`, 'w-dot' + (i < b ? ' busy' : i < d ? '' : ' off'));
  });
}

/* ------------------------- efectos visuales ------------------------- */
interface FxItem { el: SVGRectElement; pts: [number, number][]; cum: number[]; L: number; t0: number }
export class FxLayer {
  items: FxItem[] = [];
  constructor(private G: Geo) {}
  clear(): void { this.items.forEach(f => f.el.remove()); this.items = []; }
  spawn(pts: [number, number][], cls: string, w: number, h: number): void {
    if (this.items.length > 45) return;
    const layer = document.getElementById('fx');
    if (!layer) return;
    const el = document.createElementNS(NS, 'rect');
    el.setAttribute('class', 'fxd ' + cls); el.setAttribute('width', String(w)); el.setAttribute('height', String(h));
    el.setAttribute('x', String(-w / 2)); el.setAttribute('y', String(-h / 2)); el.setAttribute('rx', '1.5');
    layer.appendChild(el);
    const cum = [0];
    let L = 0;
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const f = { el, pts, cum, L: L || 1, t0: performance.now() };
    this.items.push(f);
    this.pos(f, 0);
  }
  private pos(f: FxItem, u: number): void {
    const d = u * f.L;
    let i = 1;
    while (i < f.cum.length - 1 && f.cum[i] < d) i++;
    const a = f.pts[i - 1], b = f.pts[i] ?? a, sl = (f.cum[i] - f.cum[i - 1]) || 1, v = Math.max(0, Math.min(1, (d - f.cum[i - 1]) / sl));
    f.el.setAttribute('transform', `translate(${(a[0] + (b[0] - a[0]) * v).toFixed(1)},${(a[1] + (b[1] - a[1]) * v).toFixed(1)})`);
  }
  step(now: number): void {
    this.items = this.items.filter(f => { const u = (now - f.t0) / 650; if (u >= 1) { f.el.remove(); return false; } this.pos(f, u); return true; });
  }
  handler: Fx = (kind, a, b) => {
    const G = this.G;
    const via = (p: [number, number], q: [number, number]): [number, number][] => [p, [q[0], p[1]], q]; // en ángulo recto
    if (kind === 'sort') { const k = G.bk[a as string]; if (k) this.spawn(via(G.sortC, [k.x + k.w / 2, k.y + k.h / 2]), 'pk', 7, 6); }
    else if (kind === 'stage') { const L = G.lane[a as number]; if (!L) return; const k = b ? G.bk[b] : null; this.spawn(via(k ? [k.x + k.w / 2, k.y + k.h / 2] : G.rvC, [L.cx, L.cy]), 'ct', 12, 9); }
    else if (kind === 'load') { const L = G.lane[a as number], D = G.door[a as number]; if (L && D) this.spawn(via([L.cx, L.cy], [D.cx, D.cy]), 'ct', 12, 9); }
    else if (kind === 'route') { const R = G.route[a as number]; if (R) this.spawn(via(G.brC, [R.x + R.w / 2, R.y + R.h / 2]), 'br', 7, 6); }
  };
}

/* --------------------------- reproductor --------------------------- */
export class Player {
  S: PlayState;
  i = 0;
  t = 0;
  private cps: { t: number; i: number; s: PlayState }[] = [];
  constructor(w: Warehouse, private r: SimResult) {
    this.S = freshState(w);
    // checkpoints cada 60 minutos simulados para poder saltar en el tiempo sin recalcular todo
    const S = freshState(w);
    let next = 0;
    const L = r.log;
    this.cps.push({ t: -1, i: 0, s: structuredClone(S) });
    for (let i = 0; i < L.length; i++) {
      while (L[i].t >= next) { this.cps.push({ t: next, i, s: structuredClone(S) }); next += 60; }
      apply(S, L[i]);
    }
  }
  seek(t: number): void {
    let c = this.cps[0];
    for (const x of this.cps) { if (x.t <= t) c = x; else break; }
    this.S = structuredClone(c.s);
    this.i = c.i;
    const L = this.r.log;
    while (this.i < L.length && L[this.i].t <= t) apply(this.S, L[this.i++]);
    this.t = t;
  }
  advance(t: number, fx?: Fx): void {
    const L = this.r.log;
    let spawned = 0;
    while (this.i < L.length && L[this.i].t <= t) {
      const e = L[this.i++];
      apply(this.S, e, spawned < 6 ? (k, a, b) => { spawned++; fx?.(k, a, b); } : undefined);
    }
    this.t = t;
  }
  get end(): number { return Math.max(this.r.endT, 7 * DAY); }
}
