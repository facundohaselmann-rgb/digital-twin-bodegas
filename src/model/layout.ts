/* Disposición de la bodega en metros y distancias entre zonas. */
import type { Layout, PlanBackground, ProcessKey, Project, Travel, Warehouse, Zone, ZoneKind } from './types';

/** Valores de catálogo (estándar de la industria, editables). */
export const DEFAULT_TRAVEL: Travel = {
  speeds: { walk: 1.2, cart: 1.0, jack: 0.8 },
  handleSec: 30,
  modes: { unload: 'cart', feed: 'cart', baskets: 'cart', containers: 'cart', load: 'cart', hospital: 'walk' },
};

const r1 = (x: number): number => Math.round(x * 10) / 10;
const zone = (kind: ZoneKind, ref: string, x: number, y: number, w: number, h: number): Zone => ({ kind, ref, x: r1(x), y: r1(y), w: r1(w), h: r1(h) });

/** Disposición por defecto (50 × 30 m): la del plano esquemático de la presentación de Jamaica, más una franja de retornos abajo. */
export function autoLayout(w: Warehouse): Layout {
  const so = w.groups.filter(g => g.dest !== 'branch'), br = w.groups.filter(g => g.dest === 'branch');
  const zones: Zone[] = [
    // las zonas que se pasan la carga de mano en mano se tocan (sin viaje); las separadas suman traslado
    zone('inbound', '', 0.5, 6, 5.3, 6.1),
    zone('decon', '', 0.5, 12.1, 5.3, 4.6),
    zone('sort', '', 5.8, 11.4, 25.7, 3.1),
    zone('hospital', '', 0.5, 17.5, 5.3, 4.6),
    zone('reverify', '', 31.5, 1.4, 3.8, 10),
  ];
  // zonas de canastos repartidas a lo ancho de la línea de sorting
  const row = (list: typeof so, y0: number, y1: number, maxW: number): void => {
    const n = list.length, zw = n ? Math.min(maxW, (25 - 0.4 * (n - 1)) / n) : 0;
    list.forEach((g, k) => zones.push(zone('group', g.id, 6.5 + k * (zw + 0.4), y0, zw, y1 - y0)));
  };
  row(so, 1, 11.4, 8.5);
  row(br, 14.5, 24.5, 14);
  const laneH = so.length ? (9.3 - 0.2 * (so.length - 1)) / so.length : 0;
  so.forEach((g, k) => {
    const y = 1.8 + k * (laneH + 0.2);
    zones.push(zone('stage', g.id, 35.3, y, 14.2, laneH), zone('outDoor', g.id, 49.5, y + 0.15, 0.5, Math.max(0.3, laneH - 0.3)));
  });
  if (br.length) zones.push(zone('branch', '', 31.5, 14.5, 18, 10), zone('exit', '', 49.5, 18.5, 0.5, 3), zone('shelf', '', 31.5, 24.5, 9, 5));
  // retornos al lado de la estantería (los vencidos pasan sin viaje) y su puerta RT-2 en la pared
  zones.push(br.length ? zone('returns', '', 40.5, 24.5, 9, 5) : zone('returns', '', 31.5, 24.5, 18, 5), zone('rt2Door', '', 49.5, 25.5, 0.5, 3));
  return { widthM: 50, heightM: 30, zones };
}

/** Crea la disposición si la bodega no tiene (proyectos anteriores a la iteración 4).
    Con disposición, el cambio de puesto es 2 min + caminata: el valor viejo de 5 min pasa a 2. */
export function ensureLayout(w: Warehouse): Layout {
  if (!w.layout) { w.layout = autoLayout(w); if (w.multiskill.changeMin === 5) w.multiskill.changeMin = 2; }
  return w.layout;
}

/** Ajusta el tamaño de la bodega al plano en todos los escenarios; `f` escala las zonas (al corregir la escala). */
export function fitPlan(p: Project, bg: PlanBackground, f = 1): void {
  p.scenarios.forEach(s => {
    const L = ensureLayout(s.warehouse);
    L.widthM = bg.w * bg.scale;
    L.heightM = bg.h * bg.scale;
    if (f !== 1) L.zones.forEach(z => { z.x *= f; z.y *= f; z.w *= f; z.h *= f; });
  });
}

export const zoneKey = (z: { kind: ZoneKind; ref: string }): string => z.kind + ':' + z.ref;

