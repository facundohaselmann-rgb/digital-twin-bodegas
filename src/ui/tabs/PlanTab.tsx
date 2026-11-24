import { useEffect, useRef, useState } from 'preact/hooks';
import type { SimResult, Sample } from '../../engine/simulate';
import { PROCESSES, type PlanBackground, type Project, type Warehouse } from '../../model/types';
import { LayoutEditor } from './LayoutEditor';
import { ZonePanel } from './ZonePanel';
import type { Kpis } from '../../engine/kpis';
import type { KpiSummaries } from './ScenariosTab';
import type { Section } from './ConfigTab';
import { DAY, fmtHM, hm } from '../../model/time';
import { buildPlan, FxLayer, Player, renderPlan, type Geo, type PlayState } from '../../plan/plan';
import { nf, t } from '../../i18n';

const SPEEDS = [5, 15, 60, 180];

function nearestSample(s: Sample[], tt: number): Sample | null {
  if (!s.length || tt < s[0].t) return null;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t <= tt) lo = m; else hi = m - 1; }
  return s[lo];
}

function activeShifts(w: Warehouse, tt: number): string[] {
  const out: string[] = [];
  w.shifts.forEach(s => {
    const st = hm(s.start)!, en = hm(s.end)!, len = en > st ? en - st : en + DAY - st;
    for (let d = Math.floor(tt / DAY) - 1; d <= Math.floor(tt / DAY); d++) {
      if (d < 0 || !s.days[d % 7]) continue;
      const a = d * DAY + st;
      if (tt >= a && tt < a + len) { out.push(s.name); return; }
    }
  });
  return out;
}

interface Props {
  w: Warehouse; r: SimResult; k: Kpis; prevK: Kpis | null; rep: KpiSummaries | null; plan: PlanBackground | null;
  onProject: (fn: (p: Project) => void) => void; say: (m: string) => void; edit: boolean; setEdit: (v: boolean) => void; onGoConfig: (s: Section) => void;
}

export function PlanTab(props: Props) {
  return props.edit ? <LayoutEditor plan={props.plan} onProject={props.onProject} say={props.say} onClose={() => props.setEdit(false)} /> : <PlanView {...props} />;
}

/** Indicadores de la semana en un desplegable: cerrado ocupa una línea; abierto muestra el cambio frente a la corrida anterior (el impacto del último ajuste). */
function KpiBar({ k, prevK, rep }: { k: Kpis; prevK: Kpis | null; rep: KpiSummaries | null }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('dtw-kpis') === '1'; } catch { return false; } });
  const items: { key: keyof Kpis; label: string; val: string; sub: string; scale: number; unit: string; dec: number; better: -1 | 0 | 1 }[] = [
    { key: 'costPerPkg', label: t('k.costPerPkg'), val: nf(k.costPerPkg, 3) + ' USD', sub: rep ? t('kpi.ci', { ci: nf(rep.costPerPkg.ci, 3) }) : t('kpi.oneRun'), scale: 1, unit: ' USD', dec: 3, better: -1 },
    { key: 'cptPct', label: t('k.cptPct'), val: nf(k.cptPct * 100, 1) + ' %', sub: t('kpi.cptSub'), scale: 100, unit: ' pp', dec: 1, better: 1 },
    { key: 'timeMean', label: t('kpi.time'), val: nf(k.timeMean / 60, 1) + ' h', sub: 'P90 ' + nf(k.timeP90 / 60, 1) + ' h', scale: 1 / 60, unit: ' h', dec: 1, better: -1 },
    { key: 'util', label: t('k.util'), val: nf(k.util * 100, 1) + ' %', sub: t('kpi.utilSub'), scale: 100, unit: ' pp', dec: 1, better: 0 },
    { key: 'otH', label: t('k.otH'), val: nf(k.otH, 1) + ' h', sub: t('kpi.otSub'), scale: 1, unit: ' h', dec: 1, better: -1 },
  ];
  const delta = (it: typeof items[number]) => {
    if (!prevK || !Number.isFinite(prevK[it.key]) || !Number.isFinite(k[it.key])) return null;
    const d = (k[it.key] - prevK[it.key]) * it.scale;
    if (Math.abs(d) < 0.5 * Math.pow(10, -it.dec)) return { txt: t('kpi.same'), cls: '' };
    const cls = it.better === 0 ? '' : Math.sign(d) === it.better ? 'up' : 'down';
    return { txt: (d > 0 ? '▲ +' : '▼ −') + nf(Math.abs(d), it.dec) + it.unit, cls };
  };
  return (
    <details class="kpibar" open={open} onToggle={e => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); try { localStorage.setItem('dtw-kpis', o ? '1' : '0'); } catch { /* ignorar */ } }}>
      <summary>
        <b>{t('kpi.title')}</b>
        {items.map(it => <span>{it.label} <b>{it.val}</b></span>)}
        <span class="chev" aria-hidden="true">▾</span>
      </summary>
      <div class="kpigrid">
        {items.map(it => { const d = delta(it); return (
          <div class="stat"><div class="l">{it.label}</div><div class="v">{it.val}</div><div class="d">{it.sub}</div>
            {d && <div class={'delta ' + d.cls}>{d.txt} <span class="hint">{t('kpi.vsPrev')}</span></div>}</div>); })}
      </div>
    </details>
  );
}

