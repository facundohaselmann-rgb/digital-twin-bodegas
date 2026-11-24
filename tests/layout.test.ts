import { describe, expect, it } from 'vitest';
import { autoLayout, distances, ensureLayout, fitPlan, syncLayout, zoneGap } from '../src/model/layout';
import { jamaicaWarehouse, modelWarehouse, newProject, uid } from '../src/model/defaults';
import { normalize } from '../src/model/normalize';
import { simulate } from '../src/engine/simulate';
import { parseProject, serialize } from '../src/storage/project';
import { parseDxf } from '../src/plan/import';
import type { Warehouse, Zone } from '../src/model/types';

const z = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'decon', ref: '', x, y, w, h });
const moveGroup = (w: Warehouse, dx: number) => { const g = w.layout!.zones.find(q => q.kind === 'group' && q.ref === w.groups[0].id)!; g.x += dx; };

describe('layout', () => {
  it('distancia en ángulo recto entre bordes: 0 si se tocan o se superponen', () => {
    expect(zoneGap(z(0, 0, 2, 2), z(2, 0, 2, 2))).toBe(0);
    expect(zoneGap(z(0, 0, 2, 2), z(1, 1, 2, 2))).toBe(0);
    expect(zoneGap(z(0, 0, 2, 2), z(5, 6, 1, 1))).toBe(3 + 4);
    expect(zoneGap(null, z(5, 6, 1, 1))).toBe(0);
  });

  it('la disposición por defecto tiene una zona por elemento y las de traspaso se tocan', () => {
    const w = modelWarehouse();
    const L = autoLayout(w);
    const so = w.groups.filter(g => g.dest !== 'branch').length;
    expect(L.zones.filter(q => q.kind === 'group')).toHaveLength(w.groups.length);
    expect(L.zones.filter(q => q.kind === 'stage')).toHaveLength(so);
    expect(L.zones.filter(q => q.kind === 'outDoor')).toHaveLength(so);
    const D = distances({ ...w, layout: L });
    expect([D.unloadDecon, D.deconSort, D.looseSort, D.routeExit]).toEqual([0, 0, 0, 0]);
    expect(D.sortGroup.every(d => d === 0)).toBe(true);
    expect(D.stageDock.every(d => d === 0)).toBe(true);
    // los grupos lejos de la reverificación sí suman traslado
    expect(Math.max(...D.first)).toBeGreaterThan(15);
  });

  it('al cambiar los grupos se agregan y quitan zonas sin mover las dibujadas', () => {
    const w = jamaicaWarehouse();
    moveGroup(w, 3);
    const moved = w.layout!.zones.find(q => q.ref === w.groups[0].id && q.kind === 'group')!.x;
    w.groups[1].dest = 'branch';
    w.groups.push({ ...structuredClone(w.groups[0]), id: uid('g'), name: 'Nuevo' });
    syncLayout(w);
    expect(w.layout!.zones.find(q => q.ref === w.groups[0].id && q.kind === 'group')!.x).toBe(moved);
    expect(w.layout!.zones.some(q => q.ref === w.groups[1].id && q.kind === 'stage')).toBe(false);
    expect(w.layout!.zones.filter(q => q.ref === w.groups[5].id).map(q => q.kind).sort()).toEqual(['group', 'outDoor', 'stage']);
  });
});

describe('plano de fondo y proyectos anteriores', () => {
  it('fijar la escala ajusta la bodega y escala las zonas de todos los escenarios', () => {
    const p = newProject(jamaicaWarehouse());
    const before = p.scenarios.map(s => structuredClone(s.warehouse.layout!.zones));
    const bg = { kind: 'image' as const, name: 'p.png', data: 'data:image/png;base64,', w: 1000, h: 500, scale: 0.05 };
    fitPlan(p, bg);
    expect(p.scenarios.every(s => s.warehouse.layout!.widthM === 50 && s.warehouse.layout!.heightM === 25)).toBe(true);
    bg.scale *= 2;
    fitPlan(p, bg, 2);
    p.scenarios.forEach((s, i) => {
      expect(s.warehouse.layout!.widthM).toBe(100);
      s.warehouse.layout!.zones.forEach((q, j) => { expect(q.x).toBeCloseTo(before[i][j].x * 2); expect(q.w).toBeCloseTo(before[i][j].w * 2); });
    });
  });

  it('un proyecto sin disposición pasa a 2 min + caminata al crearla; un valor propio se respeta', () => {
    const w = jamaicaWarehouse(); w.layout = null; w.multiskill.changeMin = 5;
    expect(ensureLayout(w).zones.length).toBeGreaterThan(0);
    expect(w.multiskill.changeMin).toBe(2);
    const v = jamaicaWarehouse(); v.layout = null; v.multiskill.changeMin = 4;
    ensureLayout(v);
    expect(v.multiskill.changeMin).toBe(4);
    v.multiskill.changeMin = 5;
    ensureLayout(v); // ya tiene disposición: no se toca
    expect(v.multiskill.changeMin).toBe(5);
  });
});

