/* =====================================================================
   Modelo de datos v2 del Digital Twin de bodegas cross-dock.
   Todo lo que define una bodega vive en `Warehouse`; un proyecto
   (archivo .dtwin) contiene una bodega y, más adelante, sus escenarios.
   ===================================================================== */

/** Días de la semana, de lunes (0) a domingo (6). */
export type Days = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

/** Distribución triangular: mínimo, típico, máximo. */
export interface Tri { min: number; mode: number; max: number }

/** Perfil medio de paquete. */
export interface PackageProfile {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Variación ± en % aplicada a peso y medidas de cada paquete. */
  variationPct: number;
}

/** Composición de la carga de un camión de entrada, en % de paquetes. */
export interface LoadMix { boxes: number; uld: number; loose: number }

/** Camión de entrada recurrente (programa semanal). */
export interface InboundTruck {
  id: string;
  name: string;
  days: Days;
  arrival: string;          // "HH:MM"
  packages: number;         // paquetes por camión
  mix: LoadMix;             // % cajas / ULD / sueltos
  pkgsPerBox: number;
  pkgsPerUld: number;
  volumeVarPct: number;     // variación ± del volumen
  timeVarMin: number;       // variación ± de la hora de llegada
}

/** Camión de salida recurrente de un grupo de sorting. */
export interface OutboundTruck { id: string; days: Days; arrival: string }

export interface Service { id: string; name: string; confirmed: boolean; weight: number }

export type Destination = 'stageout' | 'branch';

/** Grupo de sorting (provider): una sucursal destino con sus canastos (servicios). */
export interface SortingGroup {
  id: string;
  name: string;
  confirmed: boolean;
  sharePct: number;
  reverify: boolean;
  dest: Destination;
  services: Service[];
  outbound: OutboundTruck[];
  /** Perfil propio de paquete; null = usa el de la bodega. */
  profile: PackageProfile | null;
}

export const PROCESSES = ['unload', 'decon', 'sort', 'hospital', 'reverify', 'branch', 'load'] as const;
export type ProcessKey = typeof PROCESSES[number];

export interface ShiftBreak { start: string; minutes: number }

export interface Shift {
  id: string;
  name: string;
  days: Days;               // días en que EMPIEZA el turno
  start: string;
  end: string;              // si end <= start, termina al día siguiente
  breaks: ShiftBreak[];
  productivityPct: number;
  costPerHour: number;      // USD
  /** Turno noche: único que admite horas extra. */
  night: boolean;
  /** Horas extra disponibles al cierre (solo turno noche). 0 = el trabajo queda pendiente. */
  overtimeHours: number;
  staff: Record<ProcessKey, number>;
}

export const TIME_KEYS = [
  'unloadBox', 'unloadUld', 'unloadLoose', 'openBox', 'emptyUld',
  'sort', 'sortPtl', 'induct', 'swap', 'relabel', 'reverify', 'missortFix', 'container', 'branchSort', 'search', 'load', 'handover',
] as const;
export type TimeKey = typeof TIME_KEYS[number];

export interface Capacity {
  basketPkgs: number;
  basketLiters: number;
  containerPkgs: number;
  containerLiters: number;
  stageOutSlots: number;
  truckM3: number;
  truckKg: number;
  stations: { sort: number; reverify: number; branch: number };
}

/** Ventana de retiro: todos los carteros pasan uno tras otro desde `first`. */
export interface PickupWindow { id: string; name: string; days: Days; first: string; everyMin: number }

export interface Routes {
  count: number;
  windows: PickupWindow[];
}

export type SortingType = 'manual' | 'ptl' | 'sorter';

export interface Sorter {
  inductionPoints: number;
  machinePerHour: number;
  chutes: number;
  maxKg: number;
  maxLengthCm: number;
  maxWidthCm: number;
  maxHeightCm: number;
  noReadPct: number;
}

/** Categorías estándar de costos fijos de una bodega. */
export const COST_CATEGORIES = ['rent', 'utilities', 'security', 'cleaning', 'equipment', 'it', 'insurance', 'overhead'] as const;
export type CostCategory = typeof COST_CATEGORIES[number];

/** Costo fijo mensual. `sorting` = solo cuenta si la bodega usa ese tipo de sorting ('' = siempre). */
export interface FixedCost { id: string; category: CostCategory; name: string; usdMonth: number; sorting: SortingType | '' }

export interface Costs {
  overtimeMultiplier: number;
  /** USD por etiqueta de reetiquetado en hospital. */
  relabelUsd: number;
  fixed: FixedCost[];
}

export interface Discrepancies {
  /** % de paquetes con WI-2 que no aparecen en el Scan 1 (se reportan solos; no cuentan para volumen ni CPT). */
  customsPct: number;
  /** % de errores de sorting por tipo; se detectan en la reverificación (AV-1) o en el sorting de rutas (LM-1). */
  missortPct: Record<SortingType, number>;
  /** % de lo que llega a LM-1 que falta; se busca y aparece `postmanFoundPct` % de las veces (el resto es siniestro). */
  postmanPct: number;
  postmanFoundPct: number;
}

export interface Warehouse {
  id: string;
  name: string;
  country: string;
  notes: string;
  seed: number;
  packageProfile: PackageProfile;
  inbound: InboundTruck[];
  groups: SortingGroup[];
  routes: Routes;
  times: Record<TimeKey, Tri>;
  capacity: Capacity;
  shifts: Shift[];
  outboundLoadWindowMin: number;
  /** Multiplicador de volumen de llegadas (100 = programa tal cual). */
  volumePct: number;
  costs: Costs;
  /** Sorting de entrada (WI-3); el de rutas y la reverificación son siempre manuales con PDA. */
  sorting: { type: SortingType; sorter: Sorter };
  /** % de paquetes con excepción en el Scan 1 y % de esos que se reetiquetan (el resto se destruye). */
  hospital: { exceptionPct: number; relabelPct: number };
  /** Espera sin trabajo antes de ir a ayudar a otro proceso, minutos para cambiar de puesto y orden de ayuda (la carga va primero si hay camión). */
  multiskill: { bufferMin: number; changeMin: number; priority: ProcessKey[] };
  /** Tiempo esperado de procesamiento: el CPT de un paquete es el primero que queda al menos esto después de su WI-2. */
  cptLeadMin: number;
  discrepancies: Discrepancies;
  /** Corridas con distintas semillas para dar cada KPI con su margen de error. */
  replicas: number;
}

export interface Scenario { id: string; name: string; warehouse: Warehouse }

export interface Project {
  format: 'dtwin';
  version: 2;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Bodega que se está editando: es la del escenario activo. */
  warehouse: Warehouse;
  scenarios: Scenario[];
  activeScenario: string;
}

/** Advertencia de validación: clave i18n + parámetros. */
export interface Warning { key: string; params?: Record<string, string | number> }
