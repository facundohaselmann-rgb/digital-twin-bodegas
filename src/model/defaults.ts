import { PROCESSES, type Days, type ProcessKey, type Project, type SortingGroup, type Warehouse, type Shift, type InboundTruck, type Tri, type TimeKey, type Sorter, type FixedCost, type Discrepancies, type Scenario, type SortingType } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const MON_SAT: Days = [true, true, true, true, true, true, false];

export const DEFAULT_TIMES: Record<TimeKey, Tri> = {
  unloadBox: { min: 0.3, mode: 0.5, max: 0.8 },     // min por caja
  unloadUld: { min: 2, mode: 3, max: 5 },           // min por ULD (transpaleta)
  unloadLoose: { min: 3, mode: 4, max: 7 },         // s por paquete suelto
  openBox: { min: 1, mode: 1.5, max: 2.5 },         // min por caja
  emptyUld: { min: 6, mode: 8, max: 12 },           // min por ULD
  sort: { min: 4.5, mode: 6, max: 9 },              // s por paquete, manual con PDA (~550 paq/h)
  sortPtl: { min: 3.5, mode: 4.5, max: 6 },         // s por paquete, Pick to Light (~770 paq/h)
  induct: { min: 2.5, mode: 3, max: 3.6 },          // s por paquete, inducción al sorter (~1.200 paq/h)
  swap: { min: 0.3, mode: 0.5, max: 1 },            // min por canasto lleno
  relabel: { min: 2, mode: 3, max: 5 },             // min por paquete en hospital
  reverify: { min: 4, mode: 5, max: 7 },            // s por paquete
  missortFix: { min: 0.3, mode: 0.5, max: 1 },      // min por paquete mal clasificado (se corrige en el momento)
  container: { min: 1.5, mode: 2, max: 3 },         // min por contenedor
  branchSort: { min: 5, mode: 6, max: 9 },          // s por paquete
  search: { min: 5, mode: 10, max: 20 },            // min por paquete faltante de cartero
  load: { min: 1, mode: 1.5, max: 2.5 },            // min por unidad
  handover: { min: 2, mode: 3, max: 5 },            // min por ruta
};

/** Costos fijos de catálogo (USD por mes, supuestos editables). Los de sorter y PTL cuentan solo si la bodega los usa. */
export function defaultFixedCosts(): FixedCost[] {
  const c = (category: FixedCost['category'], name: string, usdMonth: number, sorting: FixedCost['sorting'] = ''): FixedCost => ({ id: uid('c'), category, name, usdMonth, sorting });
  return [
    c('rent', 'Alquiler del depósito', 8000),
    c('utilities', 'Energía, agua e internet', 1500),
    c('security', 'Seguridad y vigilancia', 2500),
    c('cleaning', 'Limpieza y mantenimiento edilicio', 800),
    c('equipment', 'PDAs (10 × 25 USD)', 250),
    c('equipment', 'Transpaletas y carros', 200),
    c('equipment', 'Pick to Light (leasing + mantenimiento)', 1200, 'ptl'),
    c('equipment', 'Sorter automático (leasing + mantenimiento)', 6000, 'sorter'),
    c('it', 'Sistemas y licencias (WMS, Tracking)', 500),
    c('insurance', 'Seguros', 400),
    c('overhead', 'Supervisión y administración', 3000),
  ];
}
export const DEFAULT_DISCREPANCIES: Discrepancies = { customsPct: 0.3, missortPct: { manual: 1, ptl: 0.3, sorter: 0.1 }, postmanPct: 0.5, postmanFoundPct: 50 };

/** Valores de catálogo (supuestos editables). */
export const DEFAULT_SORTER: Sorter = { inductionPoints: 2, machinePerHour: 3000, chutes: 24, maxKg: 30, maxLengthCm: 80, maxWidthCm: 60, maxHeightCm: 60, noReadPct: 2 };

function staff(o: Partial<Record<ProcessKey, number>>): Record<ProcessKey, number> {
  return { unload: 0, decon: 0, sort: 0, hospital: 0, reverify: 0, branch: 0, load: 0, ...o };
}

function group(name: string, share: number, reverify: boolean, dest: 'stageout' | 'branch', truck: string | null,
  services: [string, boolean][], confirmed = true): SortingGroup {
  return {
    id: uid('g'), name, confirmed, sharePct: share, reverify, dest,
    services: services.map(([n, ok]) => ({ id: uid('s'), name: n, confirmed: ok, weight: 1 })),
    outbound: truck ? [{ id: uid('o'), days: [...MON_SAT] as Days, arrival: truck }] : [],
    profile: null,
  };
}

