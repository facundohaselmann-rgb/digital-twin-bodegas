/* Editor de disposición: zonas arrastrables sobre el plano real (PDF, imagen o DXF) en metros. */
import { useMemo, useRef, useState } from 'preact/hooks';
import { useWh } from '../store';
import { nf, t } from '../../i18n';
import type { Layout, PlanBackground, Project, Warehouse, Zone } from '../../model/types';
import { autoLayout, distances, ensureLayout, fitPlan, zoneKey } from '../../model/layout';
import { normalize } from '../../model/normalize';
import { K, backgroundSvg, planBox } from '../../plan/plan';
import { importImage, openPdf, parseDxf } from '../../plan/import';

const SNAP = 0.5;
const snap = (v: number): number => Math.round(v / SNAP) * SNAP;
const UNIT_M: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

interface Drag { i: number; mode: 'move' | 'size'; x0: number; y0: number; z0: Zone }

export function LayoutEditor({ plan, onProject, onClose, say }: { plan: PlanBackground | null; onProject: (fn: (p: Project) => void) => void; onClose: () => void; say: (m: string) => void }) {
  const { w, update } = useWh();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* layout completo (con una zona por elemento de la configuración), aunque el proyecto todavía no tenga uno propio */
  const base = useMemo<Layout>(() => { const x = structuredClone(w); x.layout ??= autoLayout(x); normalize(x); return x.layout!; }, [w]);
  const [tmp, setTmp] = useState<Zone[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [scaleMode, setScaleMode] = useState<[number, number][] | null>(null);
  const [busy, setBusy] = useState(false);
  const L: Layout = { ...base, zones: tmp ?? base.zones };
  const vb = planBox(L);
  const view: Warehouse = { ...w, layout: L };
  const D = distances(view);

  const save = (zones: Zone[]) => update(o => { ensureLayout(o); o.layout = { ...L, zones }; });
  const name = (z: Zone): string => { const g = w.groups.find(x => x.id === z.ref)?.name ?? ''; return z.kind === 'group' ? g : z.ref ? `${t('z.' + z.kind)} · ${g}` : t('z.' + z.kind); };
  const pt = (e: PointerEvent): [number, number] => {
    const s = svgRef.current!, p = s.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(s.getScreenCTM()!.inverse());
    return [q.x / K, q.y / K];
  };

  const down = (e: PointerEvent, i: number, mode: Drag['mode']) => {
    if (scaleMode) return;
    e.stopPropagation();
    const [x, y] = pt(e);
    setSel(i);
    setDrag({ i, mode, x0: x, y0: y, z0: L.zones[i] });
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const [x, y] = pt(e), z = drag.z0, dx = x - drag.x0, dy = y - drag.y0;
    const n = drag.mode === 'move' ? { ...z, x: snap(z.x + dx), y: snap(z.y + dy) } : { ...z, w: Math.max(SNAP, snap(z.w + dx)), h: Math.max(SNAP, snap(z.h + dy)) };
    setTmp(L.zones.map((q, j) => (j === drag.i ? n : q)));
  };
  const up = () => { if (drag && tmp) save(tmp); setDrag(null); setTmp(null); };
  const nudge = (e: KeyboardEvent) => {
    if (sel == null) return;
    const d = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] }[e.key];
    if (!d) return;
    e.preventDefault();
    save(L.zones.map((z, j) => (j === sel ? (e.shiftKey ? { ...z, w: Math.max(SNAP, z.w + d[0]), h: Math.max(SNAP, z.h + d[1]) } : { ...z, x: z.x + d[0], y: z.y + d[1] }) : z)));
  };

  /* escala: dos clics sobre el plano y la distancia real */
  const clickScale = (e: PointerEvent) => {
    if (!scaleMode || !plan) return;
    const p = [...scaleMode, pt(e)];
    if (p.length < 2) { setScaleMode(p); return; }
    setScaleMode(null);
    const dm = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
    const real = parseFloat(String(prompt(t('ed.scaleAsk'), nf(dm, 1)) ?? '').replace(',', '.'));
    if (!(real > 0) || !(dm > 0)) return;
    const f = real / dm;
    onProject(pr => { if (!pr.plan) return; pr.plan.scale *= f; fitPlan(pr, pr.plan, f); });
    say(t('ed.scaleDone', { m: nf(plan.w * plan.scale * f, 1) }));
  };

  const setPlan = (bg: PlanBackground) => { onProject(p => { p.plan = bg; fitPlan(p, bg); }); };
  const load = async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    setBusy(true);
    try {
      if (ext === 'dwg') { alert(t('ed.dwg')); return; }
      if (ext === 'dxf') {
        const r = parseDxf(await f.text());
        if (!r.d) { say(t('ed.dxfEmpty')); return; }
        let unit = r.unitsM;
        if (unit == null) unit = UNIT_M[String(prompt(t('ed.dxfUnits'), 'mm') ?? '').trim().toLowerCase()] ?? 0.001;
        setPlan({ kind: 'dxf', name: f.name, data: r.d, w: r.w, h: r.h, scale: unit });
        say(r.truncated ? t('ed.dxfTruncated') : t('ed.loaded', { name: f.name, w: nf(r.w * unit, 1), h: nf(r.h * unit, 1) }));
        return;
      }
      let img;
      if (ext === 'pdf') {
        const pdf = await openPdf(f);
        const n = pdf.pages > 1 ? parseInt(String(prompt(t('ed.pdfPage', { n: pdf.pages }), '1')), 10) || 1 : 1;
        img = await pdf.render(n);
      } else img = await importImage(f);
      // la escala real no se conoce: se supone el ancho actual de la bodega y se pide marcarla
      setPlan({ kind: 'image', name: f.name, data: img.data, w: img.w, h: img.h, scale: L.widthM / img.w });
      say(t('ed.loadedImage', { name: f.name }));
      setScaleMode([]);
    } catch (e) { say(t('ed.loadError', { msg: String((e as Error).message ?? e) })); }
    finally { setBusy(false); }
  };

  const size = (k: 'widthM' | 'heightM', v: number) => { if (v >= 5) update(o => { ensureLayout(o)[k] = v; }); };
  const m = (v: number) => nf(v, 1) + ' m';
  const z = sel != null ? L.zones[sel] : null;

  return (
    <div class="card editor">
      <div class="ctl">
        <b>{t('ed.title')}</b>
        <button class="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t('ed.loading') : t('ed.load')}</button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.dxf,.dwg" onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) load(f); }} />
        {plan && <button class={'btn' + (scaleMode ? ' pri' : '')} onClick={() => setScaleMode(scaleMode ? null : [])}>{t('ed.scale')}</button>}
        {plan && <button class="btn" onClick={() => { if (confirm(t('ed.removeAsk'))) onProject(p => { p.plan = null; }); }}>{t('ed.remove')}</button>}
        <label class="fld inl"><span>{t('ed.width')}</span><input type="number" min={5} step={0.5} value={Math.round(L.widthM * 10) / 10} disabled={!!plan} onChange={e => size('widthM', +e.currentTarget.value)} /></label>
        <label class="fld inl"><span>{t('ed.height')}</span><input type="number" min={5} step={0.5} value={Math.round(L.heightM * 10) / 10} disabled={!!plan} onChange={e => size('heightM', +e.currentTarget.value)} /></label>
        <button class="btn" onClick={() => { if (confirm(t('ed.resetAsk'))) update(o => { ensureLayout(o); const a = autoLayout(o); if (plan) { a.widthM = plan.w * plan.scale; a.heightM = plan.h * plan.scale; } o.layout = a; }); }}>{t('ed.reset')}</button>
        <button class="btn pri" onClick={onClose}>{t('ed.done')}</button>
      </div>
      <div class="hint">{scaleMode ? t(scaleMode.length ? 'ed.scaleClick2' : 'ed.scaleClick1') : t('ed.help')}{!w.layout && <b> {t('ed.noLayout')}</b>}</div>
      <div class="planwrap">
        <svg ref={svgRef} id="layout" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} tabIndex={0} onKeyDown={nudge}
          onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={e => { if (scaleMode) clickScale(e); else setSel(null); }}
          class={scaleMode ? 'scaling' : ''} aria-label={t('ed.title')}>
          <defs><pattern id="egrid" width={K} height={K} patternUnits="userSpaceOnUse"><path d={`M${K} 0H0V${K}`} fill="none" stroke="var(--grid)" stroke-width="1" /></pattern></defs>
          <g dangerouslySetInnerHTML={{ __html: backgroundSvg(plan) }} />
          <rect x={0} y={0} width={L.widthM * K} height={L.heightM * K} fill="url(#egrid)" opacity={plan ? 0.35 : 1} />
          <rect class="p-wall" x={0} y={0} width={L.widthM * K} height={L.heightM * K} />
          {L.zones.map((q, i) => {
            const x = q.x * K, y = q.y * K, ww = q.w * K, hh = q.h * K;
            return (
              <g key={zoneKey(q)} class={'ez k-' + q.kind + (sel === i ? ' sel' : '')}>
                <rect x={x} y={y} width={ww} height={hh} rx={3} onPointerDown={e => down(e as unknown as PointerEvent, i, 'move')}><title>{name(q)}</title></rect>
                {ww > 30 && hh > 12 && <text x={x + 4} y={y + 11}>{name(q).slice(0, Math.max(3, Math.floor(ww / 5.6)))}</text>}
                <rect class="hd" x={x + ww - 7} y={y + hh - 7} width={10} height={10} onPointerDown={e => down(e as unknown as PointerEvent, i, 'size')} />
              </g>
            );
          })}
          {scaleMode?.map(p => <circle class="sp" cx={p[0] * K} cy={p[1] * K} r={5} />)}
        </svg>
      </div>
      <div class="edfoot">
        <div class="hint">{z ? t('ed.sel', { name: name(z), w: nf(z.w, 1), h: nf(z.h, 1), x: nf(z.x, 1), y: nf(z.y, 1) }) : t('ed.noSel')}</div>
        <h3>{t('ed.dist')}</h3>
        <div class="sub">{t('ed.distSub')}</div>
        <div class="tblwrap"><table>
          <tbody>
            <tr><td>{t('ed.dUnload')}</td><td class="n">{m(D.unloadDecon)}</td><td>{t('ed.dFeed')}</td><td class="n">{m(D.deconSort)}</td><td>{t('ed.dHospital')}</td><td class="n">{m(D.hospital)}</td><td>{t('ed.dExit')}</td><td class="n">{m(D.routeExit)}</td></tr>
          </tbody>
        </table></div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('cfg.group')}</th><th class="n">{t('ed.dSort')}</th><th class="n">{t('ed.dFirst')}</th><th class="n">{t('ed.dSecond')}</th><th class="n">{t('ed.dDock')}</th></tr></thead>
          <tbody>{w.groups.map((g, i) => <tr><td>{g.name}</td><td class="n">{m(D.sortGroup[i])}</td><td class="n">{m(D.first[i])}</td><td class="n">{g.reverify ? m(D.second[i]) : '—'}</td><td class="n">{g.dest === 'branch' ? '—' : m(D.stageDock[i])}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}
