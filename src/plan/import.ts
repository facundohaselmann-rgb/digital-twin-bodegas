/* Planos de fondo: imagen (PNG/JPG), PDF (se rasteriza la página elegida) o CAD en DXF (se convierte a trazos).
   El DWG es un formato cerrado: se exporta desde AutoCAD como DXF o PDF. */

const MAX_PX = 2400;
const MAX_POINTS = 200_000;

export interface Raster { data: string; w: number; h: number }

/** Dibuja en un canvas y lo guarda como JPEG (fondo blanco) para que el proyecto no pese de más. */
function toJpeg(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number): Raster {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  draw(ctx);
  return { data: c.toDataURL('image/jpeg', 0.85), w, h };
}

export async function importImage(file: File): Promise<Raster> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const r = toJpeg(ctx => ctx.drawImage(bmp, 0, 0, w, h), w, h);
  bmp.close();
  return r;
}

/** Cantidad de páginas y función para rasterizar una. pdf.js corre en el mismo hilo: el archivo de la app es uno solo. */
export async function openPdf(file: File): Promise<{ pages: number; render: (page: number) => Promise<Raster> }> {
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import('pdfjs-dist/build/pdf.worker.min.mjs');
  const pdfjs = await import('pdfjs-dist');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    pages: doc.numPages,
    render: async (n: number) => {
      const page = await doc.getPage(Math.min(Math.max(1, n), doc.numPages));
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: MAX_PX / Math.max(v1.width, v1.height) });
      const w = Math.round(vp.width), h = Math.round(vp.height);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      await page.render({ canvas: c, viewport: vp, background: '#ffffff' }).promise;
      return toJpeg(ctx => ctx.drawImage(c, 0, 0), w, h);
    },
  };
}

/* ------------------------------- DXF ------------------------------- */
type Pt = [number, number];
interface Ent { type: string; c: [number, string][] }
/** Metros por unidad según $INSUNITS. */
const UNITS: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

export interface DxfResult { d: string; w: number; h: number; unitsM: number | null; truncated: boolean }

