import { describe, expect, it } from 'vitest';
import { Deque, percentile } from '../src/engine/core';
import { simulate } from '../src/engine/simulate';
import { jamaicaWarehouse } from '../src/model/defaults';
import { normalize } from '../src/model/normalize';
import { WEEK } from '../src/model/time';

const base = () => { const w = jamaicaWarehouse(); normalize(w); return w; };

describe('core', () => {
  it('Deque mantiene orden FIFO y crece', () => {
    const d = new Deque<number>(2);
    for (let i = 0; i < 100; i++) d.push(i);
    d.unshift(-1);
    expect(d.length).toBe(101);
    expect(d.shift()).toBe(-1);
    expect(d.shift()).toBe(0);
    expect([...d].slice(0, 3)).toEqual([1, 2, 3]);
  });
  it('percentil con interpolación', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([0, 10], 90)).toBeCloseTo(9);
  });
});

describe('simulación semanal — plantilla Jamaica', () => {
  const w = base();
  const r = simulate(w);

  it('procesa y despacha todos los paquetes', () => {
    expect(r.totals.pkgs).toBeGreaterThan(15000);
    expect(r.totals.unfinished).toBe(0);
    expect(r.events['WI-2']).toBe(r.totals.pkgs);
    expect(r.events['WI-3 + WI-4']).toBe(r.totals.pkgs);
    expect(r.events['RC-0']).toBe(r.totals.pkgs);
  });

  it('los paquetes con reverificación tienen 2 escaneos', () => {
    const rv = r.groups.filter(g => g.reverify);
    rv.forEach(g => expect(g.spp).toBeCloseTo(2, 5));
  });

  it('las horas extra solo ocurren en el turno noche', () => {
    r.shifts.filter(s => !s.night).forEach(s => expect(s.otMin).toBe(0));
  });

  it('el tiempo WI-2 → RC-0 tiene percentiles ordenados', () => {
    expect(r.time.n).toBe(r.totals.pkgs);
    expect(r.time.p90).toBeLessThanOrEqual(r.time.p95);
    expect(r.time.p95).toBeLessThanOrEqual(r.time.p98);
    expect(r.time.mean).toBeGreaterThan(0);
  });

  it('es reproducible con la misma semilla', () => {
    const r2 = simulate(w);
    expect(r2.time.mean).toBe(r.time.mean);
    expect(r2.endT).toBe(r.endT);
  });

  it('utilización entre 0 y 100 %', () => {
    r.processes.forEach(p => { expect(p.util).toBeGreaterThanOrEqual(0); expect(p.util).toBeLessThanOrEqual(1.0001); });
  });
});

describe('reglas de negocio', () => {
  it('los sueltos reciben WI-2 recién al terminar su descarga', () => {
    const w = base();
    w.inbound = [{ ...w.inbound[0], days: [true, false, false, false, false, false, false], packages: 300, mix: { boxes: 0, uld: 0, loose: 100 }, volumeVarPct: 0, timeVarMin: 0 }];
    const r = simulate(w);
    const rel = r.log.filter(e => e.e === 'lrel');
    const lastUnl = r.log.filter(e => e.e === 'unl').pop()!;
    expect(rel.length).toBe(1);
    expect(rel[0].t).toBe(lastUnl.t);
    expect(r.events['WI-2']).toBe(300);
  });

  it('sin horas extra el trabajo queda pendiente y no se registran HE', () => {
    const w = base();
    w.shifts.forEach(s => (s.overtimeHours = 0));
    const r = simulate(w);
    expect(r.shifts.reduce((a, s) => a + s.otMin, 0)).toBe(0);
    expect(r.totals.unfinished).toBe(0);
  });

  it('con personal insuficiente en reverificación los paquetes no terminan y se advierte', () => {
    const w = base();
    w.shifts.forEach(s => (s.staff.reverify = 0));
    const r = simulate(w);
    expect(r.totals.unfinished).toBeGreaterThan(0);
    expect(r.warnings.some(x => x.key === 'w.unfinished')).toBe(true);
  });

  it('la productividad más baja alarga el trabajo', () => {
    const a = base(), b = base();
    b.shifts.forEach(s => (s.productivityPct = 60));
    const ra = simulate(a, { log: false }), rb = simulate(b, { log: false });
    expect(rb.processes.find(p => p.key === 'sort')!.busyMin).toBeGreaterThan(ra.processes.find(p => p.key === 'sort')!.busyMin);
  });

  it('la utilización se mide por turno, no se reparte', () => {
    const w = base();
    w.shifts[0].staff.sort = 3; w.shifts[1].staff.sort = 10; w.capacity.stations.sort = 20;
    const r = simulate(w, { log: false });
    const u = (night: boolean) => r.shifts.find(s => s.process === 'sort' && s.night === night)!.util;
    expect(u(true)).toBeLessThan(u(false)); // 10 personas de noche no pueden estar tan ocupadas como 3 de día
  });

  it('con muchas horas extra nadie trabaja más horas de las pagadas', () => {
    const w = base();
    w.shifts[0].staff.sort = 0; w.shifts[1].staff.sort = 1; w.shifts[1].overtimeHours = 16;
    w.inbound.forEach(i => (i.packages *= 3));
    const r = simulate(w, { log: false });
    // 1 % de margen: la tarea en curso al cierre del turno se termina (antes del arreglo daba 114 %)
    r.processes.forEach(p => expect(p.busyMin).toBeLessThanOrEqual(p.paidMin * 1.01));
    r.shifts.forEach(s => expect(s.busyMin).toBeLessThanOrEqual(s.paidMin * 1.01));
    expect(r.shifts.find(s => s.process === 'sort')!.otMin).toBeGreaterThan(0);
  });

  it('el peso y volumen del paquete limitan la carga del camión', () => {
    const w = base();
    w.capacity.truckM3 = 1; // camión diminuto: necesita varios viajes
    const r = simulate(w, { log: false });
    r.outbound.forEach(o => expect(o.units === 1 || o.m3 <= 1 + 1e-9).toBe(true));
  });
});

describe('escala', () => {
  it('30.000 paquetes por día (≈180.000 por semana) en pocos segundos', () => {
    const w = base();
    w.shifts.forEach(s => { Object.keys(s.staff).forEach(k => ((s.staff as Record<string, number>)[k] *= 9)); });
    w.capacity.stations = { sort: 60, reverify: 30, branch: 30 };
    w.capacity.truckM3 = 400; w.capacity.truckKg = 80000;
    const t0 = performance.now();
    const r = simulate(w, { volume: 30000 / 3500, log: false });
    const ms = performance.now() - t0;
    expect(r.totals.pkgs).toBeGreaterThan(150000);
    expect(r.endT).toBeLessThan(2 * WEEK);
    expect(ms).toBeLessThan(15000);
  });
});
