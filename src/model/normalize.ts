import { COST_CATEGORIES, LEGS, PROCESSES, TIME_KEYS, ZONE_KINDS, type Days, type Layout, type TravelMode, type ProcessKey, type Routes, type Warehouse, type Warning, type PackageProfile } from './types';
import { DEFAULT_DISCREPANCIES, DEFAULT_SORTER, DEFAULT_TIMES, MON_SAT, defaultFixedCosts, uid } from './defaults';
import { hm } from './time';
import { DEFAULT_TRAVEL, syncLayout } from './layout';

const num = (v: unknown, d: number, lo?: number, hi?: number): number => {
  let x = typeof v === 'number' ? v : parseFloat(String(v));
  if (!isFinite(x)) x = d;
  if (lo != null) x = Math.max(lo, x);
  if (hi != null) x = Math.min(hi, x);
  return x;
};
const int = (v: unknown, d: number, lo?: number, hi?: number) => Math.round(num(v, d, lo, hi));
const days = (v: unknown): Days => {
  const a = Array.isArray(v) ? v : [];
  return [0, 1, 2, 3, 4, 5, 6].map(i => !!a[i]) as Days;
};
const time = (v: unknown, d: string): string => (hm(String(v)) == null ? d : String(v).padStart(5, '0'));

function profile(p: Partial<PackageProfile> | null | undefined): PackageProfile {
  const q = p ?? {};
  return {
    weightKg: num(q.weightKg, 2, 0.01, 1000),
    lengthCm: num(q.lengthCm, 30, 1, 1000),
    widthCm: num(q.widthCm, 22, 1, 1000),
    heightCm: num(q.heightCm, 12, 1, 1000),
    variationPct: num(q.variationPct, 0, 0, 90),
  };
}

function layout(L: Layout | null | undefined): Layout | null {
  if (!L || typeof L !== 'object') return null;
  const widthM = num(L.widthM, 50, 5, 2000), heightM = num(L.heightM, 25, 5, 2000);
  const zones = (Array.isArray(L.zones) ? L.zones : []).filter(z => z && (ZONE_KINDS as readonly string[]).includes(z.kind))
    .map(z => ({ kind: z.kind, ref: String(z.ref ?? ''), x: num(z.x, 0, -widthM, 2 * widthM), y: num(z.y, 0, -heightM, 2 * heightM), w: num(z.w, 1, 0.2, 2000), h: num(z.h, 1, 0.2, 2000) }));
  return { widthM, heightM, zones };
}

