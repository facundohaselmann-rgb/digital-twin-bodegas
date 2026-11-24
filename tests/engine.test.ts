import { describe, expect, it } from 'vitest';
import { Deque, percentile } from '../src/engine/core';
import { nextProcess, simulate } from '../src/engine/simulate';
import { jamaicaWarehouse, modelWarehouse } from '../src/model/defaults';
import { computeCost, kpis, summarize } from '../src/engine/kpis';
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
    // los destruidos en el hospital no llegan a canasto ni a RC-0
    expect(r.hospital.in).toBeGreaterThan(0);
    const gone = r.hospital.destroyed + r.discrepancies.customs; // destruidos y faltantes de aduana no llegan a RC-0
    expect(r.events['WI-3 + WI-4']).toBe(r.totals.pkgs - gone);
    expect(r.events['RC-0']).toBe(r.totals.pkgs - gone);
  });

  it('los paquetes con reverificación tienen 2 escaneos', () => {
    const rv = r.groups.filter(g => g.reverify);
    rv.forEach(g => expect(g.spp).toBeCloseTo(2, 1));
  });

  it('las horas extra solo ocurren en el turno noche', () => {
    r.shifts.filter(s => !s.night).forEach(s => expect(s.otMin).toBe(0));
  });

  it('el tiempo WI-2 → RC-0 tiene percentiles ordenados', () => {
    expect(r.time.n).toBe(r.events['RC-0']);
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
    r.shifts.forEach(s => { expect(s.util).toBeGreaterThanOrEqual(0); expect(s.util).toBeLessThanOrEqual(1.01); });
  });

  it('el CPT se calcula para cada paquete con RC-0', () => {
    expect(r.cpt.n).toBe(r.events['RC-0']);
    expect(r.cpt.onTime + r.cpt.late + r.cpt.noCpt).toBe(r.cpt.n);
    expect(r.cpt.pct).toBeGreaterThan(0);
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

  it('sin personal los paquetes no terminan y se advierte', () => {
    const w = base();
    w.shifts.forEach(s => Object.keys(s.staff).forEach(k => ((s.staff as Record<string, number>)[k] = 0)));
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
    const u = (night: boolean) => r.shifts.find(s => s.night === night)!.util;
    expect(u(true)).toBeLessThan(u(false)); // 10 personas de noche no pueden estar tan ocupadas como 3 de día
  });

  it('con muchas horas extra nadie trabaja más horas de las pagadas', () => {
    const w = base();
    w.shifts[0].staff.sort = 0; w.shifts[1].staff.sort = 1; w.shifts[1].overtimeHours = 16;
    w.inbound.forEach(i => (i.packages *= 3));
    const r = simulate(w, { log: false });
    // 1 % de margen: la tarea en curso al cierre del turno se termina (antes del arreglo daba 114 %)
    r.shifts.forEach(s => expect(s.busyMin).toBeLessThanOrEqual(s.paidMin * 1.01));
    expect(r.shifts.find(s => s.night)!.otMin).toBeGreaterThan(0);
  });

  it('el peso y volumen del paquete limitan la carga del camión', () => {
    const w = base();
    w.capacity.truckM3 = 1; // camión diminuto: necesita varios viajes
    const r = simulate(w, { log: false });
    r.outbound.forEach(o => expect(o.units === 1 || o.m3 <= 1 + 1e-9).toBe(true));
  });
});