/** Plantilla basada en la bodega de Jamaica (presentación original). Los valores
    de volumen, tiempos, dotación y costos son supuestos estándar editables. */
export function jamaicaWarehouse(): Warehouse {
  const inbound: InboundTruck[] = [
    { id: uid('i'), name: 'Aduana AM', days: [...MON_SAT] as Days, arrival: '07:30', packages: 2000,
      mix: { boxes: 70, uld: 20, loose: 10 }, pkgsPerBox: 60, pkgsPerUld: 150, volumeVarPct: 10, timeVarMin: 30 },
    { id: uid('i'), name: 'Aduana PM', days: [...MON_SAT] as Days, arrival: '15:00', packages: 1500,
      mix: { boxes: 50, uld: 30, loose: 20 }, pkgsPerBox: 60, pkgsPerUld: 150, volumeVarPct: 15, timeVarMin: 45 },
  ];
  const shifts: Shift[] = [
    { id: uid('t'), name: 'Turno día', days: [...MON_SAT] as Days, start: '06:00', end: '14:00',
      breaks: [{ start: '10:00', minutes: 30 }], productivityPct: 100, costPerHour: 5, night: false, overtimeHours: 0,
      staff: staff({ unload: 1, decon: 2, sort: 3, reverify: 1, branch: 1, load: 1 }) },
    { id: uid('t'), name: 'Turno noche', days: [...MON_SAT] as Days, start: '14:00', end: '22:00',
      breaks: [{ start: '18:00', minutes: 30 }], productivityPct: 95, costPerHour: 5.5, night: true, overtimeHours: 2,
      staff: staff({ unload: 1, decon: 1, sort: 2, reverify: 1, branch: 1, load: 1 }) },
  ];
  return {
    id: uid('w'),
    name: 'Bodega Jamaica',
    country: 'Jamaica',
    notes: '',
    seed: 1,
    packageProfile: { weightKg: 2, lengthCm: 30, widthCm: 22, heightCm: 12, variationPct: 25 },
    inbound,
    groups: [
      group('Others', 12, true, 'stageout', '14:30', [['Tara', false]]),
      group('Montego Bay Branch', 18, true, 'stageout', '13:00', [['Montego Bay', true], ['Hanover', true], ['Westmoreland', false]]),
      group('Ocho Rios Branch', 15, true, 'stageout', '13:30', [['Ocho Rios', true], ['Trelawny', false], ['St. Mary', true]]),
      group('Mandeville Branch', 15, true, 'stageout', '14:00', [['Mandeville', true], ['Manchester', false], ['St. Elizabeth', true]]),
      group('Kingston Branch', 40, false, 'branch', null, [['Kingston', true], ['Portmore', true], ['Spanish Town', true]]),
    ],
    routes: { count: 10, windows: [
      { id: uid('v'), name: 'Mañana', days: [...MON_SAT] as Days, first: '08:00', everyMin: 10 },
      { id: uid('v'), name: 'Tarde', days: [...MON_SAT] as Days, first: '14:00', everyMin: 10 },
    ] },
    times: structuredClone(DEFAULT_TIMES),
    capacity: {
      basketPkgs: 60, basketLiters: 500, containerPkgs: 150, containerLiters: 1500,
      stageOutSlots: 6, truckM3: 18, truckKg: 3500,
      stations: { sort: 4, reverify: 2, branch: 2 },
    },
    shifts,
    outboundLoadWindowMin: 30,
    volumePct: 100,
    costs: { overtimeMultiplier: 1.5, relabelUsd: 0.05, fixed: defaultFixedCosts() },
    sorting: { type: 'manual', sorter: structuredClone(DEFAULT_SORTER) },
    hospital: { exceptionPct: 1.5, relabelPct: 75 },
    multiskill: { bufferMin: 10, changeMin: 5, priority: [...PROCESSES] },
    cptLeadMin: 240,
    discrepancies: structuredClone(DEFAULT_DISCREPANCIES),
    replicas: 20,
  };
}

/** Bodega mínima para empezar desde cero. */
export function blankWarehouse(): Warehouse {
  const w = jamaicaWarehouse();
  w.name = 'Nueva bodega';
  w.country = '';
  w.inbound = [w.inbound[0]];
  w.inbound[0].name = 'Camión 1';
  w.inbound[0].packages = 1000;
  w.outboundLoadWindowMin = 60;
  w.groups = [group('Grupo 1', 100, false, 'stageout', '16:00', [['Servicio 1', true]])];
  return w;
}

