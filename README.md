# MAT · Digital Twin de bodegas cross-dock

**MAT** (MailAmericas Twin) es el gemelo digital de las bodegas de MailAmericas.

Herramienta para **dimensionar y simular bodegas cross-dock** por proyecto: diseño de bodegas nuevas, cambios de proceso, aumentos de volumen y cambios de layout. Simula una **semana completa** con eventos discretos y muestra el plano animado, la utilización del personal por turno y los tiempos WI-2 → RC-0.

Funciona **100 % local y sin conexión**: es un único archivo HTML que se abre en Chrome. No necesita servidor ni instalación.

## Cómo usarlo

1. Descargá [`releases/digital-twin-bodegas.html`](releases/digital-twin-bodegas.html). En GitHub: botón **Download raw file**.
2. Guardalo en tu carpeta de **Google Drive para escritorio**, por ejemplo `Mi unidad/Digital Twin/`.
3. Abrilo con doble clic en **Chrome**.
4. **Nuevo → Desde plantilla Jamaica** (o **Bodega en blanco**), configurá la bodega en **Configuración**, dibujá la disposición con **✎ Editar plano** y mirá **Plano y simulación** y **Resultados**.
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
| Layout y plano | **✎ Editar plano** en la pestaña del plano: cada proceso, cada grupo de canastos, cada carril de Stage out, cada puerta de carga, Branch y la salida de carteros es una zona en metros que se arrastra y se redimensiona. El plano real se carga de fondo como **PDF** (se elige la página), **imagen** (PNG/JPG) o **CAD en DXF** (con sus medidas); la escala se fija marcando dos puntos de una medida conocida. El DWG se exporta antes como DXF o PDF. Cada escenario tiene su propia disposición; el plano de fondo es del proyecto |
| Traslados | Distancia en ángulo recto entre los bordes más cercanos de cada zona (las zonas que se tocan se pasan la carga sin viaje; el recorrido dentro de una zona ya está en los tiempos estándar). Cada viaje suma ida y vuelta a la velocidad del medio (a pie 1,2 m/s, carro 1,0 m/s, transpaleta 0,8 m/s) más 30 s para tomar y dejar la carga. Sorting manual y Pick to Light: a pie hasta los canastos; sorter: la cinta lleva los paquetes. ULD: siempre en transpaleta. Cambio de puesto: 2 min más la caminata entre zonas. Resultado: km recorridos, horas de traslado y su parte del costo |
| Retornos | El cartero devuelve un % de lo que se llevó (2 % por defecto) en su próximo retiro: el DV-1 se hace antes del control de ruta y los paquetes quedan en la estantería de retiro (LM-4). Los clientes retiran un % (25 %) dentro de los días máximos (14 corridos desde DV-1); llegan durante el turno mañana y los atiende quien está en despacho de carteros o alguien ocioso. Lo que vence pasa a RT-1. Las sucursales devuelven un % (2 %) en uno de cada dos camiones, directo a RT-1. Lo destruido en el hospital va a la caja de destrucción. RT-1 clasifica en cajas de destrucción o retorno (50/50) y el camión RT-2 pasa una vez por semana o al juntar N cajas. RT-1 y RT-2 son de baja prioridad: los hace quien está ocioso y no generan horas extra. La estantería se calcula en régimen estable (las semanas anteriores iguales a la simulada). Resultado: estantería promedio y máxima, días en estantería, retirados, vencidos, cajas, viajes RT-2 y costo por paquete retornado |
| Plantillas | Jamaica (sorting manual con PDA, disposición del plano de la presentación original a 50 × 25 m), **Modelo** (genérica, Pick to Light y todas las funciones) y bodega en blanco |
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
  plan/       plano SVG animado desde el layout, reproductor del log e importadores de plano (PDF, imagen, DXF)
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

- **Iteración 4 (MVP):** layout sobre el plano real (PDF, imagen o DXF) con escala y distancias.
- **Iteración 5 (esta versión):** retornos (DV-1, LM-4, RT-1, RT-2) y nombre MAT.
- **Iteración 6:** rediseño de la interfaz y del reporte con el sistema de diseño de MailAmericas (solo escritorio).
- **Siguientes:** calibración con históricos (CSV), layout completo con muros, columnas, pasillos y equipos limitados, optimización de dotación.