describe('iteración 2', () => {
  it('multiskill: con toda la gente asignada a descarga igual se hace todo, cambiando de puesto', () => {
    const w = base();
    w.shifts.forEach(s => { const n = Object.values(s.staff).reduce((a, b) => a + b, 0); Object.keys(s.staff).forEach(k => ((s.staff as Record<string, number>)[k] = 0)); s.staff.unload = n; });
    const r = simulate(w, { log: false });
    expect(r.totals.unfinished).toBe(0);
    expect(r.shifts.reduce((a, s) => a + s.changes, 0)).toBeGreaterThan(0);
    r.shifts.forEach(s => expect(s.busyMin).toBeLessThanOrEqual(s.paidMin * 1.01));
  });

  it('multiskill: la espera antes de cambiar reduce los cambios de puesto', () => {
    const a = base(), b = base();
    a.multiskill.bufferMin = 0; b.multiskill.bufferMin = 10;
    const ra = simulate(a, { log: false }), rb = simulate(b, { log: false });
    const ch = (r: typeof ra) => r.shifts.reduce((x, s) => x + s.changes, 0);
    expect(ch(rb)).toBeLessThan(ch(ra));
    expect(rb.totals.unfinished).toBe(0);
    rb.shifts.forEach(s => expect(s.busyMin).toBeLessThanOrEqual(s.paidMin * 1.01));
  });

  it('sorter: no supera la capacidad de la máquina', () => {
    const w = base();
    w.sorting.type = 'sorter'; w.sorting.sorter.machinePerHour = 600; w.sorting.sorter.inductionPoints = 8;
    w.shifts.forEach(s => { s.staff.sort = 8; s.productivityPct = 150; }); // la productividad no acelera la máquina
    const r = simulate(w, { log: false });
    expect(r.sorter!.inducted).toBeGreaterThan(0);
    expect(r.sorter!.peakPerHour).toBeLessThanOrEqual(600 * 1.05);
    expect(r.totals.unfinished).toBe(0);
  });

  it('sorter: no mecanizables y bocas compartidas se clasifican a mano', () => {
    const w = base();
    w.sorting.type = 'sorter'; w.sorting.sorter.maxKg = 1.8; w.sorting.sorter.chutes = 5;
    const r = simulate(w, { log: false });
    expect(r.sorter!.nonConveyable).toBeGreaterThan(0);
    expect(r.sorter!.sharedChute).toBeGreaterThan(0);
    expect(r.totals.unfinished).toBe(0);
  });

  it('hospital: ~75 % se reetiqueta y vuelve, el resto se destruye', () => {
    const w = base();
    w.hospital.exceptionPct = 20;
    const r = simulate(w, { log: false });
    expect(r.hospital.in / r.totals.pkgs).toBeCloseTo(0.2, 1);
    expect(r.hospital.relabeled / r.hospital.in).toBeCloseTo(0.75, 1);
    expect(r.hospital.relabeled + r.hospital.destroyed).toBe(r.hospital.in);
    expect(r.events['RC-0'] + r.hospital.destroyed + r.discrepancies.customs).toBe(r.totals.pkgs);
    expect(r.totals.unfinished).toBe(0);
  });

  it('CPT: un paquete que se fue en su camión cumple aunque la carga termine después de la hora de salida', () => {
    const w = base();
    // cada carga empieza al llegar el camión y termina 1 min después de su salida programada
    w.outboundLoadWindowMin = 1; w.times.load = { min: 2, mode: 2, max: 2 };
    w.multiskill.changeMin = 0; w.multiskill.bufferMin = 0;
    w.shifts.forEach(s => (s.staff.load = 10));
    const r = simulate(w, { log: false });
    r.groups.filter(g => g.dest !== 'branch').forEach(g => expect(g.cpt.pct).toBeGreaterThan(0.5)); // antes del arreglo daba ~0 %
  });

  it('multiskill: vuelve a su puesto, la carga va primero y después el orden de ayuda', () => {
    const order = ['unload', 'decon', 'sort', 'hospital', 'reverify', 'branch', 'load'] as const;
    const help = (...ps: string[]) => (p: string) => ps.includes(p);
    expect(nextProcess('unload', 'sort', help('unload', 'load'), help('sort'), order)).toBe('unload'); // vuelve aunque donde está haya trabajo
    expect(nextProcess('unload', 'sort', help('load'), help('sort'), order)).toBe('sort');            // se queda si hay trabajo
    expect(nextProcess('unload', 'sort', help('decon', 'load'), help(), order)).toBe('load');          // camión esperando primero
    expect(nextProcess('unload', 'sort', help('branch', 'decon'), help(), order)).toBe('decon');       // después el orden de ayuda
    expect(nextProcess('unload', 'sort', help(), help(), order)).toBe('sort');                         // nada que hacer: se queda
  });

  it('CPT: con más tiempo esperado de procesamiento, más paquetes a tiempo', () => {
    const a = base(), b = base();
    a.cptLeadMin = 0; b.cptLeadMin = 600;
    const ra = simulate(a, { log: false }), rb = simulate(b, { log: false });
    expect(rb.cpt.pct).toBeGreaterThanOrEqual(ra.cpt.pct);
  });

  it('Branch: el RC-0 ocurre al llenarse el canasto, antes de cerrar el camión', () => {
    const w = base();
    w.capacity.basketPkgs = 10;
    const r = simulate(w);
    const firstClose = r.log.find(e => e.e === 'close')!.t;
    expect(r.log.some(e => e.e === 'brT' && e.t < firstClose)).toBe(true);
  });

  it('carteros: retiran en las dos ventanas del día', () => {
    const r = simulate(base(), { log: false });
    const tue = r.pickups.filter(p => p.day === 1 && p.pkgs > 0).map(p => Math.floor((p.time % 1440) / 60));
    expect(tue.some(h => h < 12)).toBe(true);
    expect(tue.some(h => h >= 14)).toBe(true);
  });
});