/** Convierte las líneas, polilíneas, círculos, arcos, splines y bloques de un DXF ASCII en un path SVG (eje y hacia abajo, origen en 0,0). */
export function parseDxf(text: string): DxfResult {
  const ln = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < ln.length; i += 2) pairs.push([parseInt(ln[i], 10), ln[i + 1].trim()]);
  let unitsM: number | null = null;
  const hi = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (hi >= 0) unitsM = UNITS[parseInt(pairs[hi + 1]?.[1] ?? '', 10)] ?? null;

  // registros (cada uno empieza con código 0) agrupados por sección
  const blocks = new Map<string, { base: Pt; ents: Ent[] }>();
  const entities: Ent[] = [];
  let section = '', cur: Ent | null = null, block: { name: string; base: Pt; ents: Ent[] } | null = null;
  const flush = (): void => {
    if (!cur) return;
    const e = cur; cur = null;
    if (e.type === 'SECTION') section = e.c.find(([c]) => c === 2)?.[1] ?? '';
    else if (e.type === 'ENDSEC') section = '';
    else if (section === 'BLOCKS' && e.type === 'BLOCK') block = { name: e.c.find(([c]) => c === 2)?.[1] ?? '', base: [num(e, 10), num(e, 20)], ents: [] };
    else if (section === 'BLOCKS' && e.type === 'ENDBLK') { if (block) blocks.set(block.name, block); block = null; }
    else if (section === 'BLOCKS' && block) block.ents.push(e);
    else if (section === 'ENTITIES') entities.push(e);
  };
  for (const [c, v] of pairs) {
    if (c === 0) { flush(); cur = { type: v, c: [] }; } else cur?.c.push([c, v]);
  }
  flush();

  const polys: Pt[][] = [];
  let points = 0, truncated = false;
  const add = (p: Pt[]): void => {
    if (p.length < 2 || truncated) return;
    if (points + p.length > MAX_POINTS) { truncated = true; return; }
    points += p.length; polys.push(p);
  };
  const walk = (ents: Ent[], tf: (p: Pt) => Pt, depth: number): void => {
    // POLYLINE clásica: sus VERTEX vienen como registros siguientes hasta SEQEND
    let poly: { pts: Pt[]; closed: boolean } | null = null;
    for (const e of ents) {
      if (e.c.some(([c, v]) => c === 67 && v === '1')) continue; // espacio papel
      if (poly && e.type !== 'VERTEX') { add(close(poly.pts.map(tf), poly.closed)); poly = null; }
      switch (e.type) {
        case 'LINE': add([tf([num(e, 10), num(e, 20)]), tf([num(e, 11), num(e, 21)])]); break;
        case 'LWPOLYLINE': { const xs = all(e, 10), ys = all(e, 20); add(close(xs.map((x, i) => tf([x, ys[i] ?? 0])), (num(e, 70) & 1) === 1)); break; }
        case 'POLYLINE': poly = { pts: [], closed: (num(e, 70) & 1) === 1 }; break;
        case 'VERTEX': poly?.pts.push([num(e, 10), num(e, 20)]); break;
        case 'CIRCLE': add(arc(num(e, 10), num(e, 20), num(e, 40), 0, 360).map(tf)); break;
        case 'ARC': add(arc(num(e, 10), num(e, 20), num(e, 40), num(e, 50), num(e, 51)).map(tf)); break;
        case 'ELLIPSE': add(ellipse(e).map(tf)); break;
        case 'SPLINE': { const xs = all(e, 11).length ? all(e, 11) : all(e, 10), ys = all(e, 11).length ? all(e, 21) : all(e, 20); add(xs.map((x, i) => tf([x, ys[i] ?? 0]))); break; }
        case 'INSERT': {
          const b = blocks.get(e.c.find(([c]) => c === 2)?.[1] ?? '');
          if (!b || depth > 6) break;
          const sx = num(e, 41, 1), sy = num(e, 42, 1), rot = (num(e, 50) * Math.PI) / 180, ix = num(e, 10), iy = num(e, 20);
          const cs = Math.cos(rot), sn = Math.sin(rot);
          walk(b.ents, p => { const x = (p[0] - b.base[0]) * sx, y = (p[1] - b.base[1]) * sy; return tf([ix + x * cs - y * sn, iy + x * sn + y * cs]); }, depth + 1);
          break;
        }
      }
    }
    if (poly) add(close(poly.pts.map(tf), poly.closed));
  };
  walk(entities, p => p, 0);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!polys.length) return { d: '', w: 0, h: 0, unitsM, truncated };
  const w = x1 - x0 || 1, h = y1 - y0 || 1;
  const dec = Math.max(0, Math.min(6, Math.ceil(-Math.log10(Math.max(w, h) / 20000))));
  const f = (v: number): string => { const s = v.toFixed(dec); return s === '-0' ? '0' : s; };
  const d = polys.map(p => 'M' + p.map(([x, y], i) => (i ? 'L' : '') + f(x - x0) + ' ' + f(y1 - y)).join(' ')).join(' ');
  return { d, w, h, unitsM, truncated };
}

function num(e: Ent, code: number, d = 0): number { const v = e.c.find(([c]) => c === code)?.[1]; const x = v == null ? NaN : parseFloat(v); return Number.isFinite(x) ? x : d; }
function all(e: Ent, code: number): number[] { return e.c.filter(([c]) => c === code).map(([, v]) => parseFloat(v) || 0); }
function close(p: Pt[], closed: boolean): Pt[] { return closed && p.length > 2 ? [...p, p[0]] : p; }
function arc(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0;
  if (sweep <= 0) sweep += 360;
  const n = Math.max(4, Math.ceil(sweep / 10));
  return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + (sweep * i) / n) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });
}
function ellipse(e: Ent): Pt[] {
  const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
  let t0 = num(e, 41), t1 = num(e, 42, Math.PI * 2);
  if (t1 <= t0) t1 += Math.PI * 2;
  const n = Math.max(8, Math.ceil(((t1 - t0) * 180) / Math.PI / 10));
  return Array.from({ length: n + 1 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / n; const c = Math.cos(t), s = Math.sin(t) * ratio; return [cx + mx * c - my * s, cy + my * c + mx * s] as Pt; });
}
