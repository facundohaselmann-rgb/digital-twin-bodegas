/* Textos de la interfaz en español e inglés. Cada clave: [es, en].
   Parámetros: {nombre} se reemplaza por params.nombre. */
export type Lang = 'es' | 'en';

const D: Record<string, [string, string]> = {
  /* general */
  'app.title': ['Digital Twin · Bodegas cross-dock', 'Digital Twin · Cross-dock warehouses'],
  'app.sub': ['Dimensionamiento y eficiencia · horizonte semanal', 'Sizing and efficiency · weekly horizon'],
  'tab.plan': ['Plano y simulación', 'Floor plan & simulation'],
  'tab.results': ['Resultados', 'Results'],
  'tab.config': ['Configuración', 'Configuration'],
  'file.new': ['Nuevo', 'New'],
  'file.newJamaica': ['Desde plantilla Jamaica', 'From Jamaica template'],
  'file.newBlank': ['Bodega en blanco', 'Blank warehouse'],
  'file.open': ['Abrir', 'Open'],
  'file.save': ['Guardar', 'Save'],
  'file.saveAs': ['Guardar como', 'Save as'],
  'file.unsaved': ['Cambios sin guardar', 'Unsaved changes'],
  'file.saved': ['Guardado', 'Saved'],
  'file.savedTo': ['Guardado en {name}', 'Saved to {name}'],
  'file.opened': ['Proyecto abierto: {name}', 'Project opened: {name}'],
  'file.invalid': ['El archivo no es un proyecto válido', 'The file is not a valid project'],
  'file.confirmNew': ['¿Crear un proyecto nuevo? Los cambios sin guardar se pierden.', 'Create a new project? Unsaved changes will be lost.'],
  'file.downloaded': ['Descargado: {name} (tu navegador no permite guardar directo en una carpeta)', 'Downloaded: {name} (your browser cannot save directly to a folder)'],
  'run.info': ['{pkgs} paquetes · simulado en {ms} ms · semilla {seed}', '{pkgs} packages · simulated in {ms} ms · seed {seed}'],
  'run.running': ['Simulando…', 'Simulating…'],
  'run.error': ['La simulación falló ({msg}). Revisá la configuración.', 'The simulation failed ({msg}). Check the configuration.'],
  'lang': ['Idioma', 'Language'],
  'yes': ['Sí', 'Yes'], 'no': ['No', 'No'],
  'add': ['Agregar', 'Add'], 'remove': ['Quitar', 'Remove'],
  'total': ['Total', 'Total'],
  'none': ['—', '—'],

  /* días */
  'd0': ['Lun', 'Mon'], 'd1': ['Mar', 'Tue'], 'd2': ['Mié', 'Wed'], 'd3': ['Jue', 'Thu'], 'd4': ['Vie', 'Fri'], 'd5': ['Sáb', 'Sat'], 'd6': ['Dom', 'Sun'],
  'dl0': ['L', 'M'], 'dl1': ['M', 'T'], 'dl2': ['X', 'W'], 'dl3': ['J', 'T'], 'dl4': ['V', 'F'], 'dl5': ['S', 'S'], 'dl6': ['D', 'S'],
  'nextWeek': ['sem. sig.', 'next wk'],

  /* procesos */
  'p.unload': ['Descarga', 'Unloading'],
  'p.decon': ['Desconsolidación', 'Deconsolidation'],
  'p.sort': ['Sorting (Scan 1)', 'Sorting (Scan 1)'],
  'p.reverify': ['Reverificación (Scan 2)', 'Re-verification (Scan 2)'],
  'p.branch': ['Sorting en rutas', 'Route sorting'],
  'p.load': ['Carga de camiones', 'Truck loading'],

  /* advertencias */
  'w.mixSum': ['El camión "{truck}" tiene una mezcla que suma {sum}%; se normaliza a 100%.', 'Truck "{truck}" has a load mix adding up to {sum}%; normalized to 100%.'],
  'w.noInbound': ['No hay camiones de entrada programados.', 'No inbound trucks are scheduled.'],
  'w.noOutbound': ['El grupo "{group}" va a Stage out pero no tiene camión de salida: sus paquetes nunca salen.', 'Group "{group}" goes to Stage out but has no outbound truck: its packages never leave.'],
  'w.noGroups': ['No hay grupos de sorting.', 'There are no sorting groups.'],
  'w.noShare': ['Ningún grupo tiene % de volumen; se reparte en partes iguales.', 'No group has a volume %; split evenly.'],
  'w.shareSum': ['Los % de volumen de los grupos suman {sum}%; se normalizan a 100%.', 'Group volume shares add up to {sum}%; normalized to 100%.'],
  'w.noRouteDays': ['Hay grupos que van a Branch pero ningún día con retiro de carteros.', 'Some groups go to Branch but no day has postman pickups.'],
  'w.noShifts': ['No hay turnos definidos.', 'No shifts are defined.'],
  'w.staffGtStations': ['{shift}: {staff} personas en {process} pero solo {stations} estaciones; trabajan {stations} a la vez.', '{shift}: {staff} people in {process} but only {stations} stations; {stations} work at a time.'],
  'w.noStaff': ['Ningún turno tiene personal en {process}: ese trabajo nunca se hace.', 'No shift has staff in {process}: that work is never done.'],
  'w.unfinished': ['{n} paquetes no terminan dentro del horizonte (2 semanas). Revisá dotación, turnos y camiones de salida.', '{n} packages do not finish within the horizon (2 weeks). Check staffing, shifts and outbound trucks.'],

  /* plano */
  'plan.play': ['▶ Reproducir', '▶ Play'], 'plan.pause': ['❚❚ Pausa', '❚❚ Pause'],
  'plan.reset': ['Volver al inicio', 'Back to start'], 'plan.end': ['⇥ Final', '⇥ End'],
  'plan.speed': ['{n} min/s', '{n} min/s'],
  'plan.inbound': ['INBOUND', 'INBOUND'], 'plan.unloading': ['descarga', 'unloading'],
  'plan.trucksAtDoor': ['{n} camión(es) en andén', '{n} truck(s) at dock'],
  'plan.boxes': ['cajas', 'boxes'], 'plan.ulds': ['ULD', 'ULD'], 'plan.loose': ['sueltos', 'loose'],
  'plan.decon': ['DESCONSOLIDACIÓN', 'DECONSOLIDATION'], 'plan.opening': ['{n} abriendo', '{n} opening'],
  'plan.sortLine': ['LÍNEA DE SORTING ›››', 'SORTING LINE ›››'], 'plan.scan1': ['SCAN 1', 'SCAN 1'],
  'plan.queue': ['cola {n}', 'queue {n}'],
  'plan.scan2': ['SCAN 2', 'SCAN 2'], 'plan.reverif': ['reverific.', 're-verif.'],
  'plan.stageout': ['STAGE OUT', 'STAGE OUT'], 'plan.stageoutSub': ['unidades listas por grupo', 'ready units per group'],
  'plan.dock': ['DOCK · CAMIONES DE SALIDA', 'DOCK · OUTBOUND TRUCKS'],
  'plan.truckHere': ['cargando · {n} paq', 'loading · {n} pkg'], 'plan.truckWait': ['próximo {t}', 'next {t}'], 'plan.truckGone': ['salió {t}', 'left {t}'],
  'plan.load': ['CARGA', 'LOADING'],
  'plan.routeSort': ['SORTING', 'SORTING'], 'plan.routeSortSub': ['rutas (app)', 'routes (app)'],
  'plan.branch': ['BRANCH · RUTAS', 'BRANCH · ROUTES'], 'plan.branchSub': ['retiro por carteros', 'postman pickup'],
  'plan.exit': ['SALIDA CARTEROS ▶', 'POSTMEN EXIT ▶'],
  'plan.noStage': ['Sin grupos hacia Stage out', 'No groups to Stage out'], 'plan.noBranch': ['Sin grupos hacia Branch', 'No groups to Branch'],
  'plan.pkg': ['{n} paq', '{n} pkg'],
  'plan.legendRv': ['Con reverificación / operario ocupado', 'With re-verification / busy operator'],
  'plan.legendDir': ['Directo / operario libre', 'Direct / idle operator'],
  'plan.legendClosed': ['Canasto cerrado', 'Closed basket'],
  'plan.legendOff': ['Operario fuera de turno o en pausa', 'Operator off shift or on break'],
  'live.title': ['Avance de la semana', 'Week progress'],
  'live.trucks': ['Camiones de entrada recibidos', 'Inbound trucks received'],
  'live.unloaded': ['Unidades descargadas', 'Units unloaded'],
  'live.sorted': ['Paquetes clasificados', 'Packages sorted'],
  'live.rv': ['Paquetes reverificados', 'Packages re-verified'],
  'live.br': ['Paquetes en rutas', 'Packages in routes'],
  'live.rc0': ['Paquetes despachados (RC-0)', 'Packages dispatched (RC-0)'],
  'live.picked': ['Paquetes retirados por carteros', 'Packages picked up by postmen'],
  'live.workers': ['Personal ahora', 'Staff now'],
  'live.workersSub': ['ocupados / en turno', 'busy / on shift'],
  'phase.off': ['Fuera de turno', 'Off shift'], 'phase.work': ['En turno', 'On shift'], 'phase.ot': ['Horas extra', 'Overtime'],

  /* resultados */
  'res.export': ['⬇ Exportar CSV', '⬇ Export CSV'],
  'res.note': ['Semana simulada · semilla {seed} · {pkgs} paquetes · {kg} kg · {m3} m³', 'Simulated week · seed {seed} · {pkgs} packages · {kg} kg · {m3} m³'],
  'res.kpiPkgs': ['Paquetes de la semana', 'Packages this week'],
  'res.kpiPkgsSub': ['{boxes} cajas · {ulds} ULD · {loose} sueltos', '{boxes} boxes · {ulds} ULD · {loose} loose'],
  'res.kpiDispatched': ['Despachados en la semana', 'Dispatched this week'],
  'res.kpiCarried': ['{n} pasan a la semana siguiente', '{n} carry over to next week'],
  'res.kpiTime': ['Tiempo WI-2 → RC-0', 'Time WI-2 → RC-0'],
  'res.mean': ['Media', 'Mean'],
  'res.kpiHours': ['Horas-persona ocupadas', 'Busy person-hours'],
  'res.kpiHoursSub': ['de {paid} h pagadas ({util})', 'of {paid} paid hours ({util})'],
  'res.kpiOT': ['Horas extra (turno noche)', 'Overtime (night shift)'],
  'res.kpiScans': ['Escaneos por paquete', 'Scans per package'],
  'res.kpiPending': ['Costo y CPT: llegan en la iteración 2–3', 'Cost and CPT: coming in iterations 2–3'],
  'res.days': ['Resumen por día', 'Daily summary'],
  'res.daysSub': ['Paquetes que llegan, se despachan y terminan cada día', 'Packages arriving, dispatched and finished each day'],
  'res.day': ['Día', 'Day'], 'res.arrived': ['Llegan', 'Arrive'], 'res.rc0': ['RC-0', 'RC-0'], 'res.finished': ['Terminan', 'Finish'],
  'res.paidH': ['Horas pagadas', 'Paid hours'], 'res.busyH': ['Horas ocupadas', 'Busy hours'], 'res.otH': ['HE', 'OT'], 'res.lastAct': ['Última actividad', 'Last activity'],
  'res.processes': ['Recursos por proceso', 'Resources per process'],
  'res.processesSub': ['Utilización = horas ocupadas ÷ horas pagadas de la semana (incluye horas extra).', 'Utilization = busy hours ÷ paid hours of the week (includes overtime).'],
  'res.process': ['Proceso', 'Process'], 'res.util': ['Utilización', 'Utilization'], 'res.wait': ['Espera media', 'Avg. wait'], 'res.maxQ': ['Cola máx. (paq)', 'Max queue (pkg)'], 'res.jobs': ['Tareas', 'Tasks'],
  'res.shifts': ['Por turno', 'By shift'], 'res.shift': ['Turno', 'Shift'], 'res.workers': ['Personas', 'People'],
  'res.backlog': ['Pendiente al cierre de cada turno', 'Backlog at each shift close'],
  'res.backlogSub': ['Paquetes que quedan sin terminar cuando termina el turno', 'Packages still in process when the shift ends'],
  'res.close': ['Cierre', 'Close'], 'res.wUnload': ['Por descargar', 'To unload'], 'res.wDecon': ['Por desconsolidar', 'To deconsolidate'], 'res.wSort': ['Por clasificar', 'To sort'],
  'res.wBaskets': ['En canastos', 'In baskets'], 'res.wRv': ['Por reverificar', 'To re-verify'], 'res.wBr': ['Por rutear', 'To route'], 'res.wStage': ['En Stage out', 'In Stage out'], 'res.wRoutes': ['En rutas', 'In routes'],
  'res.inbound': ['Camiones de entrada', 'Inbound trucks'],
  'res.truck': ['Camión', 'Truck'], 'res.arrival': ['Llegada', 'Arrival'], 'res.unloadEnd': ['Fin descarga', 'Unload end'], 'res.sortEnd': ['Fin sorting', 'Sort end'],
  'res.outbound': ['Camiones de salida', 'Outbound trucks'],
  'res.outboundSub': ['Sale al terminar la ventana de carga; lo que no se cargó espera al próximo camión.', 'Leaves at the end of the loading window; anything not loaded waits for the next truck.'],
  'res.group': ['Grupo', 'Group'], 'res.departure': ['Salida', 'Departure'], 'res.units': ['Unidades', 'Units'], 'res.pkgs': ['Paquetes', 'Packages'], 'res.m3': ['m³ (% cap.)', 'm³ (% cap.)'], 'res.kg': ['kg (% cap.)', 'kg (% cap.)'], 'res.late': ['Atraso', 'Delay'], 'res.left': ['Quedan (paq)', 'Left (pkg)'],
  'res.groups': ['Grupos de sorting', 'Sorting groups'],
  'res.flow': ['Flujo', 'Flow'], 'res.baskets': ['Canastos', 'Baskets'], 'res.containers': ['Contened.', 'Containers'], 'res.spp': ['Escaneos/paq', 'Scans/pkg'],
  'res.events': ['Eventos de Tracking', 'Tracking events'], 'res.event': ['Evento', 'Event'], 'res.count': ['Cantidad', 'Count'],
  'res.chBusy': ['Personal ocupado por proceso', 'Busy staff per process'], 'res.chBusySub': ['Cada 15 minutos, toda la semana', 'Every 15 minutes, whole week'],
  'res.chWip': ['Paquetes en proceso por etapa', 'Packages in process per stage'], 'res.chWipSub': ['Trabajo acumulado (WIP)', 'Accumulated work (WIP)'],
  'res.chThr': ['Paquetes por hora', 'Packages per hour'], 'res.chThrSub': ['Clasificados (WI-3) y despachados (RC-0)', 'Sorted (WI-3) and dispatched (RC-0)'],
  'res.sortedH': ['Clasificados', 'Sorted'], 'res.rc0H': ['Despachados', 'Dispatched'],
  'res.reverifyFlow': ['Reverif.', 'Re-verif.'], 'res.directFlow': ['Directo', 'Direct'],

  /* configuración */
  'cfg.note': ['Los cambios se aplican y se vuelven a simular al instante. Guardá el proyecto para conservarlos.', 'Changes apply and re-simulate instantly. Save the project to keep them.'],
  'cfg.general': ['Bodega', 'Warehouse'], 'cfg.name': ['Nombre', 'Name'], 'cfg.country': ['País', 'Country'], 'cfg.notes': ['Notas', 'Notes'],
  'cfg.seed': ['Semilla aleatoria', 'Random seed'], 'cfg.newSeed': ['Nueva semilla', 'New seed'],
  'cfg.volumePct': ['Volumen de llegadas (%)', 'Arrival volume (%)'], 'cfg.volumeHint': ['Escala todos los camiones. Útil para estudiar aumentos de volumen.', 'Scales all trucks. Useful to study volume growth.'],
  'cfg.profile': ['Perfil de paquete', 'Package profile'], 'cfg.profileSub': ['Valores medios; la variación se aplica a cada paquete', 'Average values; variation is applied to each package'],
  'cfg.weight': ['Peso (kg)', 'Weight (kg)'], 'cfg.length': ['Largo (cm)', 'Length (cm)'], 'cfg.width': ['Ancho (cm)', 'Width (cm)'], 'cfg.height': ['Alto (cm)', 'Height (cm)'], 'cfg.variation': ['Variación ± (%)', 'Variation ± (%)'],
  'cfg.volumeL': ['Volumen medio: {l} L', 'Average volume: {l} L'],
  'cfg.inbound': ['Programa semanal de camiones de entrada', 'Weekly inbound truck schedule'],
  'cfg.inboundSub': ['Cada fila es un camión que se repite en los días marcados. Cajas y ULD reciben WI-2 al bajarse; los sueltos, al terminar la descarga del camión.', 'Each row is a truck repeating on the checked days. Boxes and ULDs get WI-2 when unloaded; loose packages, when the truck finishes unloading.'],
  'cfg.truckName': ['Camión', 'Truck'], 'cfg.days': ['Días', 'Days'], 'cfg.time': ['Hora', 'Time'], 'cfg.packages': ['Paquetes', 'Packages'],
  'cfg.mixBoxes': ['% cajas', '% boxes'], 'cfg.mixUld': ['% ULD', '% ULD'], 'cfg.mixLoose': ['% sueltos', '% loose'],
  'cfg.perBox': ['Paq/caja', 'Pkg/box'], 'cfg.perUld': ['Paq/ULD', 'Pkg/ULD'], 'cfg.volVar': ['± vol %', '± vol %'], 'cfg.timeVar': ['± min', '± min'],
  'cfg.addTruck': ['+ Camión', '+ Truck'],
  'cfg.generator': ['Generador rápido', 'Quick generator'],
  'cfg.genSub': ['Crea camiones repartidos en una franja horaria y reemplaza la tabla.', 'Creates trucks spread over a time window and replaces the table.'],
  'cfg.genTrucks': ['Camiones por día', 'Trucks per day'], 'cfg.genFrom': ['Desde', 'From'], 'cfg.genTo': ['Hasta', 'To'], 'cfg.genPkgs': ['Paquetes por día', 'Packages per day'],
  'cfg.genApply': ['Generar', 'Generate'], 'cfg.genConfirm': ['¿Reemplazar los camiones actuales?', 'Replace the current trucks?'],
  'cfg.calendar': ['Vista semanal', 'Weekly view'], 'cfg.calTotal': ['{n} paq', '{n} pkg'], 'cfg.weekTotal': ['Total semanal: {n} paquetes', 'Weekly total: {n} packages'],
  'cfg.shifts': ['Turnos y personal', 'Shifts & staff'],
  'cfg.shiftsSub': ['Cada turno tiene su dotación por proceso, productividad y costo. Solo el turno noche puede dar horas extra; en los demás el trabajo queda pendiente.', 'Each shift has its own staffing per process, productivity and cost. Only the night shift can work overtime; in the others work stays pending.'],
  'cfg.shiftName': ['Turno', 'Shift'], 'cfg.start': ['Inicio', 'Start'], 'cfg.end': ['Fin', 'End'],
  'cfg.productivity': ['Productividad (%)', 'Productivity (%)'], 'cfg.cost': ['Costo hora (USD)', 'Hourly cost (USD)'],
  'cfg.night': ['Turno noche', 'Night shift'], 'cfg.otHours': ['Horas extra al cierre', 'Overtime at close (hours)'],
  'cfg.otHint': ['El personal se queda mientras haya trabajo pendiente, hasta este máximo.', 'Staff stays while there is pending work, up to this maximum.'],
  'cfg.breaks': ['Pausas', 'Breaks'], 'cfg.breakMin': ['min', 'min'], 'cfg.addBreak': ['+ Pausa', '+ Break'],
  'cfg.staff': ['Personas por proceso', 'People per process'], 'cfg.addShift': ['+ Turno', '+ Shift'],
  'cfg.otMult': ['Multiplicador de horas extra', 'Overtime multiplier'],
  'cfg.shiftPeople': ['{n} personas', '{n} people'],
  'cfg.groups': ['Grupos de sorting y camiones de salida', 'Sorting groups & outbound trucks'],
  'cfg.groupsSub': ['Cada grupo (provider) es una sucursal destino; cada servicio es un canasto. % de volumen: suma actual {sum}%.', 'Each group (provider) is a destination branch; each service is a basket. Volume share: current sum {sum}%.'],
  'cfg.group': ['Grupo', 'Group'], 'cfg.share': ['% volumen', '% volume'], 'cfg.dest': ['Destino', 'Destination'],
  'cfg.destStage': ['Stage out → camión', 'Stage out → truck'], 'cfg.destBranch': ['Branch → rutas', 'Branch → routes'],
  'cfg.reverify': ['Reverificación', 'Re-verification'], 'cfg.services': ['Servicios (canastos)', 'Services (baskets)'], 'cfg.svcWeight': ['peso', 'weight'],
  'cfg.addService': ['+ Servicio', '+ Service'], 'cfg.addGroup': ['+ Grupo', '+ Group'],
  'cfg.outTrucks': ['Camiones de salida', 'Outbound trucks'], 'cfg.addOut': ['+ Salida', '+ Departure'], 'cfg.outArrives': ['llega', 'arrives'],
  'cfg.ownProfile': ['Perfil de paquete propio', 'Own package profile'],
  'cfg.confirmDelGroup': ['¿Quitar el grupo {name}?', 'Remove group {name}?'],
  'cfg.routes': ['Branch: rutas y carteros', 'Branch: routes & postmen'],
  'cfg.routesSub': ['Cada cartero retira su ruta a su hora, los días marcados, con lo que esté listo.', 'Each postman picks up their route at their time on the checked days, with whatever is ready.'],
  'cfg.routeCount': ['Cantidad de rutas', 'Number of routes'], 'cfg.routeFirst': ['Primer cartero', 'First postman'], 'cfg.routeEvery': ['Intervalo (min)', 'Interval (min)'],
  'cfg.capacity': ['Capacidades físicas', 'Physical capacities'],
  'cfg.capacitySub': ['Canastos, contenedores y camiones se llenan por cantidad, volumen y peso, lo que ocurra primero.', 'Baskets, containers and trucks fill by count, volume and weight, whichever comes first.'],
  'cfg.basketPkgs': ['Canasto (paquetes)', 'Basket (packages)'], 'cfg.basketL': ['Canasto (litros)', 'Basket (liters)'],
  'cfg.contPkgs': ['Contenedor (paquetes)', 'Container (packages)'], 'cfg.contL': ['Contenedor (litros)', 'Container (liters)'],
  'cfg.slots': ['Stage out (posiciones por grupo)', 'Stage out (slots per group)'],
  'cfg.truckM3': ['Camión de salida (m³)', 'Outbound truck (m³)'], 'cfg.truckKg': ['Camión de salida (kg)', 'Outbound truck (kg)'],
  'cfg.loadWindow': ['Ventana de carga (min)', 'Loading window (min)'],
  'cfg.stSort': ['Estaciones Scan 1', 'Scan 1 stations'], 'cfg.stRv': ['Estaciones Scan 2', 'Scan 2 stations'], 'cfg.stBr': ['Estaciones sorting rutas', 'Route sorting stations'],
  'cfg.times': ['Tiempos estándar', 'Standard times'], 'cfg.timesSub': ['Distribución triangular: mínimo, típico, máximo. Se dividen por la productividad del turno.', 'Triangular distribution: min, typical, max. Divided by the shift productivity.'],
  'cfg.activity': ['Actividad', 'Activity'], 'cfg.unit': ['Unidad', 'Unit'], 'cfg.min': ['Mínimo', 'Min'], 'cfg.mode': ['Típico', 'Typical'], 'cfg.max': ['Máximo', 'Max'], 'cfg.perHour': ['≈ por hora y persona', '≈ per hour per person'],
  'u.sec': ['segundos', 'seconds'], 'u.min': ['minutos', 'minutes'],
  't.unloadBox': ['Descarga de caja', 'Unload box'], 't.unloadUld': ['Descarga de ULD (transpaleta)', 'Unload ULD (pallet jack)'], 't.unloadLoose': ['Descarga de paquete suelto', 'Unload loose package'],
  't.openBox': ['Apertura de caja', 'Open box'], 't.emptyUld': ['Vaciado de ULD', 'Empty ULD'], 't.sort': ['Scan 1 + caída al canasto', 'Scan 1 + drop into basket'],
  't.swap': ['Cambio de canasto lleno', 'Swap full basket'], 't.reverify': ['Escaneo de reverificación', 'Re-verification scan'], 't.container': ['Armado de contenedor', 'Build container'],
  't.branchSort': ['Sorting en rutas (app)', 'Route sorting (app)'], 't.load': ['Carga al camión', 'Load onto truck'], 't.handover': ['Entrega de ruta al cartero', 'Route handover to postman'],
  'per.box': ['por caja', 'per box'], 'per.uld': ['por ULD', 'per ULD'], 'per.pkg': ['por paquete', 'per package'], 'per.basket': ['por canasto', 'per basket'], 'per.container': ['por contenedor', 'per container'], 'per.unit': ['por unidad', 'per unit'], 'per.route': ['por ruta', 'per route'],
};

let lang: Lang = 'es';
try { const s = localStorage.getItem('dtw-lang'); if (s === 'en' || s === 'es') lang = s; } catch { /* sin almacenamiento */ }

export function getLang(): Lang { return lang; }
export function setLang(l: Lang): void { lang = l; try { localStorage.setItem('dtw-lang', l); } catch { /* ignorar */ } }

export function t(key: string, params?: Record<string, string | number>): string {
  const e = D[key];
  let s = e ? e[lang === 'es' ? 0 : 1] : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function hasKey(key: string): boolean { return key in D; }
export const ALL_KEYS = Object.keys(D);

/** Número con separadores según idioma. */
export function nf(n: number, digits = 0): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(lang === 'es' ? 'es' : 'en', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function pct(x: number): string { return isFinite(x) ? Math.round(x * 100) + '%' : '—'; }
export function dayName(d: number): string { return d >= 7 ? `${t('d' + (d % 7))} (${t('nextWeek')})` : t('d' + d); }