/** Deja una zona por cada elemento de la configuración: conserva las dibujadas, agrega las que faltan y quita las que sobran. */
export function syncLayout(w: Warehouse): void {
  if (!w.layout) return;
  const have = new Map(w.layout.zones.map(z => [zoneKey(z), z]));
  w.layout.zones = autoLayout(w).zones.map(a => have.get(zoneKey(a)) ?? a);
  // una zona nueva puede caer fuera de una bodega dibujada más chica (p. ej. retornos en un layout de 50 × 25)
  w.layout.widthM = Math.max(w.layout.widthM, ...w.layout.zones.map(z => z.x + z.w));
  w.layout.heightM = Math.max(w.layout.heightM, ...w.layout.zones.map(z => z.y + z.h));
}

/** Distancia en ángulo recto entre los bordes más cercanos de dos zonas (0 si se tocan o se superponen).
    El recorrido dentro de cada zona ya está incluido en los tiempos estándar. */
export function zoneGap(a: Zone | null | undefined, b: Zone | null | undefined): number {
  if (!a || !b) return 0;
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return dx + dy;
}

export interface Distances {
  unloadDecon: number; looseSort: number; deconSort: number; hospital: number; routeExit: number;
  /** Por grupo: sorting → zona de canastos. */
  sortGroup: number[];
  /** Por grupo: canastos → reverificación, o directo a Stage out / sorting de rutas. */
  first: number[];
  /** Por grupo con reverificación: reverificación → Stage out / sorting de rutas. */
  second: number[];
  /** Por grupo de Stage out: carril → puerta de su camión. */
  stageDock: number[];
  /** Retornos: Branch → estantería (atención de clientes), estantería → retornos (vencidos), hospital → retornos, retornos → puerta RT-2. */
  shelfWalk: number; expired: number; hospRet: number; rt2: number;
  /** Por grupo de Stage out: puerta de su camión → retornos (devoluciones de sucursales). */
  branchRet: number[];
  /** Entre procesos, para el cambio de puesto. */
  change: Record<ProcessKey, Record<ProcessKey, number>>;
}

/** Distancias en metros; todas 0 si la bodega no tiene layout. */
export function distances(w: Warehouse): Distances {
  const zones = w.layout?.zones ?? [];
  const find = (kind: ZoneKind, ref = ''): Zone | undefined => zones.find(z => z.kind === kind && z.ref === ref);
  const stages = zones.filter(z => z.kind === 'stage');
  // la carga se mueve entre todos los carriles: se toma el rectángulo que los contiene
  const loadZone: Zone | undefined = stages.length ? (() => {
    const x = Math.min(...stages.map(z => z.x)), y = Math.min(...stages.map(z => z.y));
    return { kind: 'stage', ref: '', x, y, w: Math.max(...stages.map(z => z.x + z.w)) - x, h: Math.max(...stages.map(z => z.y + z.h)) - y };
  })() : undefined;
  const P: Record<ProcessKey, Zone | undefined> = { unload: find('inbound'), decon: find('decon'), sort: find('sort'), hospital: find('hospital'), reverify: find('reverify'), branch: find('branch'), load: loadZone, returns: find('returns') };
  const keys = Object.keys(P) as ProcessKey[];
  const change = Object.fromEntries(keys.map(a => [a, Object.fromEntries(keys.map(b => [b, zoneGap(P[a], P[b])]))])) as Distances['change'];
  const next = (g: Warehouse['groups'][number]): Zone | undefined => (g.dest === 'branch' ? P.branch : find('stage', g.id));
  return {
    unloadDecon: zoneGap(P.unload, P.decon), looseSort: zoneGap(P.unload, P.sort), deconSort: zoneGap(P.decon, P.sort),
    hospital: zoneGap(P.sort, P.hospital), routeExit: zoneGap(P.branch, find('exit')),
    sortGroup: w.groups.map(g => zoneGap(P.sort, find('group', g.id))),
    first: w.groups.map(g => zoneGap(find('group', g.id), g.reverify ? P.reverify : next(g))),
    second: w.groups.map(g => (g.reverify ? zoneGap(P.reverify, next(g)) : 0)),
    stageDock: w.groups.map(g => zoneGap(find('stage', g.id), find('outDoor', g.id))),
    shelfWalk: zoneGap(P.branch, find('shelf')), expired: zoneGap(find('shelf'), P.returns), hospRet: zoneGap(P.hospital, P.returns), rt2: zoneGap(P.returns, find('rt2Door')),
    branchRet: w.groups.map(g => zoneGap(find('outDoor', g.id), P.returns)),
    change,
  };
}
