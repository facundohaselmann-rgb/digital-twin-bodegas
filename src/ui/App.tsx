import { useEffect, useRef, useState } from 'preact/hooks';
import { WhContext, type Updater } from './store';
import { ConfigTab, SECTIONS, WARN_SECTION, type Section } from './tabs/ConfigTab';
import { PlanTab } from './tabs/PlanTab';
import { ResultsTab } from './tabs/ResultsTab';
import { ReportTab } from './tabs/ReportTab';
import { ScenariosTab, type Comparison, type KpiSummaries } from './tabs/ScenariosTab';
import { getLang, nf, setLang, t, type Lang } from '../i18n';
import type { Project, Warehouse, Warning } from '../model/types';
import { blankWarehouse, jamaicaWarehouse, modelWarehouse, newProject, uid } from '../model/defaults';
import { normalize } from '../model/normalize';
import { CANCELLED, runBatch, runSimulation } from '../engine/runner';
import { KPI_KEYS, kpis, summarize, type Kpis } from '../engine/kpis';
import type { SimResult } from '../engine/simulate';
import { autosave, fsSupported, isSaved, loadAutosave, markSaved, openProjectFs, readProjectFile, saveProject, type FsHandle } from '../storage/project';

type Tab = 'plan' | 'results' | 'scenarios' | 'config' | 'report';
const TABS: Tab[] = ['plan', 'results', 'scenarios', 'config', 'report'];
const UNDO_MAX = 20;
const summarizeRuns = (runs: Kpis[]): KpiSummaries => Object.fromEntries(KPI_KEYS.map(k => [k, summarize(runs.map(x => x[k]))])) as KpiSummaries;
interface Run { w: Warehouse; r: SimResult; warnings: Warning[]; ms: number; k: Kpis }
const stored = <T extends string>(key: string, ok: readonly T[], d: T): T => { try { const v = localStorage.getItem(key) as T; return ok.includes(v) ? v : d; } catch { return d; } };

function warnText(x: Warning): string {
  const p = { ...(x.params ?? {}) };
  if (typeof p.process === 'string') p.process = t('p.' + p.process);
  return t(x.key, p);
}