describe('traslados en la simulación', () => {
  const run = (f: (w: Warehouse) => void) => { const w = jamaicaWarehouse(); f(w); normalize(w); return simulate(w, { log: false }); };

  it('sin layout no hay traslados (proyectos anteriores)', () => {
    const r = run(w => { w.layout = null; });
    expect(r.travel).toEqual({ km: 0, hours: 0 });
  });

  it('alejar una zona suma metros y horas ocupadas', () => {
    // la reverificación 15 m más lejos: cada canasto y contenedor viaja más
    const near = run(() => undefined), far = run(w => { w.layout!.zones.forEach(q => { if (q.kind === 'reverify') q.x += 15; else if (q.kind === 'stage' || q.kind === 'outDoor' || q.kind === 'branch' || q.kind === 'exit') q.x += 20; }); w.layout!.widthM += 20; });
    const busy = (r: typeof near) => r.shifts.reduce((a, s) => a + s.busyMin, 0);
    expect(far.travel.km).toBeGreaterThan(near.travel.km);
    expect(far.travel.hours).toBeGreaterThan(near.travel.hours + 5);
    expect(busy(far)).toBeGreaterThan(busy(near));
    expect(far.totals.unfinished).toBe(0);
  });

  it('el sorting manual camina hasta los canastos; con sorter los lleva la cinta', () => {
    const sep = (w: Warehouse) => { w.layout!.zones.find(q => q.kind === 'sort')!.y += 2; };
    const manual = run(sep), base = run(() => undefined);
    const sorter = run(w => { sep(w); w.sorting.type = 'sorter'; w.capacity.stations.sort = 2; w.shifts.forEach(s => (s.staff.sort = Math.min(s.staff.sort, 2))); });
    const sorterBase = run(w => { w.sorting.type = 'sorter'; w.capacity.stations.sort = 2; w.shifts.forEach(s => (s.staff.sort = Math.min(s.staff.sort, 2))); });
    const sortBusy = (r: typeof base) => r.processes.find(p => p.key === 'sort')!.busyMin;
    expect(sortBusy(manual)).toBeGreaterThan(sortBusy(base) * 1.1);
    // con sorter solo camina lo que se clasifica a mano (no mecanizables y bocas compartidas)
    expect(sortBusy(sorter)).toBeLessThan(sortBusy(sorterBase) * 1.1);
  });

  it('el cambio de puesto suma la caminata entre zonas', () => {
    const r = run(w => { w.layout!.zones.find(q => q.kind === 'hospital')!.y += 10; w.layout!.heightM += 10; });
    const s = r.shifts.reduce((a, x) => ({ n: a.n + x.changes, m: a.m + x.changeMin }), { n: 0, m: 0 });
    expect(s.n).toBeGreaterThan(0);
    expect(s.m / s.n).toBeGreaterThan(2); // 2 min fijos más caminar
  });
});

describe('archivo de proyecto con layout', () => {
  it('un proyecto anterior a la iteración 4 se abre sin layout', () => {
    const p = JSON.parse(serialize(newProject(jamaicaWarehouse())));
    delete p.warehouse.layout; p.scenarios.forEach((s: { warehouse: Partial<Warehouse> }) => delete s.warehouse.layout);
    const q = parseProject(JSON.stringify(p));
    expect(q.warehouse.layout).toBeNull();
    expect(q.scenarios.every(s => s.warehouse.layout === null)).toBe(true);
  });

  it('el plano de fondo se valida al abrir', () => {
    const p = newProject(jamaicaWarehouse());
    p.plan = { kind: 'dxf', name: 'p.dxf', data: 'M0 0 L10 0 L10 5', w: 10, h: 5, scale: 1 };
    expect(parseProject(serialize(p)).plan).toEqual(p.plan);
    p.plan = { ...p.plan, data: 'M0 0"/><script>x</script>' };
    expect(parseProject(serialize(p)).plan).toBeNull();
    p.plan = { kind: 'image', name: 'x', data: 'javascript:alert(1)', w: 1, h: 1, scale: 1 };
    expect(parseProject(serialize(p)).plan).toBeNull();
  });
});

describe('DXF', () => {
  const dxf = (...lines: (string | number)[]) => lines.join('\n');
  it('lee unidades, líneas, polilíneas, círculos y bloques', () => {
    const r = parseDxf(dxf(
      0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
      0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 2, 'COL', 10, 0, 20, 0, 0, 'LINE', 10, 0, 20, 0, 11, 100, 21, 0, 0, 'ENDBLK', 0, 'ENDSEC',
      0, 'SECTION', 2, 'ENTITIES',
      0, 'LWPOLYLINE', 90, 4, 70, 1, 10, 0, 20, 0, 10, 40000, 20, 0, 10, 40000, 20, 20000, 10, 0, 20, 20000,
      0, 'LINE', 10, 0, 20, 10000, 11, 40000, 21, 10000,
      0, 'CIRCLE', 10, 5000, 20, 5000, 40, 300,
      0, 'INSERT', 2, 'COL', 10, 20000, 20, 15000, 41, 2, 42, 2, 50, 90,
      0, 'TEXT', 10, 1, 20, 1, 1, 'ignorado',
      0, 'ENDSEC', 0, 'EOF'));
    expect(r.unitsM).toBe(0.001);
    expect(r.w).toBe(40000);
    expect(r.h).toBe(20000);
    expect(r.d.split('M')).toHaveLength(5); // polilínea, línea, círculo, bloque
    expect(r.d).toMatch(/^[MLZ0-9.\s-]*$/);
    // la polilínea cerrada vuelve al primer punto; el eje y queda hacia abajo
    expect(r.d.startsWith('M0 20000 L40000 20000 L40000 0 L0 0 L0 20000')).toBe(true);
    expect(r.truncated).toBe(false);
  });
  it('sin $INSUNITS no supone unidades y un archivo sin trazos queda vacío', () => {
    expect(parseDxf(dxf(0, 'SECTION', 2, 'ENTITIES', 0, 'LINE', 10, 0, 20, 0, 11, 5, 21, 5, 0, 'ENDSEC', 0, 'EOF')).unitsM).toBeNull();
    expect(parseDxf('hola').d).toBe('');
  });
});
