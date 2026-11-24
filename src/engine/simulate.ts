/* =====================================================================
   Motor de simulación de eventos discretos — horizonte semanal.
   Reloj: minutos desde el lunes 00:00. La semana simulada es la 1; los
   turnos, salidas y retiros se generan también para la semana 2 para que
   el trabajo pendiente del sábado/domingo pueda terminarse.
   ===================================================================== */
import { PROCESSES, type ProcessKey, type TimeKey, type Warehouse, type Warning } from '../model/types';
import { DAY, WEEK, hm } from '../model/time';
import { Deque, EventHeap, mulberry32, percentile, triangular } from './core';

export const SECOND_KEYS: ReadonlySet<TimeKey> = new Set<TimeKey>(['unloadLoose', 'sort', 'sortPtl', 'induct', 'reverify', 'branchSort']);
const HORIZON = 2 * WEEK;

export interface SimOptions { seed?: number; log?: boolean; volume?: number }
export type LogEv = { t: number; e: string; [k: string]: number | string | Record<string, number> | null };

export interface Wip { unload: number; decon: number; sort: number; hospital: number; baskets: number; reverify: number; branch: number; stage: number; routes: number }
export interface Sample { t: number; busy: Record<ProcessKey, number>; duty: Record<ProcessKey, number>; wip: Wip }
export interface ProcessStat { key: ProcessKey; jobs: number; busyMin: number; waitAvg: number; maxQueuePkgs: number }
export interface ShiftStat { shiftId: string; name: string; night: boolean; workers: number; paidMin: number; busyMin: number; otMin: number; util: number; changes: number; changeMin: number }
export interface DayStat { day: number; arrived: number; rc0: number; finished: number; paidMin: number; busyMin: number; otMin: number; lastActivity: number | null }
export interface OutboundStat { gi: number; group: string; day: number; arrival: number; scheduled: number; departure: number; units: number; pkgs: number; m3: number; kg: number; late: number; leftPkgs: number }
export interface PickupStat { route: number; day: number; time: number; pkgs: number }
export interface BacklogStat { shift: string; day: number; time: number; wip: Wip; total: number }
export interface TimeStats { n: number; mean: number; p90: number; p95: number; p98: number }
export interface CptStat { n: number; onTime: number; late: number; noCpt: number; pct: number; delayMean: number; delayP90: number }
export interface GroupStat { name: string; dest: string; reverify: boolean; pkgs: number; baskets: number; containers: number; scans: number; spp: number; stageMax: number; time: TimeStats; cpt: CptStat }
export interface InboundStat { name: string; day: number; arrival: number; pkgs: number; boxes: number; ulds: number; loose: number; unloadEnd: number | null; sortEnd: number | null }

export interface SimResult {
  seed: number;
  totals: { pkgs: number; inbound: number; boxes: number; ulds: number; loose: number; finished: number; unfinished: number; carried: number; kg: number; m3: number };
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
  cpt: CptStat;
  hospital: { in: number; relabeled: number; destroyed: number };
  /** customs: faltantes de aduana; missortFixed/missortUndetected: errores de sorting; postman*: faltantes en LM-1 (encontrados o siniestros). */
  discrepancies: { customs: number; missortFixed: number; missortUndetected: number; postman: number; postmanFound: number; losses: number };
  sorter: { inducted: number; nonConveyable: number; sharedChute: number; noRead: number; peakPerHour: number } | null;
  events: Record<string, number>;
  hourly: { sorted: number[]; rc0: number[] };
  samples: Sample[];
  warnings: Warning[];
  log: LogEv[];
  /** Paquetes por ruta, para escalar la animación. */
  routeTotals: number[];
}

