# Digital Twin · Bodegas cross-dock

Herramienta para **dimensionar y simular bodegas cross-dock** por proyecto: diseño de bodegas nuevas, cambios de proceso, aumentos de volumen y cambios de layout. Simula una **semana completa** con eventos discretos y muestra el plano animado, la utilización del personal por turno y los tiempos WI-2 → RC-0.

Funciona **100 % local y sin conexión**: es un único archivo HTML que se abre en Chrome. No necesita servidor ni instalación.

## Cómo usarlo

1. Descargá [`releases/digital-twin-bodegas.html`](releases/digital-twin-bodegas.html). En GitHub: botón **Download raw file**.
2. Guardalo en tu carpeta de **Google Drive para escritorio**, por ejemplo `Mi unidad/Digital Twin/`.
3. Abrilo con doble clic en **Chrome**.
4. **Nuevo → Desde plantilla Jamaica** (o **Bodega en blanco**), configurá la bodega en **Configuración** y mirá **Plano y simulación** y **Resultados**.
5. **Guardar** (Ctrl+S) crea un archivo `.dtwin` donde elijas. Si lo guardás en la carpeta de Drive, se sincroniza solo. **Abrir** lo recupera.

Cada cambio se vuelve a simular al instante. El idioma (ES/EN) se cambia arriba a la derecha.

## Qué modela

| Área | Detalle |
|---|---|
| Programa semanal de camiones de entrada | Días, hora, paquetes, mezcla de **cajas / ULD / sueltos**, paquetes por caja y por ULD, variación de volumen y de hora. Incluye generador rápido y vista semanal |
| WI-2 | Cajas y ULD: al bajarse, para todos sus paquetes. Sueltos: al terminar la descarga del camión |
| Turnos | Cantidad libre de turnos, días, horario (puede cruzar la medianoche), pausas, productividad %, costo hora, dotación por proceso |
| Horas extra | Solo en el turno noche, por las horas que elijas. En los demás turnos el trabajo queda pendiente para el turno o día siguiente |
| Perfil de paquete | Peso y medidas medios con variación, por bodega o por grupo de sorting |
| Capacidades | Canastos, contenedores y camiones de salida se llenan por cantidad, volumen y peso. Estaciones de Scan 1, Scan 2 y sorting de rutas |
| Procesos | Descarga → desconsolidación → sorting (Scan 1) → cierre de canastos por camión → reverificación (Scan 2) y contenedores → Stage out → carga en camiones de salida (RC-0) / Branch → rutas → carteros |
| Sorting de entrada | Uno por bodega: **manual con PDA**, **Pick to Light** o **sorter automático** (puntos de inducción, capacidad de la máquina, bocas, límites de peso y medidas, no leídos). Los paquetes que no entran en el sorter y las bocas compartidas se clasifican a mano. El sorting de rutas y la reverificación son siempre manuales con PDA |
| Hospital | % de excepciones en Scan 1 (más los no leídos del sorter). Un % se reetiqueta y vuelve a sorting; el resto va a destrucción |
| Personal multiskill | Cada persona arranca en su puesto. Cuando se queda sin trabajo espera un tiempo (10 min por defecto) por si vuelve a haber trabajo en su puesto; si no, pasa al siguiente proceso con trabajo pendiente (la carga va primero si hay un camión esperando). Vuelve a su puesto cuando tiene trabajo, sin esperar. Cada cambio cuesta unos minutos (configurable) |
| CPT | Por grupo de sorting: la salida del camión (Stage out) o el retiro del cartero de cada ruta (Branch). El CPT de un paquete es el primero que queda al menos el *tiempo esperado de procesamiento* después de su WI-2. En Branch sin reverificación, el RC-0 ocurre cuando se llena el canasto |
| Carteros | Ventanas de retiro configurables (por defecto, mañana y tarde) |
| Discrepancias | Faltantes de aduana (WI-2 sin WI-3: se reportan solos, no cuentan para volumen ni CPT), errores de sorting (se corrigen en el momento en AV-1 o LM-1) y faltantes de cartero en LM-1 (se buscan; si aparecen salen de inmediato, si no son siniestros de bodega) |
| Costos (USD) | Mano de obra por horas pagadas y costo hora de cada turno, horas extra con multiplicador, costos fijos mensuales por categoría (alquiler, servicios, seguridad, limpieza, equipos, sistemas, seguros, supervisión) prorrateados a la semana, insumos. **Costo por paquete entrante** |
| Corridas múltiples | 20 corridas con distintas semillas por defecto; cada KPI con media ± margen al 95 % |
| Escenarios | Cada proyecto trae 3 escenarios (base, +20 % volumen y otro tipo de sorting). Se editan, duplican y comparan lado a lado |
| Reporte | Exportar PDF con la impresión de Chrome ("Guardar como PDF") y CSV |
| Plantillas | Jamaica (sorting manual con PDA), **Modelo** (genérica, Pick to Light y todas las funciones) y bodega en blanco |
| Resultados | CPT a tiempo por grupo, tiempo WI-2 → RC-0 (media, P90, P95, P98), utilización y cambios de puesto por turno, hospital, sorter, pendiente al cierre de cada turno, camiones de entrada y salida, eventos de Tracking, gráficos semanales, exportación a CSV |

Los valores por defecto (volúmenes, tiempos, dotación, costos) son **supuestos estándar editables**. La estructura de grupos y servicios viene de la operación de Jamaica.

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # servidor local con recarga
npm test           # tests del motor, i18n y archivos de proyecto
npm run build      # genera dist/index.html (archivo único)
npm run e2e        # prueba de humo en Chromium (requiere Playwright)
```

Para publicar una versión, se copia `dist/index.html` a `releases/digital-twin-bodegas.html`. El CI (GitHub Actions) corre los tests y verifica que esa copia esté al día.

### Estructura

```
src/
  model/      tipos (modelo de datos v2), plantillas, validación, utilidades de tiempo
  engine/     motor de eventos discretos (semanal), RNG, cola O(1), Web Worker
  plan/       plano SVG animado y reproductor del log de eventos
  storage/    archivos de proyecto .dtwin (File System Access API) y autoguardado
  i18n/       textos en español e inglés
  ui/         interfaz (Preact): pestañas de plano, resultados y configuración
tests/        tests con Vitest
e2e/          prueba de humo con Playwright
releases/     HTML listo para usar
```

### Datos reales

Los CSV con datos de paquetes **no se suben a este repositorio** (están en `.gitignore`). Se guardan en Drive.

## Roadmap

- **Iteración 4 (MVP):** layout sobre el plano PDF con escala y distancias.
- **Siguientes:** retornos (DV-1, LM-4, RT-1, RT-2), editor de layout completo, calibración con históricos (CSV), optimización de dotación.
