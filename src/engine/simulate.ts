/* =====================================================================
   Motor de simulación de eventos discretos — horizonte semanal.
   Reloj: minutos desde el lunes 00:00. La semana simulada es la 1; los
   turnos, salidas y retiros se generan también para la semana 2 para que
   el trabajo pendiente del sábado/domingo pueda terminarse.
   ===================================================================== */
import { PROCESSES, type ProcessKey, type TimeKey, type Warehouse, type Warning } from '../model/types';
import { DAY, WEEK, hm } from '../model/time';
import { Deque, EventHeap, mulberry32, percentile, triangular } from './core';

export const SECOND_KEYS: ReadonlySet<TimeKey> = new Set<TimeKey>(['unloadLoose', 'sort', 'reverify', 'branchSort']);
const HORIZON = 2 * WEEK;
const ORDER: Record<ProcessKey, number> = { unload: 0, decon: 1, sort: 2, reverify: 3, branch: 4, load: 5 };

export interface SimOptions { seed?: number; log?: boolean; volume?: number }
export type LogEv = { t: number; e: string; [k: string]: number | string | Record<string, number> | null };

export interface Wip { unload: number; decon: number; sort: number; baskets: number; reverify: number; branch: number; stage: number; routes: number }
export interface Sample { t: number; busy: Record<ProcessKey, number>; duty: Record<ProcessKey, number>; wip: Wip }
export interface ProcessStat { key: ProcessKey; jobs: number; busyMin: number; paidMin: number; otMin: number; util: number; waitAvg: number; maxQueuePkgs: number; first: number | null; lastEnd: number | null }
export interface ShiftStat { shiftId: string; name: string; night: boolean; process: ProcessKey; workers: number; paidMin: number; busyMin: number; otMin: number; util: number }
export interface DayStat { day: number; arrived: number; rc0: number; finished: number; paidMin: number; busyMin: number; otMin: number; lastActivity: number | null }
export interface OutboundStat { gi: number; group: string; day: number; arrival: number; scheduled: number; departure: number; units: number; pkgs: number; m3: number; kg: number; late: number; leftUnits: number; leftPkgs: number }
export interface PickupStat { route: number; day: number; time: number; pkgs: number }
export interface BacklogStat { shift: string; day: number; time: number; wip: Wip; total: number }
export interface TimeStats { n: number; mean: number; p90: number; p95: number; p98: number }
export interface GroupStat { name: string; dest: string; reverify: boolean; pkgs: number; baskets: number; containers: number; scans: number; spp: number; stageMax: number; time: TimeStats }
export interface InboundStat { name: string; day: number; arrival: number; pkgs: number; boxes: number; ulds: number; loose: number; unloadEnd: number | null; sortEnd: number | null }

export interface SimResult {
  seed: number;
  totals: { pkgs: number; boxes: number; ulds: number; loose: number; finished: number; unfinished: number; carried: number; kg: number; m3: number };
  endT: number;
  processes: ProcessStat[];
  shifts: ShiftStat[];
  days: DayStat[];
  outbound: OutboundStat[];
  pickups: PickupStat[];
  backlog: BacklogStat[];
  inbound: InboundStat[];
  groups: GroupStat[];
  time: TimeStats;
  events: Record<string, number>;
  hourly: { sorted: number[]; rc0: number[] };
  samples: Sample[];
  warnings: Warning[];
  log: LogEv[];
  /** Totales por grupo y por ruta para la animación. */
  groupTotals: number[];
  routeTotals: number[];
  swaps: number;
}

/* ------------------------------------------------------------------ */
interface Pkg { ti: number; g: number; s: number; r: number; vol: number; kg: number; wi2: number; rc0: number; bi: number }
interface Unit { pk: Pkg[]; sk: string | null; m3: number; kg: number }
interface Job { pk: number; base: () => number; start?: () => void; done: () => void; cancelled?: boolean; started?: boolean; eq?: number }
interface Worker { shift: number; proc: ProcessKey; state: 0 | 1 | 2 | 3; inWin: boolean; brk: boolean; ot: boolean; otStart: number; otEnd: number; prod: number; otMin: number }
interface Pool { key: ProcessKey; q: Deque<Job>; qPk: number; idle: Worker[]; stations: number; busy: number; duty: number; busyMin: number; busyW1: number; jobs: number; waitSum: number; maxQPk: number; first: number | null; lastEnd: number | null }
interface OutTruck { gi: number; day: number; arr: number; sched: number; dep: number; state: 'here' | 'closing' | 'gone'; m3: number; kg: number; units: number; pkgs: number; inflight: number; jobs: Job[] }

