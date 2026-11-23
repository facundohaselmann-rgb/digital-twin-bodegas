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

## Qué modela (iteración 1)

| Área | Detalle |
|---|---|
| Programa semanal de camiones de entrada | Días, hora, paquetes, mezcla de **cajas / ULD / sueltos**, paquetes por caja y por ULD, variación de volumen y de hora. Incluye generador rápido y vista semanal |
| WI-2 | Cajas y ULD: al bajarse, para todos sus paquetes. Sueltos: al terminar la descarga del camión |
| Turnos | Cantidad libre de turnos, días, horario (puede cruzar la medianoche), pausas, productividad %, costo hora, dotación por proceso |
| Horas extra | Solo en el turno noche, por las horas que elijas. En los demás turnos el trabajo queda pendiente para el turno o día siguiente |
| Perfil de paquete | Peso y medidas medios con variación, por bodega o por grupo de sorting |
| Capacidades | Canastos, contenedores y camiones de salida se llenan por cantidad, volumen y peso. Estaciones de Scan 1, Scan 2 y sorting de rutas |
| Procesos | Descarga → desconsolidación → sorting (Scan 1) → cierre de canastos por camión → reverificación (Scan 2) y contenedores → Stage out → carga en camiones de salida (RC-0) / Branch → rutas → carteros |
| Resultados | Tiempo WI-2 → RC-0 (media, P90, P95, P98), utilización por proceso y turno, pendiente al cierre de cada turno, camiones de entrada y salida, eventos de Tracking, gráficos semanales, exportación a CSV |

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

Para publicar una versión, se copia `dist/index.html` a `releases/digital-twin-bodegas.html`.

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

- **Iteración 2:** plantilla de procesos configurable, 3 tipos de sorting (manual, Pick to Light, sorter automático con bocas), personal multiskill, CPT por grupo.
- **Iteración 3:** hospital de paquetes, discrepancias, costo por paquete (USD), corridas múltiples, comparador de escenarios, exportación a PDF.
- **Iteración 4 (MVP):** layout sobre el plano PDF con escala y distancias.
- **Siguientes:** retornos (DV-1, LM-4, RT-1, RT-2), editor de layout completo, calibración con históricos (CSV), optimización de dotación.
