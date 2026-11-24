/* Plano 2D animado: se dibuja en SVG a partir de la configuración y se
   anima reproduciendo el log de eventos de la simulación. */
import type { LogEv, Sample, SimResult } from '../engine/simulate';
import { PROCESSES, type ProcessKey, type Warehouse } from '../model/types';
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
}

export function freshState(w: Warehouse): PlayState {
  const n = w.groups.length, R = w.routes.count;
  return { inDoor: 0, stB: 0, stU: 0, stL: 0, openB: 0, openU: 0, unl: 0, trucks: 0, sorted: 0, rv: 0, br: 0, rc0: 0, picked: 0,
    bk: {}, closed: {}, lane: new Array(n).fill(0), lanePk: new Array(n).fill(0), tk: new Array(n).fill(0), tkPk: new Array(n).fill(0), tkLeft: new Array(n).fill(null),
    route: new Array(R).fill(0), pm: new Array(R).fill(false), hos: 0, hosR: 0, hosD: 0 };
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
  }
}

/* --------------------------- geometría --------------------------- */
export interface Geo {
  so: number[]; br: number[];
  bk: Record<string, { x: number; y: number; w: number; h: number }>;
  lane: Record<number, { cy: number }>;
  route: { x: number; y: number; w: number; h: number }[];
  dots: Record<ProcessKey, number>;
}