/* ------------------------------------------------------------------ */
interface Pkg { ti: number; g: number; s: number; r: number; vol: number; kg: number; wi2: number; bi: number; nc: boolean; relabeled: boolean; bad: boolean }
interface Unit { pk: Pkg[]; sk: string | null; m3: number; kg: number }
interface Job { pk: number; base: () => number; machine?: () => number; start?: () => void; done: () => void; cancelled?: boolean; started?: boolean; eq?: number; free?: boolean }
/** state: 0 fuera de turno, 1 libre, 2 trabajando, 3 en pausa, 4 cambiando de puesto */
interface Worker { shift: number; home: ProcessKey; proc: ProcessKey; state: 0 | 1 | 2 | 3 | 4; inWin: boolean; brk: boolean; ot: boolean; otStart: number; otEnd: number; prod: number; otMin: number; busyW1: number; changes: number; changeMin: number; idleSince: number }
/** q: tareas que necesitan estación; free: tareas sin estación (p. ej. sorting manual al lado del sorter). */
interface Pool { key: ProcessKey; q: Deque<Job>; free: Deque<Job>; qPk: number; idle: Worker[]; stations: number; stBusy: number; busy: number; duty: number; incoming: number; busyW1: number; jobs: number; waitSum: number; maxQPk: number }
interface OutTruck { gi: number; day: number; arr: number; sched: number; state: 'here' | 'closing' | 'gone'; m3: number; kg: number; units: number; pkgs: number; inflight: number; jobs: Job[] }

