import { describe, expect, it } from 'vitest';
import { newProject, jamaicaWarehouse, blankWarehouse } from '../src/model/defaults';
import { normalize } from '../src/model/normalize';
import { parseProject, serialize } from '../src/storage/project';
import { simulate } from '../src/engine/simulate';

describe('archivo de proyecto', () => {
  it('se guarda y se vuelve a abrir sin perder datos', () => {
    const p = newProject(jamaicaWarehouse());
    const q = parseProject(serialize(p));
    expect(q).toEqual(p);
  });
  it('rechaza archivos que no son proyectos', () => {
    expect(() => parseProject('{"hola":1}')).toThrow();
    expect(() => parseProject('no es json')).toThrow();
  });
  it('un archivo incompleto se completa al abrirlo; uno roto se rechaza', () => {
    const p = newProject(jamaicaWarehouse()) as unknown as { warehouse: Record<string, unknown> };
    delete p.warehouse.capacity;
    const q = parseProject(JSON.stringify(p));
    expect(q.warehouse.capacity.basketPkgs).toBeGreaterThan(0);
    p.warehouse.capacity = null;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it('las rutas de la iteración 1 pasan a una ventana de carteros', () => {
    const w = jamaicaWarehouse() as unknown as { routes: unknown };
    w.routes = { count: 7, first: '15:30', everyMin: 5, days: [true, false, false, false, false, false, false] };
    const x = w as unknown as Parameters<typeof normalize>[0];
    normalize(x);
    expect(x.routes.count).toBe(7);
    expect(x.routes.windows).toHaveLength(1);
    expect(x.routes.windows[0].first).toBe('15:30');
  });
  it('con sorter, avisa si hay más personas en sorting que puntos de inducción', () => {
    const w = jamaicaWarehouse();
    w.sorting.type = 'sorter'; w.sorting.sorter.inductionPoints = 2; w.shifts[0].staff.sort = 3; w.capacity.stations.sort = 4;
    expect(normalize(w).some(x => x.key === 'w.staffGtStations' && x.params?.stations === 2)).toBe(true);
  });
  it('la bodega en blanco es válida y simulable', () => {
    const w = blankWarehouse();
    const warnings = normalize(w);
    expect(warnings.filter(x => x.key !== 'w.staffGtStations')).toEqual([]);
    const r = simulate(w, { log: false });
    expect(r.totals.unfinished).toBe(0);
  });
  it('la normalización corrige valores inválidos', () => {
    const w = jamaicaWarehouse();
    (w.inbound[0] as unknown as Record<string, unknown>).arrival = '99:99';
    w.shifts[0].overtimeHours = 5; // turno día: no admite horas extra
    w.capacity.basketPkgs = -3;
    normalize(w);
    expect(w.inbound[0].arrival).toBe('08:00');
    expect(w.shifts[0].overtimeHours).toBe(0);
    expect(w.capacity.basketPkgs).toBe(1);
  });
});
