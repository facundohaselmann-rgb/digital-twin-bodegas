import { PROCESSES, type Days, type ProcessKey, type Project, type SortingGroup, type Warehouse, type Shift, type InboundTruck, type Tri, type TimeKey, type Sorter } from './types';

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
  container: { min: 1.5, mode: 2, max: 3 },         // min por contenedor
  branchSort: { min: 5, mode: 6, max: 9 },          // s por paquete
  load: { min: 1, mode: 1.5, max: 2.5 },            // min por unidad
  handover: { min: 2, mode: 3, max: 5 },            // min por ruta
};

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
    costs: { overtimeMultiplier: 1.5 },
    sorting: { type: 'manual', sorter: structuredClone(DEFAULT_SORTER) },
    hospital: { exceptionPct: 1.5, relabelPct: 75 },
    multiskill: { changeMin: 5, priority: [...PROCESSES] },
    cptLeadMin: 240,
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

export function newProject(w: Warehouse = jamaicaWarehouse()): Project {
  const now = new Date().toISOString();
  return { format: 'dtwin', version: 2, name: w.name, createdAt: now, updatedAt: now, warehouse: w, scenarios: [] };
}