export function App() {
  const [lang, setLangState] = useState<Lang>(getLang());
  const [init] = useState(() => { const a = loadAutosave(); return { p: a ?? newProject(), dirty: !!a && !isSaved(a) }; });
  const [project, setProject] = useState<Project>(init.p);
  const [handle, setHandle] = useState<FsHandle | null>(null);
  const [dirty, setDirty] = useState(init.dirty);
  const [run, setRun] = useState<Run | null>(null);
  const [prevK, setPrevK] = useState<Kpis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [rep, setRep] = useState<{ s: KpiSummaries | null; progress: number | null }>({ s: null, progress: null });
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [cmpProgress, setCmpProgress] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>(() => stored('dtw-tab', TABS, 'plan'));
  const [section, setSection] = useState<Section>(() => stored('dtw-section', SECTIONS, 'general'));
  const [planEdit, setPlanEdit] = useState(false);
  const [toast, setToast] = useState('');
  const [undoN, setUndoN] = useState(0);
  /** Conclusión del reporte editada a mano; null = la automática. Vive acá para no perderse al cambiar de pestaña. */
  const [repText, setRepText] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  /** Deshacer: hasta 20 estados anteriores del proyecto. */
  const history = useRef<Project[]>([]);
  const lastK = useRef<Kpis | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const update: Updater = fn => {
    updateProject(n => { fn(n.warehouse); n.name = n.warehouse.name; });
  };
  /** Cambios a nivel proyecto; la bodega editada siempre es la del escenario activo. */
  const updateProject = (fn: (p: Project) => void) => {
    setProject(p => {
      history.current = [...history.current.slice(1 - UNDO_MAX), p];
      const n = structuredClone(p);
      fn(n);
      const act = n.scenarios.find(s => s.id === n.activeScenario) ?? n.scenarios[0];
      n.activeScenario = act.id; n.warehouse = act.warehouse;
      n.updatedAt = new Date().toISOString();
      return n;
    });
    setDirty(true);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setProject(prev);
    setDirty(true);
    say(t('undo.done', { n: history.current.length }));
  };
  const resetHistory = () => { history.current = []; lastK.current = null; setPrevK(null); setRepText(null); };
  useEffect(() => setUndoN(history.current.length), [project]);

  /* simula cada vez que cambia la bodega (con una pequeña espera para agrupar cambios) */
  useEffect(() => {
    const id = setTimeout(() => {
      autosave(project);
      const my = ++seq.current;
      // si algo falla no se muestran resultados viejos como si fueran de esta configuración
      const fail = (e: unknown) => { if (my !== seq.current) return; setRun(null); setError(String(e)); setRunning(false); };
      try {
        const w = structuredClone(project.warehouse);
        const warnings = normalize(w);
        setRunning(true);
        runSimulation(w).then(res => {
          if (my !== seq.current) return;
          const k = kpis(res.r, w);
          setPrevK(lastK.current); lastK.current = k; // el cambio frente a la corrida anterior es el impacto del último ajuste
          setRun({ w, r: res.r, warnings: [...warnings, ...res.r.warnings], ms: res.ms, k });
          setError('');
          setRunning(false);
          // corridas múltiples en segundo plano; se cancelan si cambia algo
          setRep({ s: null, progress: 0 });
          runBatch([w], w.replicas, p => { if (my === seq.current) setRep({ s: null, progress: p }); })
            .then(rs => { if (my === seq.current) setRep({ s: summarizeRuns(rs[0]), progress: null }); })
            .catch(e => { if ((e as Error).message !== CANCELLED && my === seq.current) setRep({ s: null, progress: null }); });
        }).catch(fail);
      } catch (e) { fail(e); }
    }, 200);
    return () => clearTimeout(id);
  }, [project]);

  useEffect(() => { try { localStorage.setItem('dtw-tab', tab); localStorage.setItem('dtw-section', section); } catch { /* ignorar */ } }, [tab, section]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  const doSave = async (ask = false) => {
    try {
      const res = await saveProject(project, handle, ask);
      setHandle(res.handle);
      setDirty(false);
      markSaved(project);
      say(res.mode === 'fs' ? t('file.savedTo', { name: res.name }) : t('file.downloaded', { name: res.name }));
    } catch (e) { if ((e as Error).name !== 'AbortError') say(String(e)); }
  };
  const loadProject = (p: Project, h: FsHandle | null) => { setProject(p); setHandle(h); setDirty(false); markSaved(p); resetHistory(); say(t('file.opened', { name: p.name })); };
  const doOpen = async () => {
    if (dirty && !confirm(t('file.confirmNew'))) return;
    if (fsSupported()) {
      try { const r = await openProjectFs(); if (r) loadProject(r.project, r.handle); }
      catch (e) { if ((e as Error).name !== 'AbortError') say(t('file.invalid')); }
    } else fileRef.current?.click();
  };
  const doNew = (kind: 'jamaica' | 'model' | 'blank') => {
    if (dirty && !confirm(t('file.confirmNew'))) return;
    setProject(newProject(kind === 'blank' ? blankWarehouse() : kind === 'model' ? modelWarehouse() : jamaicaWarehouse()));
    setCmp(null);
    setHandle(null);
    setDirty(false);
    resetHistory();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); doSave(e.shiftKey); }
      // en un campo de texto, Ctrl+Z deshace lo que se escribe; afuera, deshace el último cambio de la bodega
      else if (key === 'z' && !e.shiftKey && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); undo(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const compare = () => {
    const at = project.updatedAt, n = project.warehouse.replicas, names = project.scenarios.map(s => s.name);
    const activeIdx = project.scenarios.findIndex(s => s.id === project.activeScenario);
    const ws = project.scenarios.map(s => { const x = structuredClone(s.warehouse); normalize(x); return x; });
    setCmpProgress(0);
    runBatch(ws, n, setCmpProgress).then(rs => {
      const s = rs.map(summarizeRuns);
      setCmp({ names, s, at, n });
      if (at === project.updatedAt) setRep({ s: s[activeIdx], progress: null }); // ya tenemos las corridas del escenario activo
    }).catch(() => undefined).finally(() => setCmpProgress(null));
  };

  const switchLang = (l: Lang) => { setLang(l); setLangState(l); document.documentElement.lang = l; };
  const goConfig = (s: Section) => { setSection(s); setTab('config'); };
  /* avisos: en Configuración, los de la sección abierta (y un contador por sección); en el resto, todos */
  const warns = run?.warnings ?? [];
  const warnCount = (s: Section) => warns.filter(x => WARN_SECTION[x.key] === s).length;
  const shownWarns = tab === 'config' ? warns.filter(x => WARN_SECTION[x.key] === section) : warns;
  // una comparación corrida antes del último cambio ya no vale para Resultados ni para el reporte
  const freshCmp = cmp && cmp.at === project.updatedAt ? cmp : null;

  return (
    <WhContext.Provider value={{ w: project.warehouse, update }}>
      <div class="app">
        <aside class="sidebar">
          <div class="logo">
            <svg aria-hidden="true" viewBox="0 0 120 120"><rect x="34" y="6" width="80" height="80" rx="10" fill="none" stroke="#76bd1d" stroke-width="12" /><rect x="6" y="34" width="80" height="80" rx="10" fill="#ffffff" /></svg>
            <b>MAT</b><small>{t('app.sub')}</small>
          </div>
          <div class="proj">
            <small>{t('proj')}</small>
            <b>{project.warehouse.name}</b>
            {handle && <span class="file">{handle.name}</span>}
            <span class={'dirty ' + (dirty ? 'on' : '')}>{dirty ? '● ' + t('file.unsaved') : '✓ ' + t('file.saved')}</span>
          </div>
          <div class="filebar">
            <details class="menu">
              <summary class="btn sm">{t('file.new')} ▾</summary>
              <div class="menu-list">
                {([['jamaica', 'file.newJamaica'], ['model', 'file.newModel'], ['blank', 'file.newBlank']] as const).map(([k, l]) =>
                  <button onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; doNew(k); }}>{t(l)}</button>)}
              </div>
            </details>
            <button class="btn sm" onClick={doOpen}>{t('file.open')}</button>
            <button class="btn sm" onClick={() => doSave(true)} title="Ctrl+Shift+S">{t('file.saveAs')}</button>
            <input ref={fileRef} type="file" accept=".dtwin,.json" hidden onChange={async e => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!f) return;
              try { loadProject(await readProjectFile(f), null); } catch { say(t('file.invalid')); }
            }} />
          </div>
          <nav aria-label={t('nav')}>
            {TABS.map(k => <button class={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); setPlanEdit(false); }}>{t('tab.' + k)}</button>)}
          </nav>
          {tab === 'config' && (
            <div class="subnav" role="group" aria-label={t('tab.config')}>
              {SECTIONS.map((s, i) => { const n = warnCount(s); return (
                <button class={section === s ? 'on' : ''} aria-current={section === s ? 'true' : undefined} onClick={() => setSection(s)}>
                  <span>{i + 1} · {t('sec.' + s)}</span>{n > 0 && <span class="cnt" title={t('sec.warns', { n })}>{n}</span>}
                </button>); })}
            </div>
          )}
          <div class="side-foot">
            <span class="runinfo">{running ? t('run.running') : run ? t('run.info', { pkgs: nf(run.r.totals.pkgs), ms: nf(run.ms), seed: run.r.seed }) : ''}</span>
            <div class="langsw" role="group" aria-label={t('lang')}>
              {(['es', 'en'] as Lang[]).map(l => <button class={lang === l ? 'on' : ''} onClick={() => switchLang(l)}>{l.toUpperCase()}</button>)}
            </div>
          </div>
        </aside>

        <div class="main">
          <div class="topbar">
            <h1>{tab === 'config' ? t('sec.' + section) : t('tab.' + tab)}</h1>
            <label>{t('sc.scenario')}
              <select value={project.activeScenario} onChange={e => { const id = e.currentTarget.value; updateProject(p => { p.activeScenario = id; }); }}>
                {project.scenarios.map(s => <option value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button class="btn" onClick={undo} disabled={!undoN} title={t('undo.hint')}>↶ {t('undo')}{undoN ? ` (${undoN})` : ''}</button>
            <button class="btn pri" onClick={() => doSave(false)} title="Ctrl+S">{t('file.save')}</button>
          </div>
          <main>
            {error && <div class="warns"><div class="warn">⚠ {t('run.error', { msg: error })}</div></div>}
            {shownWarns.length > 0 && !(tab === 'plan' && planEdit) && <div class="warns">{shownWarns.map(x => <div class="warn">⚠ {warnText(x)}</div>)}</div>}
            {run && tab === 'plan' && <PlanTab key={lang} w={run.w} r={run.r} k={run.k} prevK={prevK} rep={rep.s} plan={project.plan ?? null} onProject={updateProject} say={say}
              edit={planEdit} setEdit={setPlanEdit} onGoConfig={goConfig} />}
            {run && tab === 'results' && <ResultsTab w={run.w} r={run.r} rep={rep} cmp={freshCmp} onReport={() => setTab('report')} />}
            {tab === 'scenarios' && <ScenariosTab project={project} cmp={cmp} progress={cmpProgress} stale={!!cmp && cmp.at !== project.updatedAt} onCompare={compare}
              onActivate={id => updateProject(p => { p.activeScenario = id; })}
              onDuplicate={() => updateProject(p => { const a = p.scenarios.find(s => s.id === p.activeScenario)!; const c = { id: uid('e'), name: t('sc.copy', { name: a.name }), warehouse: structuredClone(a.warehouse) }; p.scenarios.push(c); p.activeScenario = c.id; })}
              onRename={(id, name) => updateProject(p => { p.scenarios.find(s => s.id === id)!.name = name; })}
              onDelete={id => updateProject(p => { p.scenarios = p.scenarios.filter(s => s.id !== id); })} />}
            {tab === 'config' && <ConfigTab section={section} onEditLayout={() => { setTab('plan'); setPlanEdit(true); }} />}
            {run && tab === 'report' && <ReportTab w={run.w} r={run.r} k={run.k} rep={rep.s} cmp={freshCmp} text={repText} setText={setRepText} plan={project.plan ?? null} scenario={project.scenarios.find(s => s.id === project.activeScenario)?.name ?? ''} />}
          </main>
        </div>
      </div>
      <div class={'toast ' + (toast ? 'on' : '')} role="status">{toast}</div>
    </WhContext.Provider>
  );
}