/** Corrige valores fuera de rango (en el lugar) y devuelve advertencias para mostrar. */
export function normalize(w: Warehouse): Warning[] {
  const W: Warning[] = [];
  w.name = String(w.name ?? '').trim() || 'Bodega';
  w.seed = int(w.seed, 1, 1, 1e9);
  w.packageProfile = profile(w.packageProfile);

  /* camiones de entrada */
  w.inbound = Array.isArray(w.inbound) ? w.inbound : [];
  w.inbound.forEach(t => {
    t.id ||= uid('i');
    t.days = days(t.days);
    t.arrival = time(t.arrival, '08:00');
    t.packages = int(t.packages, 0, 0, 1e6);
    t.mix = { boxes: num(t.mix?.boxes, 100, 0, 100), uld: num(t.mix?.uld, 0, 0, 100), loose: num(t.mix?.loose, 0, 0, 100) };
    const s = t.mix.boxes + t.mix.uld + t.mix.loose;
    if (s <= 0) t.mix.boxes = 100;
    else if (Math.abs(s - 100) > 0.5) W.push({ key: 'w.mixSum', params: { truck: t.name, sum: Math.round(s) } });
    t.pkgsPerBox = int(t.pkgsPerBox, 60, 1, 10000);
    t.pkgsPerUld = int(t.pkgsPerUld, 150, 1, 100000);
    t.volumeVarPct = num(t.volumeVarPct, 0, 0, 90);
    t.timeVarMin = num(t.timeVarMin, 0, 0, 600);
  });
  if (!w.inbound.some(t => t.packages > 0 && t.days.some(Boolean))) W.push({ key: 'w.noInbound' });

  /* grupos de sorting */
  w.groups = Array.isArray(w.groups) && w.groups.length ? w.groups : [];
  w.groups.forEach(g => {
    g.id ||= uid('g');
    g.sharePct = num(g.sharePct, 0, 0, 100);
    g.dest = g.dest === 'branch' ? 'branch' : 'stageout';
    g.reverify = !!g.reverify;
    g.services = Array.isArray(g.services) && g.services.length ? g.services : [{ id: uid('s'), name: 'Servicio', confirmed: false, weight: 1 }];
    g.services.forEach(s => { s.id ||= uid('s'); s.weight = num(s.weight, 1, 0, 1000); });
    g.outbound = Array.isArray(g.outbound) ? g.outbound : [];
    g.outbound.forEach(o => { o.id ||= uid('o'); o.days = days(o.days); o.arrival = time(o.arrival, '16:00'); });
    g.profile = g.profile ? profile(g.profile) : null;
    if (g.dest === 'stageout' && !g.outbound.some(o => o.days.some(Boolean))) W.push({ key: 'w.noOutbound', params: { group: g.name } });
  });
  const shareSum = w.groups.reduce((a, g) => a + g.sharePct, 0);
  if (!w.groups.length) W.push({ key: 'w.noGroups' });
  else if (shareSum <= 0) { w.groups.forEach(g => (g.sharePct = 1)); W.push({ key: 'w.noShare' }); }
  else if (Math.abs(shareSum - 100) > 0.5) W.push({ key: 'w.shareSum', params: { sum: Math.round(shareSum * 10) / 10 } });

  /* rutas */
  const rt = (w.routes ?? {}) as Routes & { first?: string; everyMin?: number; days?: Days };
  // archivos de la iteración 1: una sola franja (first/everyMin/days) pasa a ser la primera ventana
  if (!Array.isArray(rt.windows)) rt.windows = [{ id: uid('v'), name: 'Ventana 1', days: rt.days ?? [...MON_SAT] as Days, first: rt.first ?? '14:00', everyMin: rt.everyMin ?? 10 }];
  w.routes = { count: int(rt.count, 10, 1, 60), windows: rt.windows };
  w.routes.windows.forEach(v => { v.id ||= uid('v'); v.days = days(v.days); v.first = time(v.first, '14:00'); v.everyMin = num(v.everyMin, 10, 0, 600); });
  if (w.groups.some(g => g.dest === 'branch') && !w.routes.windows.some(v => v.days.some(Boolean))) W.push({ key: 'w.noRouteDays' });

  /* tiempos */
  w.times = w.times ?? structuredClone(DEFAULT_TIMES);
  TIME_KEYS.forEach(k => {
    const t = w.times[k] ?? structuredClone(DEFAULT_TIMES[k]);
    t.min = num(t.min, DEFAULT_TIMES[k].min, 0);
    t.mode = num(t.mode, t.min, t.min);
    t.max = num(t.max, t.mode, t.mode);
    w.times[k] = t;
  });

  /* capacidades */
  const c = w.capacity;
  c.basketPkgs = int(c.basketPkgs, 60, 1, 100000);
  c.basketLiters = num(c.basketLiters, 500, 1, 1e6);
  c.containerPkgs = int(c.containerPkgs, 150, 1, 1e6);
  c.containerLiters = num(c.containerLiters, 1500, 1, 1e7);
  c.stageOutSlots = int(c.stageOutSlots, 6, 1, 60);
  c.truckM3 = num(c.truckM3, 18, 0.1, 1000);
  c.truckKg = num(c.truckKg, 3500, 1, 1e6);
  c.stations = c.stations ?? { sort: 4, reverify: 2, branch: 2 };
  c.stations.sort = int(c.stations.sort, 4, 1, 500);
  c.stations.reverify = int(c.stations.reverify, 2, 1, 500);
  c.stations.branch = int(c.stations.branch, 2, 1, 500);
  w.outboundLoadWindowMin = num(w.outboundLoadWindowMin, 30, 0, 1440);
  w.volumePct = num(w.volumePct, 100, 1, 1000);
  const fixed = Array.isArray(w.costs?.fixed) ? w.costs.fixed : defaultFixedCosts();
  w.costs = { overtimeMultiplier: num(w.costs?.overtimeMultiplier, 1.5, 1, 5), relabelUsd: num(w.costs?.relabelUsd, 0.05, 0, 1000),
    fixed: fixed.map(f => ({ id: f.id || uid('c'), category: (COST_CATEGORIES as readonly string[]).includes(f.category) ? f.category : 'overhead',
      name: String(f.name ?? ''), usdMonth: num(f.usdMonth, 0, 0, 1e9), sorting: f.sorting === 'manual' || f.sorting === 'ptl' || f.sorting === 'sorter' ? f.sorting : '' })) };
  const so = w.sorting ?? { type: 'manual', sorter: { ...DEFAULT_SORTER } };
  const sr = { ...DEFAULT_SORTER, ...so.sorter };
  w.sorting = { type: so.type === 'ptl' || so.type === 'sorter' ? so.type : 'manual', sorter: {
    inductionPoints: int(sr.inductionPoints, 2, 1, 100), machinePerHour: num(sr.machinePerHour, 3000, 1, 1e6), chutes: int(sr.chutes, 24, 1, 2000),
    maxKg: num(sr.maxKg, 30, 0.1, 1e4), maxLengthCm: num(sr.maxLengthCm, 80, 1, 1e4), maxWidthCm: num(sr.maxWidthCm, 60, 1, 1e4), maxHeightCm: num(sr.maxHeightCm, 60, 1, 1e4),
    noReadPct: num(sr.noReadPct, 0, 0, 100) } };
  w.hospital = { exceptionPct: num(w.hospital?.exceptionPct, 0, 0, 100), relabelPct: num(w.hospital?.relabelPct, 75, 0, 100) };
  const pr = (w.multiskill?.priority ?? []).filter(p => (PROCESSES as readonly string[]).includes(p));
  w.multiskill = { bufferMin: num(w.multiskill?.bufferMin, 10, 0, 240), changeMin: num(w.multiskill?.changeMin, 5, 0, 240), priority: [...new Set([...pr, ...PROCESSES])] };
  w.cptLeadMin = num(w.cptLeadMin, 240, 0, 7 * 1440);
  const d = w.discrepancies ?? DEFAULT_DISCREPANCIES, mp = d.missortPct ?? DEFAULT_DISCREPANCIES.missortPct;
  w.discrepancies = { customsPct: num(d.customsPct, 0, 0, 100), postmanPct: num(d.postmanPct, 0, 0, 100), postmanFoundPct: num(d.postmanFoundPct, 50, 0, 100),
    missortPct: { manual: num(mp.manual, 0, 0, 100), ptl: num(mp.ptl, 0, 0, 100), sorter: num(mp.sorter, 0, 0, 100) } };
  w.replicas = int(w.replicas, 20, 1, 100);

  /* traslados y layout */
  const tv = w.travel ?? DEFAULT_TRAVEL, sp = tv.speeds ?? DEFAULT_TRAVEL.speeds, md = (tv.modes ?? {}) as Record<string, unknown>;
  const mode = (v: unknown, d: TravelMode): TravelMode => (v === 'walk' || v === 'cart' || v === 'jack' ? v : d);
  w.travel = {
    speeds: { walk: num(sp.walk, 1.2, 0.05, 20), cart: num(sp.cart, 1, 0.05, 20), jack: num(sp.jack, 0.8, 0.05, 20) },
    handleSec: num(tv.handleSec, 30, 0, 3600),
    modes: Object.fromEntries(LEGS.map(l => [l, mode(md[l], DEFAULT_TRAVEL.modes[l])])) as typeof DEFAULT_TRAVEL.modes,
  };
  w.layout = layout(w.layout);
  syncLayout(w);

  /* turnos */
  w.shifts = Array.isArray(w.shifts) ? w.shifts : [];
  if (!w.shifts.length) W.push({ key: 'w.noShifts' });
  w.shifts.forEach(s => {
    s.id ||= uid('t');
    s.days = days(s.days);
    s.start = time(s.start, '06:00');
    s.end = time(s.end, '14:00');
    s.breaks = (Array.isArray(s.breaks) ? s.breaks : []).map(b => ({ start: time(b.start, s.start), minutes: num(b.minutes, 0, 0, 240) }));
    s.productivityPct = num(s.productivityPct, 100, 10, 200);
    s.costPerHour = num(s.costPerHour, 0, 0, 1000);
    s.night = !!s.night;
    s.overtimeHours = s.night ? num(s.overtimeHours, 0, 0, 24) : 0;
    const st = (s.staff ?? {}) as Record<ProcessKey, number>;
    PROCESSES.forEach(p => (st[p] = int(st[p], 0, 0, 1000)));
    s.staff = st;
    (['sort', 'reverify', 'branch'] as const).forEach(p => {
      const lim = p === 'sort' && w.sorting.type === 'sorter' ? w.sorting.sorter.inductionPoints : c.stations[p];
      if (st[p] > lim) W.push({ key: 'w.staffGtStations', params: { process: p, shift: s.name, staff: st[p], stations: lim } });
    });
  });

  /* con personal multiskill alcanza con que haya alguien en algún turno */
  if (!w.shifts.some(s => s.days.some(Boolean) && PROCESSES.some(p => s.staff[p] > 0))) W.push({ key: 'w.noStaff' });
  return W;
}