describe('iteración 3', () => {
  it('faltantes de aduana: no se procesan ni cuentan como entrantes', () => {
    const w = base(); w.discrepancies.customsPct = 5;
    const r = simulate(w, { log: false });
    expect(r.discrepancies.customs / r.totals.pkgs).toBeCloseTo(0.05, 1);
    expect(r.totals.inbound).toBe(r.totals.pkgs - r.discrepancies.customs);
    expect(r.events['RC-0'] + r.hospital.destroyed + r.discrepancies.customs).toBe(r.totals.pkgs);
    expect(r.totals.unfinished).toBe(0);
  });

  it('errores de sorting: se corrigen en AV-1 o LM-1 y suman tiempo', () => {
    const a = base(), b = base();
    a.discrepancies.missortPct.manual = 0; b.discrepancies.missortPct.manual = 10;
    const ra = simulate(a, { log: false }), rb = simulate(b, { log: false });
    expect(rb.discrepancies.missortFixed / rb.events['WI-3 + WI-4']).toBeCloseTo(0.1, 1);
    expect(rb.discrepancies.missortUndetected).toBe(0); // en Jamaica todos los grupos pasan por AV-1 o LM-1
    const rv = (r: typeof ra) => r.processes.find(p => p.key === 'reverify')!.busyMin;
    expect(rv(rb)).toBeGreaterThan(rv(ra));
  });

  it('faltantes de cartero: ~50 % aparece y el resto es siniestro', () => {
    const w = base(); w.discrepancies.postmanPct = 10;
    const r = simulate(w, { log: false });
    const branch = r.groups.filter(g => g.dest === 'branch').reduce((x, g) => x + g.pkgs, 0);
    expect(r.discrepancies.postman / branch).toBeCloseTo(0.1, 1);
    expect(r.discrepancies.postmanFound / r.discrepancies.postman).toBeCloseTo(0.5, 1);
    expect(r.discrepancies.postmanFound + r.discrepancies.losses).toBe(r.discrepancies.postman);
    expect(r.totals.unfinished).toBe(0);
  });

  it('costo: el total es la suma de sus partes y se reparte sobre los entrantes', () => {
    const w = base();
    const r = simulate(w, { log: false }), c = computeCost(r, w);
    expect(c.total).toBeCloseTo(c.labor + c.overtime + c.fixedTotal + c.supplies, 6);
    expect(c.perPkg * r.totals.inbound).toBeCloseTo(c.total, 6);
    // con sorting manual no cuentan los costos del sorter ni del Pick to Light
    const expected = w.costs.fixed.filter(f => !f.sorting).reduce((x, f) => x + f.usdMonth, 0) * 12 / 52;
    expect(c.fixedTotal).toBeCloseTo(expected, 6);
  });

  it('corridas múltiples: el margen se achica con más corridas', () => {
    const w = base();
    const runs = Array.from({ length: 20 }, (_, k) => kpis(simulate(w, { seed: 1 + k, log: false }), w).timeMean);
    const s5 = summarize(runs.slice(0, 5)), s20 = summarize(runs);
    expect(s20.ci).toBeLessThan(s5.ci);
    expect(s20.mean).toBeGreaterThanOrEqual(s20.min);
    expect(s20.mean).toBeLessThanOrEqual(s20.max);
  });

  it('bodega Modelo (Pick to Light) es válida y se procesa completa', () => {
    const w = modelWarehouse();
    expect(normalize(w).filter(x => x.key !== 'w.staffGtStations')).toEqual([]);
    expect(w.sorting.type).toBe('ptl');
    const r = simulate(w, { log: false });
    expect(r.totals.pkgs).toBeGreaterThan(25000);
    expect(r.totals.unfinished).toBe(0);
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