export function buildPlan(svg: SVGSVGElement, w: Warehouse): Geo {
  const gs = w.groups, so: number[] = [], br: number[] = [];
  gs.forEach((g, i) => (g.dest === 'branch' ? br : so).push(i));
  const G: Geo = { so, br, bk: {}, lane: {}, route: [], dots: {} as Record<ProcessKey, number> };
  const zones: { gi: number; zx: number; zw: number; y0: number; y1: number }[] = [];
  const zl = (list: number[], y0: number, y1: number, maxW: number) => {
    const x0 = 140, x1 = 640, n = list.length;
    if (!n) return;
    const zw = Math.min(maxW, (x1 - x0 - 8 * (n - 1)) / n);
    list.forEach((gi, k) => {
      const g = gs[gi], m = g.services.length, zx = x0 + k * (zw + 8);
      const cols = Math.max(1, Math.min(m, Math.floor((zw - 8) / 46)));
      const rows = Math.max(1, Math.ceil(m / cols));
      const bw = Math.min(74, (zw - 10 - 6 * (cols - 1)) / cols), bh = Math.min(58, (y1 - y0 - 32 - 6 * (rows - 1)) / rows);
      zones.push({ gi, zx, zw, y0, y1 });
      g.services.forEach((_, j) => { G.bk[gi + '-' + j] = { x: zx + 5 + (j % cols) * (bw + 6), y: y0 + 26 + Math.floor(j / cols) * (bh + 6), w: bw, h: bh }; });
    });
  };
  zl(so, 30, 238, 170);
  zl(br, 300, 500, 280);

  let h = `<defs><pattern id="pgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>`;
  h += `<rect class="p-floor" x="10" y="10" width="1000" height="500"/><rect class="p-wall" x="10" y="10" width="1000" height="500" rx="4"/>`;
  /* inbound */
  h += `<rect class="p-door" x="6" y="150" width="9" height="100"/>`;
  h += `<rect class="p-area" x="20" y="130" width="106" height="122" rx="6"/><text class="p-az" x="27" y="144">${t('plan.inbound')}</text><text class="p-sm" x="27" y="155">${t('plan.unloading')}</text>`;
  h += `<text class="p-sm" id="ind" x="27" y="167"></text>`;
  for (let i = 0; i < 24; i++) h += `<rect id="ibx${i}" class="p-box" x="${27 + (i % 8) * 11.5}" y="${173 + Math.floor(i / 8) * 11}" width="9" height="9" rx="1.2" style="display:none"/>`;
  h += `<text class="p-md" id="stB" x="27" y="220"></text><text class="p-md" id="stU" x="27" y="232"></text><text class="p-md" id="stL" x="27" y="244"></text>`;
  /* desconsolidación */
  h += `<rect class="p-area" x="20" y="260" width="106" height="92" rx="6"/><text class="p-az" x="26" y="274" style="font-size:7.6px;letter-spacing:0">${t('plan.decon')}</text>`;
  h += `<text class="p-val" id="opn" x="27" y="296"></text>`;
  /* hospital */
  h += `<rect class="p-area" x="20" y="360" width="106" height="92" rx="6"/><text class="p-az" x="27" y="374">${t('plan.hospital')}</text>`;
  h += `<text class="p-val" id="hos" x="27" y="396"></text><text class="p-sm" id="hosd" x="27" y="410"></text>`;
  /* cinta + scan 1 */
  const ST = w.sorting.type, nS1 = ST === 'sorter' ? w.sorting.sorter.inductionPoints : w.capacity.stations.sort, sGap = Math.min(22, 470 / Math.max(1, nS1));
  let rolls = '';
  for (let x = 134; x < 640; x += 12) rolls += `<line class="p-roll" x1="${x}" y1="263" x2="${x}" y2="275"/>`;
  h += `<rect class="p-belt" x="126" y="262" width="514" height="14" rx="3"/>${rolls}<text class="p-sm" x="540" y="258">${t('plan.sortLine')}</text>`;
  for (let i = 0; i < nS1; i++) h += `<rect class="p-st" x="${140 + i * sGap}" y="244" width="${Math.min(16, sGap - 3)}" height="15" rx="2"/>`;
  const s1x = Math.min(470, 144 + nS1 * sGap);
  const s1label = ST === 'sorter' ? t('plan.sorter', { b: w.sorting.sorter.chutes }) : ST === 'ptl' ? t('plan.ptl') : t('plan.scan1');
  h += `<text class="p-az" x="${s1x}" y="255">${s1label}</text><text class="p-sm" id="sq" x="${s1x + s1label.length * 6.4 + 8}" y="255"></text>`;
  /* zonas de grupos */
  zones.forEach(z => {
    const g = gs[z.gi];
    h += `<g><rect class="p-zone ${g.reverify ? 'rc' : ''}" x="${z.zx}" y="${z.y0}" width="${z.zw}" height="${z.y1 - z.y0}" rx="7"/><title>${esc(g.name)}</title>`;
    h += `<text class="p-zt" x="${z.zx + 7}" y="${z.y0 + 15}">${esc(trunc(g.name, Math.floor((z.zw - 12) / 6.1)))}</text>`;
    g.services.forEach((s, j) => {
      const b = G.bk[z.gi + '-' + j], id = z.gi + '-' + j;
      h += `<g><title>${esc(s.name)}</title><rect id="bkr${id}" class="p-bk" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4"/>`;
      h += `<rect id="bkf${id}" class="p-bkf ${g.reverify ? 'rc' : ''}" x="${b.x + 1.5}" y="${b.y + b.h - 1.5}" width="${b.w - 3}" height="0" rx="2.5"/>`;
      h += `<text class="p-bkn" x="${b.x + b.w / 2}" y="${b.y + 12}">${esc(trunc(s.name, Math.max(3, Math.floor(b.w / 5.2))))}</text><text class="p-bkc" id="bkc${id}" x="${b.x + b.w / 2}" y="${b.y + b.h - 6}"></text></g>`;
    });
    h += `</g>`;
  });
  if (!so.length) h += `<text class="p-sm" x="390" y="130" text-anchor="middle">${t('plan.noStage')}</text>`;
  if (!br.length) h += `<text class="p-sm" x="390" y="400" text-anchor="middle">${t('plan.noBranch')}</text>`;
  /* scan 2 */
  const nS2 = w.capacity.stations.reverify, s2h = Math.min(26, (150 - 4 * (nS2 - 1)) / nS2);
  h += `<text class="p-az" x="648" y="42" style="font-size:9px">${t('plan.scan2')}</text><text class="p-sm" x="648" y="52" style="font-size:8px">${t('plan.reverif')}</text>`;
  for (let i = 0; i < nS2; i++) h += `<rect class="p-st2" x="652" y="${58 + i * (s2h + 4)}" width="44" height="${s2h}" rx="3"/>`;
  h += `<text class="p-sm" id="rvq" x="648" y="${68 + nS2 * (s2h + 4)}"></text>`;
  /* stage out + camiones */
  h += `<rect class="p-area" x="712" y="22" width="292" height="216" rx="7"/><text class="p-az" x="720" y="37">${t('plan.stageout')}</text><text class="p-sm" x="800" y="37">${t('plan.stageoutSub')}</text>`;
  const n = Math.max(1, so.length), laneTop = 46, laneH = (232 - laneTop - 4 * (n - 1)) / n, K = w.capacity.stageOutSlots;
  const sw = Math.min(22, (196 - 3 * (K - 1)) / K), shh = Math.min(laneH - 14, 22);
  so.forEach((gi, k) => {
    const ly = laneTop + k * (laneH + 4), g = gs[gi];
    G.lane[gi] = { cy: ly + laneH / 2 };
    h += `<rect x="716" y="${ly}" width="284" height="${laneH}" rx="4" fill="var(--surface-2)" stroke="var(--line-2)"/>`;
    h += `<text class="p-md" x="722" y="${ly + laneH / 2 - 1}">${esc(trunc(g.name.replace(/ Branch$/, ''), 12))}</text><text class="p-sm" id="lnp${gi}" x="722" y="${ly + laneH / 2 + 10}"></text>`;
    for (let i = 0; i < K; i++) h += `<rect id="sl${gi}_${i}" class="p-slot${g.reverify ? '' : ' dir'}" x="${800 + i * (sw + 3)}" y="${ly + (laneH - shh) / 2}" width="${sw}" height="${shh}" rx="3"/>`;
    h += `<text class="p-ovf" id="lno${gi}" x="${800 + K * (sw + 3) + 2}" y="${ly + laneH / 2 + 3}"></text>`;
    h += `<rect class="p-door" x="1006" y="${ly + 3}" width="9" height="${laneH - 6}"/>`;
    const th = Math.min(laneH - 4, 40), ty = ly + (laneH - th) / 2;
    h += `<g id="tk${gi}" class="tk"><rect class="b" x="1022" y="${ty}" width="118" height="${th}" rx="4"/><rect x="1142" y="${ty + th * 0.15}" width="24" height="${th * 0.7}" rx="4" fill="var(--text-2)" opacity=".7"/>`;
    h += `<text class="p-md" x="1030" y="${ty + th / 2 - (th > 28 ? 2 : -3)}">${esc(trunc(g.name.replace(/ Branch$/, ''), 14))}</text>`;
    h += (th > 28 ? `<text class="p-sm" id="tks${gi}" x="1030" y="${ty + th / 2 + 10}"></text>` : '') + `</g>`;
  });
  h += `<text class="p-az" x="1022" y="18" style="font-size:9px">${t('plan.dock')}</text><text class="p-az" x="716" y="254" style="font-size:9px">${t('plan.load')}</text>`;
  /* branch */
  const nB = w.capacity.stations.branch, bh2 = Math.min(26, (150 - 4 * (nB - 1)) / nB);
  h += `<text class="p-az" x="648" y="312" style="font-size:9px">${t('plan.routeSort')}</text><text class="p-sm" x="648" y="322" style="font-size:8px">${t('plan.routeSortSub')}</text>`;
  for (let i = 0; i < nB; i++) h += `<rect class="p-st" x="652" y="${328 + i * (bh2 + 4)}" width="44" height="${bh2}" rx="3"/>`;
  h += `<text class="p-sm" id="brq" x="648" y="${338 + nB * (bh2 + 4)}"></text>`;
  const R = w.routes.count;
  h += `<rect class="p-area" x="712" y="290" width="292" height="214" rx="7"/><text class="p-az" x="720" y="305">${t('plan.branch')}</text><text class="p-sm" x="836" y="305">${t('plan.branchSub')}</text>`;
  const rRows = R <= 5 ? 1 : R <= 12 ? 2 : R <= 24 ? 3 : 4, rCols = Math.ceil(R / rRows);
  const rw = Math.min(80, (276 - 6 * (rCols - 1)) / rCols), rh = Math.min(70, (190 - 6 * (rRows - 1)) / rRows);
  for (let r = 0; r < R; r++) {
    const x = 720 + (r % rCols) * (rw + 6), y = 312 + Math.floor(r / rCols) * (rh + 6);
    G.route[r] = { x, y, w: rw, h: rh };
    const times = w.routes.windows.map(v => fmtHM((hm(v.first) ?? 0) + r * v.everyMin)), tm = times[0] ?? '';
    h += `<g id="rt${r}" class="rt"><title>R${r + 1} · ${times.join(' · ')}</title><rect class="b" x="${x}" y="${y}" width="${rw}" height="${rh}" rx="5"/><rect class="f" id="rtf${r}" x="${x + 1.5}" y="${y + rh - 1.5}" width="${rw - 3}" height="0" rx="3"/>`;
    h += `<text class="p-md" x="${x + 4}" y="${y + 11}" style="font-size:9px">R${r + 1}</text>${rw > 40 ? `<text class="p-sm" x="${x + rw - 3}" y="${y + 11}" text-anchor="end" style="font-size:7.5px">${tm}</text>` : ''}`;
    h += `<text class="p-bkc" id="rtc${r}" x="${x + rw / 2}" y="${y + rh / 2 + 5}"></text></g>`;
  }
  h += `<rect class="p-door" x="1006" y="380" width="9" height="60"/><text class="p-az" x="1022" y="404" style="font-size:9px">${t('plan.exit')}</text>`;
  /* operarios: con multiskill cualquiera puede estar en cualquier proceso */
  // shortcut: se dibujan como mucho `max` puntos por zona; alcanza para bodegas de hasta ~40 personas por turno
  const people = Math.max(0, ...w.shifts.map(s => PROCESSES.reduce((a, p) => a + (s.staff[p] || 0), 0)));
  const dots = (k: ProcessKey, x: number, y: number, per: number, gap: number, max = per * 2) => {
    const n2 = Math.min(people, max);
    G.dots[k] = n2;
    let s = '';
    for (let i = 0; i < n2; i++) s += `<circle id="w${k}${i}" class="w-dot" cx="${x + (i % per) * gap}" cy="${y + Math.floor(i / per) * gap}" r="4"><title>${t('p.' + k)}</title></circle>`;
    return s;
  };
  h += dots('unload', 96, 148, 3, 10) + dots('decon', 96, 330, 3, 10) + dots('sort', 146, 288, 42, 11, 42) + dots('reverify', 656, 58 + nS2 * (s2h + 4) + 20, 4, 10)
    + dots('branch', 656, 338 + nB * (bh2 + 4) + 10, 4, 10) + dots('load', 760, 250, 8, 10, 8) + dots('hospital', 96, 372, 3, 10);
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
    if (kind === 'sort') { const k = G.bk[a as string]; if (k) { const x = k.x + k.w / 2; this.spawn([[126, 269], [x, 269], [x, k.y + k.h / 2]], 'pk', 7, 6); } }
    else if (kind === 'stage') { const L = G.lane[a as number]; if (!L) return; const k = b ? G.bk[b] : null; const from: [number, number] = k ? [k.x + k.w / 2, k.y + k.h / 2] : [674, 150]; this.spawn([from, [704, from[1]], [704, L.cy], [790, L.cy]], 'ct', 12, 9); }
    else if (kind === 'load') { const L = G.lane[a as number]; if (L) this.spawn([[960, L.cy], [1060, L.cy]], 'ct', 12, 9); }
    else if (kind === 'route') { const R = G.route[a as number]; if (R) this.spawn([[700, 380], [R.x + R.w / 2, 380], [R.x + R.w / 2, R.y + R.h / 2]], 'br', 7, 6); }
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