function PlanView({ w, r, k, prevK, rep, plan, setEdit, onGoConfig }: Props) {
  const onEdit = () => setEdit(true);
  const [zone, setZone] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ref = useRef<{ G: Geo; P: Player; fx: FxLayer; raf: number; last: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [view, setView] = useState<{ t: number; S: PlayState } | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const start = Math.max(0, Math.min(...w.shifts.filter(s => s.days.some(Boolean)).map(s => hm(s.start) ?? 0), ...w.inbound.map(i => hm(i.arrival) ?? 0)) - 30);

  const draw = (now?: number) => {
    const c = ref.current;
    if (!c) return;
    const s = nearestSample(r.samples, c.P.t);
    renderPlan(c.G, c.P.S, c.P.t, w, r, s);
    if (now != null) c.fx.step(now);
  };
  const publish = () => { const c = ref.current; if (c) setView({ t: c.P.t, S: { ...c.P.S } }); };

  useEffect(() => {
    if (!svgRef.current) return;
    if (ref.current) { cancelAnimationFrame(ref.current.raf); ref.current.fx.clear(); }
    const G = buildPlan(svgRef.current, w, plan);
    const P = new Player(w, r);
    ref.current = { G, P, fx: new FxLayer(G), raf: 0, last: 0 };
    P.seek(start);
    setPlaying(false);
    draw();
    publish();
    return () => { if (ref.current) cancelAnimationFrame(ref.current.raf); };
  }, [r, plan]);
  /* zona elegida: se resalta en el plano y se abre su panel */
  useEffect(() => {
    svgRef.current?.querySelectorAll('.zhit.sel').forEach(e => e.classList.remove('sel'));
    if (zone) svgRef.current?.querySelector(`.zhit[data-zone="${CSS.escape(zone)}"]`)?.classList.add('sel');
  }, [zone, r, plan]);

  const pause = () => { const c = ref.current; if (c) cancelAnimationFrame(c.raf); setPlaying(false); publish(); };
  const play = () => {
    const c = ref.current;
    if (!c) return;
    if (c.P.t >= c.P.end) { c.P.seek(start); c.fx.clear(); }
    setPlaying(true);
    c.last = performance.now();
    let lastPub = 0;
    const loop = (now: number) => {
      const dt = Math.min(100, now - c.last);
      c.last = now;
      let tt = c.P.t + (dt / 1000) * speedRef.current;
      if (tt >= c.P.end) { tt = c.P.end; c.P.advance(tt); draw(now); pause(); return; }
      c.P.advance(tt, c.fx.handler);
      draw(now);
      if (now - lastPub > 150) { publish(); lastPub = now; }
      c.raf = requestAnimationFrame(loop);
    };
    c.raf = requestAnimationFrame(loop);
  };
  const seek = (tt: number) => { const c = ref.current; if (!c) return; cancelAnimationFrame(c.raf); setPlaying(false); c.fx.clear(); c.P.seek(tt); draw(); publish(); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const tt = view?.t ?? start, S = view?.S;
  const shiftsNow = activeShifts(w, tt);
  const smp = nearestSample(r.samples, tt);
  const anyDuty = smp ? PROCESSES.some(p => smp.duty[p] > 0) : false;
  const phase = shiftsNow.length ? 'work' : anyDuty ? 'ot' : 'off';
  const end = ref.current?.P.end ?? 7 * DAY;
  const totU = r.totals.boxes + r.totals.ulds + r.totals.loose;
  const totRv = r.groups.filter(g => g.reverify).reduce((a, g) => a + g.pkgs, 0);
  const totBr = r.groups.filter(g => g.dest === 'branch').reduce((a, g) => a + g.pkgs, 0);
  const row = (l: string, a: number, b: number) => (
    <><div class="kv"><span>{l}</span><b>{nf(a)} / {nf(b)}</b></div><div class="pbar"><i style={{ width: `${b ? Math.min(100, (a / b) * 100) : 0}%` }} /></div></>
  );
  const dayLabel = (x: number) => `${t('d' + (Math.floor(x / DAY) % 7))}${x >= 7 * DAY ? ' (' + t('nextWeek') + ')' : ''} ${fmtHM(x)}`;

  return (
    <>
    <KpiBar k={k} prevK={prevK} rep={rep} />
    <div class="simgrid">
      <div class="card">
        <div class="ctl">
          <div class="clock">{dayLabel(tt)}</div>
          <span class={'phase ' + (phase === 'work' ? 'work' : phase === 'ot' ? 'ot' : '')}>{phase === 'work' ? shiftsNow.join(' + ') : t('phase.' + phase)}</span>
          <button class="btn pri" onClick={() => (playing ? pause() : play())}>{playing ? t('plan.pause') : t('plan.play')}</button>
          <button class="btn" title={t('plan.reset')} onClick={() => seek(start)}>⟲</button>
          <select value={speed} onChange={e => setSpeed(+e.currentTarget.value)}>{SPEEDS.map(s => <option value={s}>{t('plan.speed', { n: s })}</option>)}</select>
          <input type="range" class="slider" min={0} max={end} step={1} value={tt} onInput={e => seek(+e.currentTarget.value)} />
          <button class="btn" onClick={() => seek(end)}>{t('plan.end')}</button>
          <button class="btn" onClick={() => { pause(); onEdit(); }}>{t('ed.open')}</button>
        </div>
        <div class="daybar">{[0, 1, 2, 3, 4, 5, 6].map(d => <button class={Math.floor(tt / DAY) === d ? 'on' : ''} onClick={() => seek(d * DAY + start % DAY)}>{t('d' + d)}</button>)}</div>
        <div class="planwrap"><svg ref={svgRef} id="plan" xmlns="http://www.w3.org/2000/svg" onClick={e => { const z = (e.target as Element).closest('[data-zone]'); setZone(z ? z.getAttribute('data-zone') : null); }} /></div>
        <div class="legend">
          <span><i style={{ background: 'var(--orange)' }} />{t('plan.legendRv')}</span>
          <span><i style={{ background: 'var(--green)' }} />{t('plan.legendDir')}</span>
          <span><i style={{ border: '1.5px dashed var(--muted)' }} />{t('plan.legendClosed')}</span>
          <span class="hint">{t('plan.clickZone')}</span>
        </div>
      </div>
      <div class="side">
        {zone && <ZonePanel zone={zone} w={w} r={r} onClose={() => setZone(null)} onGoConfig={onGoConfig} />}
        {!zone && <>
        <div class="card">
          <h2>{t('live.title')}</h2>
          {S && <>
            {row(t('live.trucks'), S.trucks, r.inbound.length)}
            {row(t('live.unloaded'), S.unl, totU)}
            {row(t('live.sorted'), S.sorted, r.totals.pkgs)}
            {totRv > 0 && row(t('live.rv'), S.rv, totRv)}
            {totBr > 0 && row(t('live.br'), S.br, totBr)}
            {row(t('live.rc0'), S.rc0, r.totals.pkgs)}
            {totBr > 0 && row(t('live.picked'), S.picked, totBr)}
            {r.hospital.in > 0 && row(t('live.hospital'), S.hosR + S.hosD, r.hospital.in)}
          </>}
        </div>
        <div class="card">
          <h2>{t('live.workers')}</h2>
          <div class="sub">{t('live.workersSub')}</div>
          {S && PROCESSES.map(p => (
            <div class="role"><div class="top"><span>{t('p.' + p)}</span><b>{smp?.busy[p] ?? 0} / {smp?.duty[p] ?? 0}</b></div>
              <div class="pbar"><i style={{ width: `${smp?.duty[p] ? (smp.busy[p] / smp.duty[p]) * 100 : 0}%` }} /></div></div>
          ))}
        </div>
        </>}
      </div>
    </div>
    </>
  );
}