/** Bodega modelo genérica: todas las funciones activas y sorting con Pick to Light. Valores supuestos editables. */
export function modelWarehouse(): Warehouse {
  const w = jamaicaWarehouse();
  const truck = (name: string, arrival: string, packages: number, boxes: number, uld: number, loose: number): InboundTruck =>
    ({ id: uid('i'), name, days: [...MON_SAT] as Days, arrival, packages, mix: { boxes, uld, loose }, pkgsPerBox: 50, pkgsPerUld: 160, volumeVarPct: 10, timeVarMin: 30 });
  const two = (g: SortingGroup, second: string): SortingGroup => { g.outbound.push({ id: uid('o'), days: [...MON_SAT] as Days, arrival: second }); return g; };
  return {
    ...w,
    id: uid('w'), name: 'Bodega Modelo', country: '', notes: 'Plantilla genérica con Pick to Light, hospital, discrepancias, multiskill y costos.',
    packageProfile: { weightKg: 1.8, lengthCm: 28, widthCm: 20, heightCm: 12, variationPct: 25 },
    inbound: [truck('Camión 1', '06:30', 1800, 60, 30, 10), truck('Camión 2', '11:00', 1700, 70, 20, 10), truck('Camión 3', '16:00', 1500, 50, 30, 20)],
    groups: [
      two(group('Norte', 15, true, 'stageout', '13:00', [['Norte 1', true], ['Norte 2', true]]), '21:30'),
      two(group('Sur', 15, true, 'stageout', '13:30', [['Sur 1', true], ['Sur 2', true]]), '22:00'),
      group('Este', 12, true, 'stageout', '14:00', [['Este 1', true], ['Este 2', true]]),
      group('Oeste', 12, true, 'stageout', '14:30', [['Oeste 1', true], ['Oeste 2', true]]),
      group('Centro', 10, true, 'stageout', '15:00', [['Centro', true]]),
      group('Corporativo', 6, false, 'stageout', '16:00', [['Corporativo', true]]),
      group('Ciudad', 30, false, 'branch', null, [['Zona A', true], ['Zona B', true], ['Zona C', true], ['Zona D', true]]),
    ],
    routes: { count: 12, windows: [
      { id: uid('v'), name: 'Mañana', days: [...MON_SAT] as Days, first: '08:00', everyMin: 8 },
      { id: uid('v'), name: 'Tarde', days: [...MON_SAT] as Days, first: '14:00', everyMin: 8 },
    ] },
    capacity: { ...w.capacity, truckM3: 24, truckKg: 5000, stations: { sort: 6, reverify: 3, branch: 3 } },
    shifts: [
      { ...w.shifts[0], id: uid('t'), staff: staff({ unload: 2, decon: 2, sort: 4, hospital: 1, reverify: 2, branch: 2, load: 2 }) },
      { ...w.shifts[1], id: uid('t'), staff: staff({ unload: 2, decon: 1, sort: 3, reverify: 2, branch: 2, load: 2 }) },
    ],
    sorting: { type: 'ptl', sorter: structuredClone(DEFAULT_SORTER) },
  };
}

/** Siempre 3 escenarios: base, +20 % de volumen y otro tipo de sorting. */
export function defaultScenarios(w: Warehouse): Scenario[] {
  const alt: Record<SortingType, [SortingType, string]> = { manual: ['ptl', 'Pick to Light'], ptl: ['sorter', 'Sorter automático'], sorter: ['manual', 'Manual con PDA'] };
  const vol = structuredClone(w); vol.volumePct = Math.round(w.volumePct * 1.2);
  const srt = structuredClone(w); srt.sorting.type = alt[w.sorting.type][0];
  return [
    { id: uid('e'), name: 'Base', warehouse: w },
    { id: uid('e'), name: '+20 % volumen', warehouse: vol },
    { id: uid('e'), name: alt[w.sorting.type][1], warehouse: srt },
  ];
}

export function newProject(w: Warehouse = jamaicaWarehouse()): Project {
  const now = new Date().toISOString();
  const scenarios = defaultScenarios(w);
  return { format: 'dtwin', version: 2, name: w.name, createdAt: now, updatedAt: now, warehouse: w, scenarios, activeScenario: scenarios[0].id };
}
