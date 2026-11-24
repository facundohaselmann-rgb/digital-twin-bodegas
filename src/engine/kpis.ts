/* Costos (USD) y resumen de KPIs de una corrida; media y margen al 95 % de varias corridas. */
import { COST_CATEGORIES, PROCESSES, type CostCategory, type ProcessKey, type Warehouse } from '../model/types';
import type { SimResult } from './simulate';

const WEEKS_PER_MONTH = 52 / 12;

export interface CostResult {
  labor: number; overtime: number; supplies: number;
  fixed: Record<CostCategory, number>; fixedTotal: number;
  /** Parte de la mano de obra (normal + extra) pagada sin trabajo. */
  idle: number;
  byProcess: Record<ProcessKey, number>;
  /** Parte de la mano de obra ocupada que se fue en traslados (ya incluida en byProcess). */
  travel: number;
  /** Mano de obra de retornos: RT-1/RT-2 más la atención de clientes (ya incluida en byProcess). */
  returns: number;
  /** Costo por paquete retornado (devueltos por carteros y por sucursales). */
  perReturn: number;
  total: number;
  /** Costo por paquete entrante (los faltantes de aduana no cuentan). */
  perPkg: number;
}

export function computeCost(r: SimResult, w: Warehouse): CostResult {
  let labor = 0, overtime = 0, paidH = 0;
  r.shifts.forEach(s => {
    const rate = w.shifts.find(x => x.id === s.shiftId)?.costPerHour ?? 0;
    labor += ((s.paidMin - s.otMin) / 60) * rate;
    overtime += (s.otMin / 60) * rate * w.costs.overtimeMultiplier;
    paidH += s.paidMin / 60;
  });
  const avgRate = paidH ? (labor + overtime) / paidH : 0;
  const byProcess = Object.fromEntries(PROCESSES.map(p => [p, ((r.processes.find(x => x.key === p)?.busyMin ?? 0) / 60) * avgRate])) as Record<ProcessKey, number>;
  const fixed = Object.fromEntries(COST_CATEGORIES.map(c => [c, 0])) as Record<CostCategory, number>;
  w.costs.fixed.forEach(f => { if (!f.sorting || f.sorting === w.sorting.type) fixed[f.category] += f.usdMonth / WEEKS_PER_MONTH; });
  const fixedTotal = COST_CATEGORIES.reduce((a, c) => a + fixed[c], 0);
  const supplies = r.hospital.relabeled * w.costs.relabelUsd;
  const total = labor + overtime + fixedTotal + supplies;
  const idle = Math.max(0, labor + overtime - PROCESSES.reduce((a, p) => a + byProcess[p], 0));
  const returns = ((r.processes.find(x => x.key === 'returns')?.busyMin ?? 0) + r.returns.custMin) / 60 * avgRate, nRet = r.returns.dv1 + r.returns.branch;
  return { labor, overtime, supplies, fixed, fixedTotal, idle, byProcess, travel: r.travel.hours * avgRate, returns, perReturn: nRet ? returns / nRet : NaN, total, perPkg: r.totals.inbound ? total / r.totals.inbound : NaN };
}

export const KPI_KEYS = ['costPerPkg', 'cptPct', 'timeMean', 'timeP90', 'timeP95', 'timeP98', 'busyH', 'util', 'otH', 'changes', 'travelKm', 'returnCost', 'unfinished'] as const;
export type KpiKey = typeof KPI_KEYS[number];
export type Kpis = Record<KpiKey, number>;

export function kpis(r: SimResult, w: Warehouse): Kpis {
  const paid = r.shifts.reduce((a, s) => a + s.paidMin, 0), busy = r.shifts.reduce((a, s) => a + s.busyMin, 0), c = computeCost(r, w);
  return {
    costPerPkg: c.perPkg, returnCost: c.perReturn, cptPct: r.cpt.pct,
    timeMean: r.time.mean, timeP90: r.time.p90, timeP95: r.time.p95, timeP98: r.time.p98,
    busyH: busy / 60, util: paid ? busy / paid : NaN, otH: r.shifts.reduce((a, s) => a + s.otMin, 0) / 60,
    changes: r.shifts.reduce((a, s) => a + s.changes, 0), travelKm: r.travel.km, unfinished: r.totals.unfinished,
  };
}

export interface Summary { mean: number; ci: number; min: number; max: number }

/** Media y margen al 95 % (t de Student). */
export function summarize(xs: number[]): Summary {
  const v = xs.filter(Number.isFinite), n = v.length;
  if (!n) return { mean: NaN, ci: NaN, min: NaN, max: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ci: NaN, min: mean, max: mean };
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)), df = n - 1;
  // shortcut: aproximación de t(0,975; gl) con error < 1 % desde 4 corridas; alcanza para el rango de corridas que se usa (≥ 5)
  const t = 1.96 + 2.37 / df + 2.8 / (df * df);
  return { mean, ci: (t * sd) / Math.sqrt(n), min: Math.min(...v), max: Math.max(...v) };
}