/** Multiskill: a qué proceso va una persona que quedó libre. */
export function nextProcess(home: ProcessKey, current: ProcessKey, needsHelp: (p: ProcessKey) => boolean, hasWork: (p: ProcessKey) => boolean, priority: readonly ProcessKey[]): ProcessKey {
  if (current !== home && needsHelp(home)) return home;   // vuelve a su puesto si tiene trabajo
  if (hasWork(current)) return current;
  if (needsHelp('load')) return 'load';                    // la carga va primero si hay camión esperando
  for (const p of priority) if (needsHelp(p)) return p;
  return current;
}

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
  const ST = W.sorting.type, SR = W.sorting.sorter, HOS = W.hospital, DIS = W.discrepancies, CHANGE = W.multiskill.changeMin, BUFFER = W.multiskill.bufferMin;
  const warnings: Warning[] = [];
  const log: LogEv[] = [];
  let now = 0;
  const L = (e: string, o: Record<string, number | string | Record<string, number> | null> = {}): void => { if (LOG) log.push({ t: now, e, ...o }); };

  const heap = new EventHeap();
  const at = (t: number, fn: () => void, sample = false): void => heap.push(Math.max(t, now), fn, sample);

  /* ------------------------- recursos ------------------------- */
  const pools = {} as Record<ProcessKey, Pool>;
  PROCESSES.forEach(p => {
    const st = p === 'sort' ? (ST === 'sorter' ? SR.inductionPoints : cap.stations.sort) : p === 'reverify' ? cap.stations.reverify : p === 'branch' ? cap.stations.branch : Infinity;
    pools[p] = { key: p, q: new Deque<Job>(), free: new Deque<Job>(), qPk: 0, idle: [], stations: st, stBusy: 0, busy: 0, duty: 0, incoming: 0, busyW1: 0, jobs: 0, waitSum: 0, maxQPk: 0 };
  });
  const workers: Worker[] = [];
  const shiftWorkers: Worker[][] = W.shifts.map((s, si) => {
    const arr: Worker[] = [];
    PROCESSES.forEach(p => { for (let i = 0; i < s.staff[p]; i++) arr.push({ shift: si, home: p, proc: p, state: 0, inWin: false, brk: false, ot: false, otStart: 0, otEnd: 0, prod: s.productivityPct / 100, otMin: 0, busyW1: 0, changes: 0, changeMin: 0, idleSince: 0 }); });
    workers.push(...arr);
    return arr;
  });
  const setState = (w: Worker, s: Worker['state']): void => {
    const old = w.state;
    if (old === s) return;
    const P = pools[w.proc];
    if (old === 1) { const i = P.idle.indexOf(w); if (i >= 0) P.idle.splice(i, 1); }
    if (old === 1 || old === 2) P.duty--;
    if (old === 2) P.busy--;
    w.state = s;
    if (s === 1) { P.idle.push(w); w.idleSince = now; }
    if (s === 1 || s === 2) P.duty++;
    if (s === 2) P.busy++;
  };
  /** ¿Hay trabajo que esta persona podría empezar ya en este proceso? */
  const hasWork = (P: Pool): boolean => P.free.length > 0 || (P.q.length > 0 && P.stBusy < P.stations);
  /** ¿Faltan manos? (tareas que podrían empezar ya, menos quienes están libres o en camino) */
  const needsHelp = (P: Pool): boolean => P.idle.length + P.incoming < Math.min(P.q.length, Math.max(0, P.stations - P.stBusy)) + P.free.length;
  const anyWork = (): boolean => basketsWaiting > 0 || PROCESSES.some(p => pools[p].q.length || pools[p].free.length || pools[p].busy);
  const otDay = new Array(14).fill(0);
  const endOT = (w: Worker): void => {
    const m = now - w.otStart;
    if (w.otStart < WEEK) { w.otMin += m; otDay[Math.floor(w.otStart / DAY)] += m; }
    w.ot = false;
  };
  const leaveOT = (w: Worker): void => { endOT(w); setState(w, 0); };
  const otWorkers = new Set<Worker>();
  const checkIdleOT = (): void => {
    for (const w of otWorkers) if (w.ot && w.state === 1 && (!anyWork() || now >= w.otEnd)) leaveOT(w);
  };

  /* multiskill: a dónde va una persona que quedó libre */
  const pickTarget = (w: Worker): ProcessKey => nextProcess(w.home, w.proc, p => needsHelp(pools[p]), p => hasWork(pools[p]), W.multiskill.priority);
  const move = (w: Worker, target: ProcessKey): void => {
    setState(w, 4);
    pools[target].incoming++;
    if (now < WEEK) { w.changes++; w.changeMin += CHANGE; }
    at(now + CHANGE, () => {
      pools[target].incoming--;
      w.proc = target;
      if (!w.inWin && !w.ot) setState(w, 0);
      else if (w.brk) setState(w, 3);
      else { setState(w, 1); armBuffer(w); dispatch(target); }
    });
  };
  /** Sin trabajo, espera BUFFER minutos en su puesto; si sigue libre, se fija si hace falta en otro proceso. */
  const armBuffer = (w: Worker): void => {
    if (BUFFER <= 0) return;
    const since = w.idleSince;
    at(now + BUFFER, () => { if (w.state === 1 && w.idleSince === since) { const t2 = pickTarget(w); if (t2 !== w.proc) move(w, t2); } });
  };
  function release(w: Worker): void {
    if (w.ot) { if (now >= w.otEnd || !anyWork()) { leaveOT(w); return; } }
    else if (!w.inWin) { setState(w, 0); return; }
    else if (w.brk) { setState(w, 3); return; }
    const target = pickTarget(w);
    if (target !== w.proc && (target === w.home || BUFFER <= 0)) { move(w, target); return; }   // volver a su puesto no espera
    setState(w, 1);
    armBuffer(w);
  }
  /** Trae gente libre de procesos sin trabajo; primero a quienes tienen este proceso como puesto. */
  const recruit = (p: ProcessKey): void => {
    const P = pools[p];
    while (needsHelp(P)) {
      let best: Worker | undefined;
      for (const q of PROCESSES) {
        if (q === p || hasWork(pools[q])) continue;
        for (const w of pools[q].idle) { if (w.home === p) { best = w; break; } if (now - w.idleSince >= BUFFER) best ??= w; }
        if (best?.home === p) break;
      }
      if (!best) return;
      move(best, p);
    }
  };

  const dayBusy = new Array(14).fill(0), dayLast: (number | null)[] = new Array(14).fill(null);
  const submit = (p: ProcessKey, j: Job): void => {
    const P = pools[p];
    j.eq = now;
    (j.free ? P.free : P.q).push(j);
    P.qPk += j.pk;
    if (P.qPk > P.maxQPk) P.maxQPk = P.qPk;
    dispatch(p);
    recruit(p);
  };
  function dispatch(p: ProcessKey): void {
    const P = pools[p];
    while (P.idle.length) {
      let j: Job;
      if (P.free.length) j = P.free.shift()!;
      else if (P.q.length && P.stBusy < P.stations) j = P.q.shift()!;
      else break;
      P.qPk -= j.pk;
      if (j.cancelled) continue;
      const w = P.idle.pop()!;
      setState(w, 2);
      if (!j.free) P.stBusy++;
      j.started = true;
      P.jobs++;
      P.waitSum += now - (j.eq ?? now);
      const d = Math.max(j.base() / w.prod, j.machine?.() ?? 0); // la productividad acelera a la persona, no a la máquina
      const startDay = Math.min(13, Math.floor(now / DAY));
      j.start?.();
      at(now + d, () => {
        if (!j.free) P.stBusy--;
        if (startDay < 7) { P.busyW1 += d; w.busyW1 += d; }
        dayBusy[startDay] += d;
        dayLast[startDay] = Math.max(dayLast[startDay] ?? 0, now);
        j.done();
        release(w);
        checkIdleOT();
        dispatch(p);
      });
    }
  }

  /* --------------------- instancias de turno --------------------- */
  const paid = { shift: W.shifts.map(() => 0), day: new Array(14).fill(0) };
  const backlog: BacklogStat[] = [];
  W.shifts.forEach((s, si) => {
    const st = hm(s.start)!, en0 = hm(s.end)!;
    const len = en0 > st ? en0 - st : en0 + DAY - st;
    const people = PROCESSES.reduce((a, p) => a + s.staff[p], 0);
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
          shiftWorkers[si].forEach(w => { w.brk = false; if (w.inWin && w.state === 3) release(w); });
          PROCESSES.forEach(dispatch);
        });
      });
      if (d < 7) { paid.shift[si] += (len - brkMin) * people; paid.day[d] += (len - brkMin) * people; }
      at(ws, () => {
        shiftWorkers[si].forEach(w => {
          w.inWin = true; w.brk = false;
          if (w.ot) endOT(w); // si está en una tarea, la termina antes de quedar libre
          if (w.state === 0 || w.state === 3) { if (w.state === 0) w.proc = w.home; release(w); }
        });
        PROCESSES.forEach(dispatch);
      });
      at(we, () => {
        const wip = snapshot();
        backlog.push({ shift: s.name, day: d, time: now, wip, total: wip.unload + wip.decon + wip.sort + wip.hospital + wip.baskets + wip.reverify + wip.branch + wip.stage });
        const otH = s.night ? s.overtimeHours : 0;
        shiftWorkers[si].forEach(w => {
          w.inWin = false; w.brk = false;
          if (otH > 0) {
            w.ot = true; w.otStart = now; w.otEnd = now + otH * 60; otWorkers.add(w);
            if (w.state === 3) setState(w, 1);
            if (w.state === 1 && !anyWork()) leaveOT(w);
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
    const kg = pr.weightKg * fk;
    // shortcut: se comparan las medidas sin rotar el paquete; alcanza mientras no se modelen paquetes alargados
    const nc = ST === 'sorter' && (kg > SR.maxKg || pr.lengthCm * f > SR.maxLengthCm || pr.widthCm * f > SR.maxWidthCm || pr.heightCm * f > SR.maxHeightCm);
    return { ti, g, s, r: G[g].dest === 'branch' ? Math.floor(rnd() * R) : -1, vol: (pr.lengthCm * pr.widthCm * pr.heightCm / 1000) * f * f * f, kg, wi2: -1, bi: -1, nc, relabeled: false, bad: false };
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
  const hourly = { sorted: [] as number[], rc0: [] as number[], inducted: [] as number[] };
  const hadd = (k: 'sorted' | 'rc0' | 'inducted', n: number): void => { const h = Math.floor(now / 60); const a = hourly[k]; while (a.length <= h) a.push(0); a[h] += n; };
  const dayRc0 = new Array(14).fill(0), dayFin = new Array(14).fill(0);
  const finish = (): void => { unfinished--; dayFin[Math.min(13, Math.floor(now / DAY))]++; endT = Math.max(endT, now); };
  let basketsWaiting = 0;
  const inBaskets = { n: 0 };
  const hosp = { in: 0, relabeled: 0, destroyed: 0 };
  const disc = { customs: 0, missortFixed: 0, missortUndetected: 0, postman: 0, postmanFound: 0, losses: 0 };
  const sorterSt = { inducted: 0, nonConveyable: 0, sharedChute: 0, noRead: 0 };

  /* CPT: salidas de camión (Stage out) o retiros de carteros (Branch), ordenados */
  const cptStage: number[][] = G.map(g => g.dest === 'branch' ? [] : g.outbound.flatMap(o => [...Array(14).keys()].filter(d => o.days[d % 7]).map(d => d * DAY + hm(o.arrival)! + W.outboundLoadWindowMin)).sort((a, b) => a - b));
  const pickupTimes = (r: number): number[] => W.routes.windows.flatMap(v => [...Array(14).keys()].filter(d => v.days[d % 7]).map(d => d * DAY + hm(v.first)! + r * v.everyMin));
  const cptRoute: number[][] = [...Array(R).keys()].map(r => pickupTimes(r).sort((a, b) => a - b));
  const times: number[] = [], timesG: number[][] = G.map(() => []);
  const cptRec = G.map(() => ({ n: 0, onTime: 0, noCpt: 0, delays: [] as number[] }));
  /** `left`: salida programada del camión en que se fue (Stage out); si salió en su camión del CPT, cumple aunque la carga termine justo después. */
  const setRc0 = (pk: Pkg, left?: number): void => {
    EV['RC-0']++; hadd('rc0', 1); dayRc0[Math.min(13, Math.floor(now / DAY))]++;
    const d = now - pk.wi2; times.push(d); timesG[pk.g].push(d);
    const list = G[pk.g].dest === 'branch' ? cptRoute[pk.r] : cptStage[pk.g];
    const cpt = list.find(x => x >= pk.wi2 + W.cptLeadMin);
    const c = cptRec[pk.g];
    c.n++;
    if (cpt == null) c.noCpt++;
    else if ((left ?? now) <= cpt + 1e-9) c.onTime++;
    else c.delays.push(now - cpt);
  };

  /* paso 1-2: llegada → descarga → desconsolidación */
  trucks.forEach(tr => at(tr.arr, () => {
    inboundLeft--;
    L('inA', { ti: tr.ti, n: tr.total });
    if (!tr.total) { tr.unloadEnd = now; tr.sortEnd = now; L('inD', { ti: tr.ti }); return; }
    const unloadDone = (): void => { if (--tr.unloadLeft === 0) { tr.unloadEnd = now; L('inD', { ti: tr.ti }); } };
    const toSort = (pk: Pkg[]): void => pk.forEach(p => { if (rnd() * 100 < DIS.customsPct) { disc.customs++; finish(); resolve(p); } else submitSort(p); });
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

  /* paso 3: sorting (manual con PDA, Pick to Light o sorter) → hospital o canasto */
  // sorter con más servicios que bocas: los servicios se reparten en ronda y las bocas compartidas se reclasifican a mano
  const svcKeys = G.flatMap((g, gi) => g.services.map((_, si) => gi + '-' + si));
  const shared = new Set(ST === 'sorter' && svcKeys.length > SR.chutes ? svcKeys.filter((_, i) => i % SR.chutes < svcKeys.length - SR.chutes) : []);
  const fill = new Map<string, { n: number; l: number; idx: number; assigned: number[] }>();
  const baskets = new Map<string, Pkg[][]>();
  const sendsOnFull = (gi: number): boolean => G[gi].dest === 'branch' && !G[gi].reverify;
  /** Reserva lugar en el canasto al empezar la tarea; devuelve los minutos extra si hubo que cambiar un canasto lleno. */
  const reserve = (pk: Pkg): number => {
    const key = pk.ti + '|' + pk.g + '-' + pk.s;
    let f = fill.get(key), extra = 0;
    if (!f) { f = { n: 0, l: 0, idx: 0, assigned: [0] }; fill.set(key, f); basketsUsed[pk.g]++; }
    else if (f.n + 1 > cap.basketPkgs || f.l + pk.vol > cap.basketLiters) {
      f.idx++; f.n = 0; f.l = 0; f.assigned.push(0); basketsUsed[pk.g]++; extra = T('swap');
      const full = f.idx - 1;
      if (sendsOnFull(pk.g)) at(now, () => sendIfComplete(key, full));
    }
    f.n++; f.l += pk.vol; f.assigned[f.idx]++; pk.bi = f.idx;
    return extra;
  };
  /* Branch sin reverificación: el RC-0 ocurre al llenarse el canasto, después del primer escaneo */
  const sendIfComplete = (key: string, bi: number): void => {
    const b = baskets.get(key)?.[bi], f = fill.get(key);
    if (!b || !f || bi >= f.idx || b.length !== f.assigned[bi]) return;
    baskets.get(key)![bi] = [];
    const [, sk] = key.split('|');
    inBaskets.n -= b.length; basketsWaiting -= b.length;
    toDest(+sk.split('-')[0], mkUnit(b, sk));
  };
  const resolve = (pk: Pkg): void => { const tr = trucks[pk.ti]; if (++tr.sorted === tr.total) { tr.sortEnd = now; closeTruck(tr); } };
  const place = (pk: Pkg): void => {
    const key = pk.ti + '|' + pk.g + '-' + pk.s;
    let b = baskets.get(key);
    if (!b) { b = []; baskets.set(key, b); }
    (b[pk.bi] ||= []).push(pk);
    pk.bad = rnd() * 100 < DIS.missortPct[ST];
    EV['WI-3 + WI-4']++; scans[pk.g]++; hadd('sorted', 1); inBaskets.n++; basketsWaiting++;
    L('sortE', { sk: pk.g + '-' + pk.s });
    if (sendsOnFull(pk.g)) sendIfComplete(key, pk.bi);
    resolve(pk);
  };
  const toHospital = (pk: Pkg): void => {
    hosp.in++;
    L('hosIn');
    submit('hospital', { pk: 1, base: () => T('relabel'), done: () => {
      if (rnd() < HOS.relabelPct / 100) { hosp.relabeled++; pk.relabeled = true; L('hosOut', { k: 'r' }); submitSort(pk); }
      else { hosp.destroyed++; L('hosOut', { k: 'd' }); finish(); resolve(pk); }
    } });
  };
  const exception = (pk: Pkg, extraPct = 0): 'noRead' | 'exc' | null => {
    if (pk.relabeled) return null; // un paquete reetiquetado no vuelve al hospital
    const u = rnd() * 100;
    return u < extraPct ? 'noRead' : u < extraPct + HOS.exceptionPct ? 'exc' : null;
  };
  /** Sorting manual con PDA (también el de los no mecanizables y las bocas compartidas del sorter). La excepción se detecta al escanear. */
  const manualSort = (pk: Pkg, key: TimeKey, free: boolean): void => {
    let ex: string | null = null;
    submit('sort', { pk: 1, free,
      base: () => { ex = exception(pk); return T(key) + (ex ? 0 : reserve(pk)); },
      done: () => { if (ex) toHospital(pk); else place(pk); } });
  };
  function submitSort(pk: Pkg): void {
    if (ST !== 'sorter') return manualSort(pk, ST === 'ptl' ? 'sortPtl' : 'sort', false);
    if (pk.nc) { sorterSt.nonConveyable++; return manualSort(pk, 'sort', true); }
    const sk = pk.g + '-' + pk.s;
    let ex: string | null = null;
    submit('sort', { pk: 1,
      // la máquina limita el ritmo: con k inductores trabajando, cada uno no puede inducir más rápido que k / capacidad
      base: () => { ex = exception(pk, SR.noReadPct); return T('induct') + (ex || shared.has(sk) ? 0 : reserve(pk)); },
      machine: () => pools.sort.stBusy / (SR.machinePerHour / 60),
      done: () => {
        sorterSt.inducted++; hadd('inducted', 1);
        if (ex) { if (ex === 'noRead') sorterSt.noRead++; toHospital(pk); }
        else if (shared.has(sk)) { sorterSt.sharedChute++; submit('sort', { pk: 1, free: true, base: () => T('sort') + reserve(pk), done: () => place(pk) }); }
        else place(pk);
      } });
  }

  /* paso 4-5: cierre del camión → reverificación/contenedores o directo */
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
        chunks.forEach(c => submit('reverify', { pk: c.pk.length, base: () => Tn('reverify', c.pk.length) + fixMissorts(c.pk),
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
  /** Corrige en el momento los paquetes mal clasificados y devuelve el tiempo que lleva. */
  // shortcut: el paquete sigue en el flujo de su grupo correcto (no se modela el canasto equivocado); alcanza para medir tiempo y cantidad
  const fixMissorts = (pk: Pkg[]): number => { let m = 0; for (const p of pk) if (p.bad) { p.bad = false; disc.missortFixed++; m += T('missortFix'); } return m; };
  const mkUnit = (pk: Pkg[], sk: string | null): Unit => ({ pk, sk, m3: pk.reduce((a, p) => a + p.vol, 0) / 1000, kg: pk.reduce((a, p) => a + p.kg, 0) });

  /* paso 6: destino */
  const stage: Unit[][] = G.map(() => []), stageUnits = G.map(() => 0), stageMax = G.map(() => 0), stagePk = G.map(() => 0);
  const routeBuf: Pkg[][] = Array.from({ length: R }, () => []);
  function toDest(gi: number, u: Unit): void {
    if (G[gi].dest === 'branch') {
      u.pk.forEach(setRc0);
      L('brT', { sk: u.sk, n: u.pk.length });
      submit('branch', { pk: u.pk.length, base: () => Tn('branchSort', u.pk.length) + fixMissorts(u.pk), done: () => {
        const rc: Record<string, number> = {};
        let scanned = 0;
        u.pk.forEach(p => {
          if (rnd() * 100 < DIS.postmanPct) { searchMissing(); return; }
          routeBuf[p.r].push(p); rc[p.r] = (rc[p.r] ?? 0) + 1; scanned++;
        });
        EV['LM-1'] += scanned; scans[gi] += scanned;
        L('brE', { rc });
      } });
    } else {
      if (!G[gi].reverify) u.pk.forEach(p => { if (p.bad) disc.missortUndetected++; }); // sin reverificación ni LM-1 nadie lo detecta
      stage[gi].push(u); stageUnits[gi]++; stagePk[gi] += u.pk.length;
      if (stageUnits[gi] > stageMax[gi]) stageMax[gi] = stageUnits[gi];
      L('stage', { g: gi, n: u.pk.length, sk: u.sk });
      tryLoad(gi);
    }
  }

  /** Faltante en LM-1: se busca; si aparece sale de inmediato, si no es un siniestro de bodega. */
  const searchMissing = (): void => {
    disc.postman++;
    submit('branch', { pk: 1, base: () => T('search'), done: () => {
      if (rnd() * 100 < DIS.postmanFoundPct) disc.postmanFound++; else disc.losses++;
      finish();
    } });
  };

  /* paso 7a: camiones de salida por grupo (semanas 1 y 2) */
  const present: OutTruck[][] = G.map(() => []);
  const outStats: OutboundStat[] = [];
  G.forEach((g, gi) => {
    if (g.dest === 'branch') return;
    g.outbound.forEach(o => {
      for (let d = 0; d < 14; d++) {
        if (!o.days[d % 7]) continue;
        const arr = d * DAY + hm(o.arrival)!;
        const tk: OutTruck = { gi, day: d, arr, sched: arr + W.outboundLoadWindowMin, state: 'here', m3: 0, kg: 0, units: 0, pkgs: 0, inflight: 0, jobs: [] };
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
          u.pk.forEach(p => { setRc0(p, tk.sched); finish(); });
          L('ld', { g: gi, n: u.pk.length });
          if (tk.state === 'closing' && tk.inflight === 0) depart(tk);
        } };
      tk.jobs.push(job);
      submit('load', job);
    }
  }
  function depart(tk: OutTruck): void {
    tk.state = 'gone';
    present[tk.gi] = present[tk.gi].filter(t => t !== tk);
    L('otD', { g: tk.gi });
    if (tk.day < 7 || tk.pkgs > 0) outStats.push({ gi: tk.gi, group: G[tk.gi].name, day: tk.day, arrival: tk.arr, scheduled: tk.sched, departure: now, units: tk.units, pkgs: tk.pkgs, m3: tk.m3, kg: tk.kg, late: Math.max(0, now - tk.sched), leftPkgs: stage[tk.gi].reduce((a, u) => a + u.pk.length, 0) });
  }

  /* paso 7b: carteros retiran cada ruta en cada ventana */
  const pickups: PickupStat[] = [];
  if (G.some(g => g.dest === 'branch')) {
    for (let r = 0; r < R; r++) cptRoute[r].forEach(t0 => {
      const d = Math.floor(t0 / DAY);
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
    });
  }

  /* ------------------------ muestreo ------------------------ */
  const snapshot = (): Wip => ({
    unload: pools.unload.qPk, decon: pools.decon.qPk, sort: pools.sort.qPk, hospital: pools.hospital.qPk, baskets: inBaskets.n,
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
  const cptStat = (c: { n: number; onTime: number; noCpt: number; delays: number[] }): CptStat => {
    const s = Float64Array.from(c.delays).sort();
    return { n: c.n, onTime: c.onTime, late: s.length, noCpt: c.noCpt, pct: c.n ? c.onTime / c.n : NaN,
      delayMean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN, delayP90: percentile(s, 90) };
  };
  const processes: ProcessStat[] = PROCESSES.map(p => {
    const P = pools[p];
    return { key: p, jobs: P.jobs, busyMin: P.busyW1, waitAvg: P.jobs ? P.waitSum / P.jobs : 0, maxQueuePkgs: P.maxQPk };
  });
  const shifts: ShiftStat[] = W.shifts.map((s, si) => {
    const ws = shiftWorkers[si], ot = ws.reduce((a, w) => a + w.otMin, 0), pm = paid.shift[si] + ot, busy = ws.reduce((a, w) => a + w.busyW1, 0);
    return { shiftId: s.id, name: s.name, night: s.night, workers: ws.length, paidMin: pm, busyMin: busy, otMin: ot, util: pm > 0 ? busy / pm : 0,
      changes: ws.reduce((a, w) => a + w.changes, 0), changeMin: ws.reduce((a, w) => a + w.changeMin, 0) };
  });
  const arrivedDay = new Array(7).fill(0);
  trucks.forEach(t => (arrivedDay[t.day] += t.total));
  const days: DayStat[] = [];
  for (let d = 0; d < 7; d++) days.push({ day: d, arrived: arrivedDay[d], rc0: dayRc0[d], finished: dayFin[d], paidMin: paid.day[d], busyMin: dayBusy[d], otMin: otDay[d], lastActivity: dayLast[d] });
  const groups: GroupStat[] = G.map((g, gi) => ({ name: g.name, dest: g.dest, reverify: g.reverify, pkgs: groupTot[gi], baskets: basketsUsed[gi], containers: containers[gi],
    scans: scans[gi], spp: groupTot[gi] ? scans[gi] / groupTot[gi] : 0, stageMax: stageMax[gi], time: stats(timesG[gi]), cpt: cptStat(cptRec[gi]) }));
  const all = cptRec.reduce((a, c) => ({ n: a.n + c.n, onTime: a.onTime + c.onTime, noCpt: a.noCpt + c.noCpt, delays: a.delays.concat(c.delays) }), { n: 0, onTime: 0, noCpt: 0, delays: [] as number[] });

  return {
    seed,
    totals: { pkgs: totPk, inbound: totPk - disc.customs, boxes: totBoxes, ulds: totUld, loose: totLoose, finished: totPk - unfinished, unfinished, carried, kg: totKg, m3: totL / 1000 },
    endT: Math.max(endT, now),
    processes, shifts, days,
    outbound: outStats.sort((a, b) => a.arrival - b.arrival || a.gi - b.gi),
    pickups, backlog, groups,
    inbound: trucks.map(t => ({ name: t.name, day: t.day, arrival: t.arr, pkgs: t.total, boxes: t.boxes.length, ulds: t.ulds.length, loose: t.loose.length, unloadEnd: t.unloadEnd, sortEnd: t.sortEnd })),
    time: stats(times), cpt: cptStat(all), hospital: hosp, discrepancies: disc,
    sorter: ST === 'sorter' ? { ...sorterSt, peakPerHour: Math.max(0, ...hourly.inducted) } : null,
    events: EV, hourly: { sorted: hourly.sorted, rc0: hourly.rc0 }, samples: samplesOut, warnings, log,
    routeTotals: routeTot,
  };
}