export function simulate(W: Warehouse, opt: SimOptions = {}): SimResult {
  const seed = opt.seed ?? W.seed;
  const LOG = opt.log !== false;
  const VOL = (opt.volume ?? 1) * ((W.volumePct ?? 100) / 100);
  const rnd = mulberry32(seed);
  const T = (k: TimeKey): number => { const t = W.times[k]; const v = triangular(rnd(), t.min, t.mode, t.max); return SECOND_KEYS.has(k) ? v / 60 : v; };
  const Tn = (k: TimeKey, n: number): number => { let s = 0; for (let i = 0; i < n; i++) s += T(k); return s; };
  const cap = W.capacity;
  const G = W.groups;
  const R = W.routes.count;
  const warnings: Warning[] = [];
  const log: LogEv[] = [];
  let now = 0;
  const L = (e: string, o: Record<string, number | string | Record<string, number> | null> = {}): void => { if (LOG) log.push({ t: now, e, ...o }); };

  const heap = new EventHeap();
  const at = (t: number, fn: () => void, sample = false): void => heap.push(Math.max(t, now), fn, sample);

  /* ------------------------- recursos ------------------------- */
  const pools = {} as Record<ProcessKey, Pool>;
  PROCESSES.forEach(p => {
    const st = p === 'sort' ? cap.stations.sort : p === 'reverify' ? cap.stations.reverify : p === 'branch' ? cap.stations.branch : Infinity;
    pools[p] = { key: p, q: new Deque<Job>(), qPk: 0, idle: [], stations: st, busy: 0, duty: 0, busyMin: 0, busyW1: 0, jobs: 0, waitSum: 0, maxQPk: 0, first: null, lastEnd: null };
  });
  const logPC = (p: ProcessKey): void => L('pc', { p, b: pools[p].busy, d: pools[p].duty });
  const workers: Worker[] = [];
  const shiftWorkers: Worker[][] = W.shifts.map((s, si) => {
    const arr: Worker[] = [];
    PROCESSES.forEach(p => { for (let i = 0; i < s.staff[p]; i++) arr.push({ shift: si, proc: p, state: 0, inWin: false, brk: false, ot: false, otStart: 0, otEnd: 0, prod: s.productivityPct / 100, otMin: 0 }); });
    workers.push(...arr);
    return arr;
  });
  const setState = (w: Worker, s: 0 | 1 | 2 | 3): void => {
    const old = w.state;
    if (old === s) return;
    const P = pools[w.proc];
    if (old === 1) { const i = P.idle.indexOf(w); if (i >= 0) P.idle.splice(i, 1); }
    if (old === 1 || old === 2) P.duty--;
    if (old === 2) P.busy--;
    w.state = s;
    if (s === 1) P.idle.push(w);
    if (s === 1 || s === 2) P.duty++;
    if (s === 2) P.busy++;
    logPC(w.proc);
  };
  const pending = (p: ProcessKey): number => pools[p].q.length + pools[p].busy;
  const hasWorkAhead = (p: ProcessKey): boolean => {
    if (p === 'load') return pending('load') > 0;
    for (const k of PROCESSES) if (ORDER[k] <= ORDER[p] && k !== 'load' && pending(k) > 0) return true;
    return basketsWaiting > 0 && ORDER[p] >= ORDER.reverify;
  };
  const otDay = new Array(14).fill(0);
  const endOT = (w: Worker): void => {
    const m = now - w.otStart;
    if (w.otStart < WEEK) { w.otMin += m; otDay[Math.floor(w.otStart / DAY)] += m; }
    w.ot = false;
  };
  const leaveOT = (w: Worker): void => { endOT(w); setState(w, 0); };
  const checkIdleOT = (): void => {
    for (const w of otWorkers) if (w.ot && w.state === 1 && (!hasWorkAhead(w.proc) || now >= w.otEnd)) leaveOT(w);
  };
  const otWorkers = new Set<Worker>();

  const dayBusy = new Array(14).fill(0), dayLast: (number | null)[] = new Array(14).fill(null);
  const busyShift: Record<string, number> = {};
  const submit = (p: ProcessKey, j: Job): void => {
    const P = pools[p];
    j.eq = now;
    P.q.push(j);
    P.qPk += j.pk;
    if (P.qPk > P.maxQPk) P.maxQPk = P.qPk;
    dispatch(p);
  };
  function dispatch(p: ProcessKey): void {
    const P = pools[p];
    while (P.q.length && P.idle.length && P.busy < P.stations) {
      const j = P.q.shift()!;
      P.qPk -= j.pk;
      if (j.cancelled) continue;
      const w = P.idle.pop()!;
      setState(w, 2);
      j.started = true;
      P.jobs++;
      P.waitSum += now - (j.eq ?? now);
      if (P.first == null) P.first = now;
      const d = j.base() / w.prod;
      const startDay = Math.min(13, Math.floor(now / DAY));
      j.start?.();
      at(now + d, () => {
        P.busyMin += d;
        if (startDay < 7) { P.busyW1 += d; busyShift[w.shift + '|' + p] = (busyShift[w.shift + '|' + p] ?? 0) + d; }
        P.lastEnd = now;
        dayBusy[startDay] += d;
        dayLast[startDay] = Math.max(dayLast[startDay] ?? 0, now);
        j.done();
        freeWorker(w);
        checkIdleOT();
        dispatch(p);
      });
    }
  }
  function freeWorker(w: Worker): void {
    if (w.ot) {
      if (now >= w.otEnd || !hasWorkAhead(w.proc)) { leaveOT(w); return; }
      setState(w, 1);
      return;
    }
    if (!w.inWin) { setState(w, 0); return; }
    if (w.brk) { setState(w, 3); return; }
    setState(w, 1);
  }

  /* --------------------- instancias de turno --------------------- */
  const paid = { proc: {} as Record<string, number>, shiftProc: {} as Record<string, number>, day: new Array(14).fill(0) };
  const backlog: BacklogStat[] = [];
  W.shifts.forEach((s, si) => {
    const st = hm(s.start)!, en0 = hm(s.end)!;
    const len = en0 > st ? en0 - st : en0 + DAY - st;
    for (let d = 0; d < 14; d++) {
      if (!s.days[d % 7]) continue;
      const ws = d * DAY + st, we = ws + len;
      let brkMin = 0;
      s.breaks.forEach(b => {
        const bm = hm(b.start)!;
        const cand = [d * DAY + bm, d * DAY + bm + DAY].find(x => x >= ws && x < we);
        if (cand == null || b.minutes <= 0) return;
        const be = Math.min(we, cand + b.minutes);
        brkMin += be - cand;
        at(cand, () => shiftWorkers[si].forEach(w => { if (!w.inWin) return; w.brk = true; if (w.state === 1) setState(w, 3); }));
        at(be, () => {
          shiftWorkers[si].forEach(w => { w.brk = false; if (w.inWin && w.state === 3) setState(w, 1); });
          PROCESSES.forEach(dispatch);
        });
      });
      const effective = len - brkMin;
      if (d < 7) PROCESSES.forEach(p => {
        const m = effective * s.staff[p];
        paid.proc[p] = (paid.proc[p] ?? 0) + m;
        paid.shiftProc[si + '|' + p] = (paid.shiftProc[si + '|' + p] ?? 0) + m;
        paid.day[d] += m;
      });
      at(ws, () => {
        shiftWorkers[si].forEach(w => {
          w.inWin = true; w.brk = false;
          if (w.ot) endOT(w); // si está en una tarea, la termina antes de quedar libre
          if (w.state === 0 || w.state === 3) setState(w, 1);
        });
        PROCESSES.forEach(dispatch);
      });
      at(we, () => {
        const wip = snapshot();
        backlog.push({ shift: s.name, day: d, time: now, wip, total: wip.unload + wip.decon + wip.sort + wip.baskets + wip.reverify + wip.branch + wip.stage });
        const otH = s.night ? s.overtimeHours : 0;
        shiftWorkers[si].forEach(w => {
          w.inWin = false; w.brk = false;
          if (otH > 0) {
            w.ot = true; w.otStart = now; w.otEnd = now + otH * 60; otWorkers.add(w);
            if (w.state === 3) setState(w, 1);
            if (w.state === 1 && !hasWorkAhead(w.proc)) leaveOT(w);
          } else if (w.state === 1 || w.state === 3) setState(w, 0);
        });
        if (otH > 0) at(now + otH * 60, () => shiftWorkers[si].forEach(w => { if (w.ot && w.state === 1) leaveOT(w); }));
      });
    }
  });

  /* ------------------------ paquetes ------------------------ */
  const shareTot = G.reduce((a, g) => a + g.sharePct, 0) || 1;
  const cumG: number[] = []; { let c = 0; G.forEach(g => { c += g.sharePct / shareTot; cumG.push(c); }); }
  const cumS = G.map(g => {
    const tw = g.services.reduce((a, s) => a + (s.weight > 0 ? s.weight : 0), 0);
    let c = 0;
    return g.services.map(s => (c += tw > 0 ? (s.weight > 0 ? s.weight : 0) / tw : 1 / g.services.length));
  });
  const pick = (cum: number[]): number => { const u = rnd(); for (let i = 0; i < cum.length; i++) if (u < cum[i]) return i; return cum.length - 1; };
  const profOf = G.map(g => g.profile ?? W.packageProfile);
  const makePkg = (ti: number): Pkg => {
    const g = pick(cumG), s = pick(cumS[g]), pr = profOf[g], v = pr.variationPct / 100;
    const f = 1 + (rnd() * 2 - 1) * v, fk = 1 + (rnd() * 2 - 1) * v;
    const vol = (pr.lengthCm * pr.widthCm * pr.heightCm / 1000) * f * f * f;
    return { ti, g, s, r: G[g].dest === 'branch' ? Math.floor(rnd() * R) : -1, vol, kg: pr.weightKg * fk, wi2: -1, rc0: -1, bi: -1 };
  };

  interface InTruck { ti: number; name: string; day: number; arr: number; ulds: Pkg[][]; boxes: Pkg[][]; loose: Pkg[]; total: number; sorted: number; looseDone: number; unloadLeft: number; unloadEnd: number | null; sortEnd: number | null }
  const trucks: InTruck[] = [];
  const groupTot = G.map(() => 0), routeTot = new Array(R).fill(0);
  let totPk = 0, totBoxes = 0, totUld = 0, totLoose = 0, totKg = 0, totL = 0;
  W.inbound.forEach(def => {
    for (let d = 0; d < 7; d++) {
      if (!def.days[d]) continue;
      const vf = 1 + (rnd() * 2 - 1) * def.volumeVarPct / 100;
      const n = Math.max(0, Math.round(def.packages * vf * VOL));
      const arr = Math.max(0, d * DAY + hm(def.arrival)! + (rnd() * 2 - 1) * def.timeVarMin);
      const mt = def.mix.boxes + def.mix.uld + def.mix.loose || 1;
      const nU = Math.round(n * def.mix.uld / mt), nL = Math.round(n * def.mix.loose / mt), nB = Math.max(0, n - nU - nL);
      const ti = trucks.length;
      const mk = (k: number): Pkg[] => { const a: Pkg[] = []; for (let i = 0; i < k; i++) { const p = makePkg(ti); a.push(p); groupTot[p.g]++; if (p.r >= 0) routeTot[p.r]++; totKg += p.kg; totL += p.vol; } return a; };
      const chunk = (arr2: Pkg[], size: number): Pkg[][] => { const out: Pkg[][] = []; for (let i = 0; i < arr2.length; i += size) out.push(arr2.slice(i, i + size)); return out; };
      const ulds = chunk(mk(nU), def.pkgsPerUld), boxes = chunk(mk(nB), def.pkgsPerBox), loose = mk(nL);
      trucks.push({ ti, name: def.name, day: d, arr, ulds, boxes, loose, total: n, sorted: 0, looseDone: 0, unloadLeft: ulds.length + boxes.length + loose.length, unloadEnd: null, sortEnd: null });
      totPk += n; totBoxes += boxes.length; totUld += ulds.length; totLoose += nL;
    }
  });
  let unfinished = totPk, inboundLeft = trucks.length, endT = 0;
  const EV: Record<string, number> = { 'WI-2': 0, 'WI-3 + WI-4': 0, 'AV-1': 0, 'RC-0': 0, 'LM-1': 0, 'LM-12': 0 };
  const scans = G.map(() => 0), basketsUsed = G.map(() => 0), containers = G.map(() => 0);
  const hourly = { sorted: [] as number[], rc0: [] as number[] };
  const hadd = (k: 'sorted' | 'rc0', n: number): void => { const h = Math.floor(now / 60); const a = hourly[k]; while (a.length <= h) a.push(0); a[h] += n; };
  const dayRc0 = new Array(14).fill(0), dayFin = new Array(14).fill(0);
  const times: number[] = [], timesG: number[][] = G.map(() => []);
  const setRc0 = (pk: Pkg): void => {
    pk.rc0 = now; EV['RC-0']++; hadd('rc0', 1); dayRc0[Math.min(13, Math.floor(now / DAY))]++;
    if (pk.wi2 >= 0) { const d = now - pk.wi2; times.push(d); timesG[pk.g].push(d); }
  };
  const finish = (): void => { unfinished--; dayFin[Math.min(13, Math.floor(now / DAY))]++; endT = Math.max(endT, now); };
  let swaps = 0, basketsWaiting = 0;
  const inBaskets = { n: 0 };

  /* paso 1-2: llegada → descarga → desconsolidación */
  trucks.forEach(tr => at(tr.arr, () => {
    inboundLeft--;
    L('inA', { ti: tr.ti, n: tr.total });
    if (!tr.total) { tr.unloadEnd = now; tr.sortEnd = now; L('inD', { ti: tr.ti }); return; }
    const unloadDone = (): void => { if (--tr.unloadLeft === 0) { tr.unloadEnd = now; L('inD', { ti: tr.ti }); } };
    const toSort = (pk: Pkg[]): void => pk.forEach(submitSort);
    tr.ulds.forEach(u => submit('unload', { pk: u.length, base: () => T('unloadUld'), done: () => {
      u.forEach(p => (p.wi2 = now)); EV['WI-2'] += u.length; L('unl', { k: 'u' }); unloadDone();
      submit('decon', { pk: u.length, base: () => T('emptyUld'), start: () => L('decS', { k: 'u' }), done: () => { L('decE', { k: 'u', n: u.length }); toSort(u); } });
    } }));
    tr.boxes.forEach(b => submit('unload', { pk: b.length, base: () => T('unloadBox'), done: () => {
      b.forEach(p => (p.wi2 = now)); EV['WI-2'] += b.length; L('unl', { k: 'b' }); unloadDone();
      submit('decon', { pk: b.length, base: () => T('openBox'), start: () => L('decS', { k: 'b' }), done: () => { L('decE', { k: 'b', n: b.length }); toSort(b); } });
    } }));
    tr.loose.forEach(() => submit('unload', { pk: 1, base: () => T('unloadLoose'), done: () => {
      L('unl', { k: 'l' }); unloadDone();
      if (++tr.looseDone === tr.loose.length) {
        // Los sueltos reciben WI-2 al terminar la descarga del camión
        tr.loose.forEach(q => (q.wi2 = now)); EV['WI-2'] += tr.loose.length;
        L('lrel', { n: tr.loose.length }); toSort(tr.loose);
      }
    } }));
  }));

  /* paso 3: sorting a canastos (cierre al terminar de procesar el camión) */
  const fill = new Map<string, { n: number; l: number; idx: number }>();
  const baskets = new Map<string, Pkg[][]>();
  function submitSort(pk: Pkg): void {
    const key = pk.ti + '|' + pk.g + '-' + pk.s;
    submit('sort', { pk: 1,
      base: () => {
        let f = fill.get(key);
        let swap = false;
        if (!f) { f = { n: 0, l: 0, idx: 0 }; fill.set(key, f); basketsUsed[pk.g]++; }
        else if (f.n + 1 > cap.basketPkgs || f.l + pk.vol > cap.basketLiters) { f.idx++; f.n = 0; f.l = 0; swap = true; basketsUsed[pk.g]++; swaps++; }
        f.n++; f.l += pk.vol; pk.bi = f.idx;
        return T('sort') + (swap ? T('swap') : 0);
      },
      done: () => {
        let b = baskets.get(key);
        if (!b) { b = []; baskets.set(key, b); }
        (b[pk.bi] ||= []).push(pk);
        EV['WI-3 + WI-4']++; scans[pk.g]++; hadd('sorted', 1); inBaskets.n++; basketsWaiting++;
        L('sortE', { sk: pk.g + '-' + pk.s });
        const tr = trucks[pk.ti];
        if (++tr.sorted === tr.total) { tr.sortEnd = now; closeTruck(tr); }
      } });
  }

  /* paso 4-5: cierre → reverificación/contenedores o directo */
  function closeTruck(tr: InTruck): void {
    L('close', { ti: tr.ti });
    G.forEach((g, gi) => {
      const chunks: { sk: string; pk: Pkg[] }[] = [];
      g.services.forEach((_, si) => {
        const key = tr.ti + '|' + gi + '-' + si;
        (baskets.get(key) ?? []).forEach(b => { if (b && b.length) chunks.push({ sk: gi + '-' + si, pk: b }); });
        baskets.delete(key); fill.delete(key);
      });
      if (!chunks.length) return;
      if (g.reverify) {
        let pend = chunks.length;
        const all: Pkg[] = [];
        chunks.forEach(c => submit('reverify', { pk: c.pk.length, base: () => Tn('reverify', c.pk.length),
          start: () => { L('rvS', { sk: c.sk, n: c.pk.length }); inBaskets.n -= c.pk.length; basketsWaiting -= c.pk.length; },
          done: () => {
            EV['AV-1'] += c.pk.length; scans[gi] += c.pk.length; all.push(...c.pk); L('rvE', { n: c.pk.length });
            if (--pend === 0) {
              const conts: Pkg[][] = [];
              let cur: Pkg[] = [], l = 0;
              all.forEach(p => { if (cur.length && (cur.length + 1 > cap.containerPkgs || l + p.vol > cap.containerLiters)) { conts.push(cur); cur = []; l = 0; } cur.push(p); l += p.vol; });
              if (cur.length) conts.push(cur);
              containers[gi] += conts.length;
              conts.forEach(part => submit('reverify', { pk: 0, base: () => T('container'), done: () => { L('cont', { g: gi, n: part.length }); toDest(gi, mkUnit(part, null)); } }));
            }
          } }));
      } else chunks.forEach(c => { inBaskets.n -= c.pk.length; basketsWaiting -= c.pk.length; toDest(gi, mkUnit(c.pk, c.sk)); });
    });
  }
  const mkUnit = (pk: Pkg[], sk: string | null): Unit => ({ pk, sk, m3: pk.reduce((a, p) => a + p.vol, 0) / 1000, kg: pk.reduce((a, p) => a + p.kg, 0) });

  /* paso 6: destino */
  const stage: Unit[][] = G.map(() => []), stageUnits = G.map(() => 0), stageMax = G.map(() => 0), stagePk = G.map(() => 0);
  const routeBuf: Pkg[][] = Array.from({ length: R }, () => []);
  function toDest(gi: number, u: Unit): void {
    if (G[gi].dest === 'branch') {
      u.pk.forEach(setRc0);
      L('brT', { sk: u.sk, n: u.pk.length });
      submit('branch', { pk: u.pk.length, base: () => Tn('branchSort', u.pk.length), done: () => {
        const rc: Record<string, number> = {};
        u.pk.forEach(p => { routeBuf[p.r].push(p); rc[p.r] = (rc[p.r] ?? 0) + 1; });
        EV['LM-1'] += u.pk.length; scans[gi] += u.pk.length;
        L('brE', { rc });
      } });
    } else {
      stage[gi].push(u); stageUnits[gi]++; stagePk[gi] += u.pk.length;
      if (stageUnits[gi] > stageMax[gi]) stageMax[gi] = stageUnits[gi];
      L('stage', { g: gi, n: u.pk.length, sk: u.sk });
      tryLoad(gi);
    }
  }

  /* paso 7a: camiones de salida por grupo (semanas 1 y 2) */
  const present: OutTruck[][] = G.map(() => []);
  const outStats: OutboundStat[] = [];
  G.forEach((g, gi) => {
    if (g.dest === 'branch') return;
    g.outbound.forEach(o => {
      for (let d = 0; d < 14; d++) {
        if (!o.days[d % 7]) continue;
        const arr = d * DAY + hm(o.arrival)!;
        const tk: OutTruck = { gi, day: d, arr, sched: arr + W.outboundLoadWindowMin, dep: -1, state: 'here', m3: 0, kg: 0, units: 0, pkgs: 0, inflight: 0, jobs: [] };
        at(arr, () => { present[gi].push(tk); L('otA', { g: gi }); tryLoad(gi); });
        at(tk.sched, () => {
          tk.state = 'closing';
          // lo que no empezó a cargarse vuelve a Stage out para el próximo camión
          for (let i = tk.jobs.length - 1; i >= 0; i--) {
            const j = tk.jobs[i] as Job & { unit: Unit };
            if (!j.started && !j.cancelled) { j.cancelled = true; stage[gi].unshift(j.unit); tk.m3 -= j.unit.m3; tk.kg -= j.unit.kg; tk.units--; }
          }
          if (tk.inflight === 0) depart(tk);
        });
      }
    });
  });
  function tryLoad(gi: number): void {
    const tk = present[gi].find(t => t.state === 'here');
    if (!tk) return;
    while (stage[gi].length) {
      const u = stage[gi][0];
      if (tk.units > 0 && (tk.m3 + u.m3 > cap.truckM3 || tk.kg + u.kg > cap.truckKg)) break;
      stage[gi].shift();
      tk.m3 += u.m3; tk.kg += u.kg; tk.units++;
      const job: Job & { unit: Unit } = { unit: u, pk: 0, base: () => T('load'),
        start: () => { tk.inflight++; },
        done: () => {
          tk.inflight--; tk.pkgs += u.pk.length;
          stageUnits[gi]--; stagePk[gi] -= u.pk.length;
          u.pk.forEach(p => { setRc0(p); finish(); });
          L('ld', { g: gi, n: u.pk.length });
          if (tk.state === 'closing' && tk.inflight === 0) depart(tk);
        } };
      tk.jobs.push(job);
      submit('load', job);
    }
  }
  function depart(tk: OutTruck): void {
    tk.state = 'gone'; tk.dep = now;
    present[tk.gi] = present[tk.gi].filter(t => t !== tk);
    L('otD', { g: tk.gi });
    if (tk.day < 7 || tk.pkgs > 0) outStats.push({ gi: tk.gi, group: G[tk.gi].name, day: tk.day, arrival: tk.arr, scheduled: tk.sched, departure: now, units: tk.units, pkgs: tk.pkgs, m3: tk.m3, kg: tk.kg, late: Math.max(0, now - tk.sched), leftUnits: stage[tk.gi].length, leftPkgs: stage[tk.gi].reduce((a, u) => a + u.pk.length, 0) });
  }

  /* paso 7b: carteros retiran cada ruta */
  const pickups: PickupStat[] = [];
  if (G.some(g => g.dest === 'branch')) {
    for (let d = 0; d < 14; d++) {
      if (!W.routes.days[d % 7]) continue;
      for (let r = 0; r < R; r++) {
        const t0 = d * DAY + hm(W.routes.first)! + r * W.routes.everyMin;
        at(t0, () => {
          const pk = routeBuf[r];
          if (!pk.length) { if (d < 7) pickups.push({ route: r, day: d, time: now, pkgs: 0 }); return; }
          routeBuf[r] = [];
          L('pmA', { r });
          at(now + T('handover'), () => {
            EV['LM-12'] += pk.length; pk.forEach(() => finish());
            pickups.push({ route: r, day: d, time: now, pkgs: pk.length });
            L('pick', { r, n: pk.length });
          });
        });
      }
    }
  }

  /* ------------------------ muestreo ------------------------ */
  const snapshot = (): Wip => ({
    unload: pools.unload.qPk + 0, decon: pools.decon.qPk, sort: pools.sort.qPk, baskets: inBaskets.n,
    reverify: pools.reverify.qPk, branch: pools.branch.qPk,
    stage: stagePk.reduce((a, b, i) => a + (G[i].dest === 'branch' ? 0 : b), 0),
    routes: routeBuf.reduce((a, b) => a + b.length, 0),
  });
  const samples: Sample[] = [];
  const sample = (): void => {
    const busy = {} as Record<ProcessKey, number>, duty = {} as Record<ProcessKey, number>;
    PROCESSES.forEach(p => { busy[p] = pools[p].busy; duty[p] = pools[p].duty; });
    samples.push({ t: now, busy, duty, wip: snapshot() });
    if (now + 15 <= HORIZON) at(now + 15, sample, true);
  };
  at(0, sample, true);

  /* --------------------- bucle principal --------------------- */
  while (heap.size) {
    const e = heap.pop()!;
    if (e.t > HORIZON) break;
    now = e.t;
    e.fn();
    // todo lo que llegó en la semana ya salió: no hace falta seguir simulando
    if (inboundLeft === 0 && unfinished === 0 && !e.sample) break;
  }
  const samplesOut = samples.filter(s => s.t <= Math.max(WEEK, endT) + 60);

  if (unfinished > 0) warnings.push({ key: 'w.unfinished', params: { n: unfinished } });
  const carried = dayFin.slice(7).reduce((a, b) => a + b, 0);

  /* ------------------------ resultados ------------------------ */
  const stats = (arr: number[]): TimeStats => {
    if (!arr.length) return { n: 0, mean: NaN, p90: NaN, p95: NaN, p98: NaN };
    const s = Float64Array.from(arr).sort();
    let sum = 0; for (let i = 0; i < s.length; i++) sum += s[i];
    return { n: s.length, mean: sum / s.length, p90: percentile(s, 90), p95: percentile(s, 95), p98: percentile(s, 98) };
  };
  const otByProc: Record<string, number> = {}, otByShiftProc: Record<string, number> = {};
  workers.forEach(w => { otByProc[w.proc] = (otByProc[w.proc] ?? 0) + w.otMin; otByShiftProc[w.shift + '|' + w.proc] = (otByShiftProc[w.shift + '|' + w.proc] ?? 0) + w.otMin; });
  const processes: ProcessStat[] = PROCESSES.map(p => {
    const P = pools[p], pm = (paid.proc[p] ?? 0) + (otByProc[p] ?? 0);
    return { key: p, jobs: P.jobs, busyMin: P.busyW1, paidMin: pm, otMin: otByProc[p] ?? 0, util: pm > 0 ? P.busyW1 / pm : 0,
      waitAvg: P.jobs ? P.waitSum / P.jobs : 0, maxQueuePkgs: P.maxQPk, first: P.first, lastEnd: P.lastEnd };
  });
  const shifts: ShiftStat[] = [];
  W.shifts.forEach((s, si) => PROCESSES.forEach(p => {
    const k = si + '|' + p, pm = (paid.shiftProc[k] ?? 0) + (otByShiftProc[k] ?? 0);
    if (!s.staff[p]) return;
    shifts.push({ shiftId: s.id, name: s.name, night: s.night, process: p, workers: s.staff[p], paidMin: pm, busyMin: busyShift[k] ?? 0, otMin: otByShiftProc[k] ?? 0, util: pm > 0 ? (busyShift[k] ?? 0) / pm : 0 });
  }));
  const arrivedDay = new Array(7).fill(0);
  trucks.forEach(t => (arrivedDay[t.day] += t.total));
  const days: DayStat[] = [];
  for (let d = 0; d < 7; d++) days.push({ day: d, arrived: arrivedDay[d], rc0: dayRc0[d], finished: dayFin[d], paidMin: paid.day[d], busyMin: dayBusy[d], otMin: otDay[d], lastActivity: dayLast[d] });
  const groups: GroupStat[] = G.map((g, gi) => ({ name: g.name, dest: g.dest, reverify: g.reverify, pkgs: groupTot[gi], baskets: basketsUsed[gi], containers: containers[gi],
    scans: scans[gi], spp: groupTot[gi] ? scans[gi] / groupTot[gi] : 0, stageMax: stageMax[gi], time: stats(timesG[gi]) }));

  return {
    seed,
    totals: { pkgs: totPk, boxes: totBoxes, ulds: totUld, loose: totLoose, finished: totPk - unfinished, unfinished, carried, kg: totKg, m3: totL / 1000 },
    endT: Math.max(endT, now),
    processes, shifts, days,
    outbound: outStats.sort((a, b) => a.arrival - b.arrival || a.gi - b.gi),
    pickups, backlog, groups,
    inbound: trucks.map(t => ({ name: t.name, day: t.day, arrival: t.arr, pkgs: t.total, boxes: t.boxes.length, ulds: t.ulds.length, loose: t.loose.length, unloadEnd: t.unloadEnd, sortEnd: t.sortEnd })),
    time: stats(times), events: EV, hourly, samples: samplesOut, warnings, log,
    groupTotals: groupTot, routeTotals: routeTot, swaps,
  };
}
