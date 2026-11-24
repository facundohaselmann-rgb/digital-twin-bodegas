import { describe, expect, it } from 'vitest';
import { jamaicaWarehouse } from '../src/model/defaults';
import { normalize } from '../src/model/normalize';
import { nextProcess, simulate } from '../src/engine/simulate';
import { syncLayout } from '../src/model/layout';
import type { ProcessKey, Warehouse } from '../src/model/types';

const run = (f: (w: Warehouse) => void = () => undefined) => { const w = jamaicaWarehouse(); f(w); normalize(w); return { w, r: simulate(w, { log: false }) }; };

describe('retornos', () => {
  const { w, r } = run();
  const R = r.returns, dv1Week = r.routeTotals.reduce((a, b) => a + b, 0) * 0.02;

  it('estantería en régimen estable: 25 % retirado en 14 días, el resto vence a RT-1', () => {
    expect(R.stayDays).toBeCloseTo((1 - 0.75) / (1 - Math.pow(0.75, 1 / 14)), 6);
    expect(R.shelfStart).toBe(Math.round((dv1Week / 7) * R.stayDays));
    expect(Math.abs(R.picked - dv1Week * 0.25)).toBeLessThanOrEqual(2);
    expect(Math.abs(R.expired - dv1Week * 0.75)).toBeLessThanOrEqual(2);
    expect(R.custMin).toBeGreaterThan(0);
  });

  it('DV-1 ≈ 2 % de lo que retiran los carteros; sucursales: 2 % de lo despachado', () => {
    const picked = r.pickups.reduce((a, p) => a + p.pkgs, 0);
    expect(Math.abs(R.dv1 - picked * 0.02)).toBeLessThan(picked * 0.01);
    const dispatched = r.groups.filter(g => g.dest !== 'branch').reduce((a, g) => a + g.pkgs, 0);
    expect(Math.abs(R.branch - dispatched * 0.02)).toBeLessThan(dispatched * 0.004);
  });

  it('RT-1 clasifica todo lo que entra; lo del hospital va siempre a destrucción', () => {
    expect(R.rt1).toBe(R.destroy + R.back);
    expect(R.hospital).toBeGreaterThan(0);
    const { r: r0 } = run(x => { x.returns.destroyPct = 0; });
    expect(r0.returns.destroy).toBe(r0.returns.hospital);
  });

  it('el camión RT-2 sale al juntar las cajas pedidas o una vez por semana', () => {
    const { r: r1 } = run(x => { x.returns.rt2.maxBoxes = 1; });
    expect(r1.returns.trips).toBeGreaterThan(r.returns.trips);
    const { r: r2 } = run(x => { x.returns.pkgsPerBox = 100000; });
    expect(r2.returns.boxes).toBe(0);
    expect(r2.returns.trips).toBe(0);
  });

  it('retornos no tiene personal fijo y no entra en el orden de ayuda', () => {
    expect(w.shifts.every(s => s.staff.returns === 0)).toBe(true);
    expect(w.multiskill.priority).not.toContain('returns');
    expect(r.processes.find(p => p.key === 'returns')!.jobs).toBeGreaterThan(0);
  });

  it('sin devoluciones no hay estantería ni clientes', () => {
    const { r: z } = run(x => { x.returns.postmanPct = 0; x.returns.branchPct = 0; });
    expect([z.returns.dv1, z.returns.branch, z.returns.picked, z.returns.shelfStart]).toEqual([0, 0, 0, 0]);
  });
});

describe('baja prioridad', () => {
  const pr: ProcessKey[] = ['unload', 'decon', 'sort', 'hospital', 'reverify', 'branch', 'load'];
  const yes = (k: ProcessKey) => (p: ProcessKey) => p === k, no = () => false;
  it('quien está en retornos se va apenas otro proceso necesita ayuda', () => {
    expect(nextProcess('sort', 'returns', yes('reverify'), yes('returns'), pr, ['returns'])).toBe('reverify');
  });
  it('sigue en retornos solo si nadie más necesita ayuda; sin trabajo vuelve a su puesto', () => {
    expect(nextProcess('sort', 'returns', no, yes('returns'), pr, ['returns'])).toBe('returns');
    expect(nextProcess('sort', 'returns', no, no, pr, ['returns'])).toBe('sort');
  });
  it('alguien ocioso va a retornos cuando hay trabajo ahí', () => {
    expect(nextProcess('sort', 'sort', yes('returns'), no, pr, ['returns'])).toBe('returns');
  });
});

describe('layout con retornos', () => {
  it('una disposición de 50 × 25 m suma estantería, retornos y puerta RT-2, y crece para contenerlas', () => {
    const w = jamaicaWarehouse();
    w.layout!.zones = w.layout!.zones.filter(z => z.kind !== 'shelf' && z.kind !== 'returns' && z.kind !== 'rt2Door');
    w.layout!.heightM = 25;
    syncLayout(w);
    const kinds = w.layout!.zones.map(z => z.kind);
    expect(kinds).toContain('shelf');
    expect(kinds).toContain('returns');
    expect(kinds).toContain('rt2Door');
    expect(w.layout!.heightM).toBeGreaterThanOrEqual(29.5);
  });
});
