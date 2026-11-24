import { useEffect, useRef, useState } from 'preact/hooks';
import { WhContext, type Updater } from './store';
import { ConfigTab } from './tabs/ConfigTab';
import { PlanTab } from './tabs/PlanTab';
import { ResultsTab } from './tabs/ResultsTab';
import { getLang, nf, setLang, t, type Lang } from '../i18n';
import type { Project, Warehouse, Warning } from '../model/types';
import { blankWarehouse, jamaicaWarehouse, newProject } from '../model/defaults';
import { normalize } from '../model/normalize';
import { runSimulation } from '../engine/runner';
import type { SimResult } from '../engine/simulate';
import { autosave, fsSupported, isSaved, loadAutosave, markSaved, openProjectFs, readProjectFile, saveProject, type FsHandle } from '../storage/project';

type Tab = 'plan' | 'results' | 'config';
interface Run { w: Warehouse; r: SimResult; warnings: Warning[]; ms: number }

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
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('dtw-tab') as Tab) || 'plan'; } catch { return 'plan'; } });
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const update: Updater = fn => {
    setProject(p => { const n = structuredClone(p); fn(n.warehouse); n.name = n.warehouse.name; n.updatedAt = new Date().toISOString(); return n; });
    setDirty(true);
  };

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
          setRun({ w, r: res.r, warnings: [...warnings, ...res.r.warnings], ms: res.ms });
          setError('');
          setRunning(false);
        }).catch(fail);
      } catch (e) { fail(e); }
    }, 200);
    return () => clearTimeout(id);
  }, [project]);

  useEffect(() => { try { localStorage.setItem('dtw-tab', tab); } catch { /* ignorar */ } }, [tab]);
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
  const loadProject = (p: Project, h: FsHandle | null) => { setProject(p); setHandle(h); setDirty(false); markSaved(p); say(t('file.opened', { name: p.name })); };
  const doOpen = async () => {
    if (dirty && !confirm(t('file.confirmNew'))) return;
    if (fsSupported()) {
      try { const r = await openProjectFs(); if (r) loadProject(r.project, r.handle); }
      catch (e) { if ((e as Error).name !== 'AbortError') say(t('file.invalid')); }
    } else fileRef.current?.click();
  };
  const doNew = (blank: boolean) => {
    if (dirty && !confirm(t('file.confirmNew'))) return;
    setProject(newProject(blank ? blankWarehouse() : jamaicaWarehouse()));
    setHandle(null);
    setDirty(false);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(e.shiftKey); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const switchLang = (l: Lang) => { setLang(l); setLangState(l); document.documentElement.lang = l; };

  return (
    <WhContext.Provider value={{ w: project.warehouse, update }}>
      <header>
        <div class="brand">
          <h1>{t('app.title')}</h1>
          <small>{project.warehouse.name}{handle ? ` · ${handle.name}` : ''} <span class={'dirty ' + (dirty ? 'on' : '')}>{dirty ? '● ' + t('file.unsaved') : '✓ ' + t('file.saved')}</span></small>
        </div>
        <div class="filebar">
          <details class="menu">
            <summary class="btn">{t('file.new')} ▾</summary>
            <div class="menu-list">
              <button onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; doNew(false); }}>{t('file.newJamaica')}</button>
              <button onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; doNew(true); }}>{t('file.newBlank')}</button>
            </div>
          </details>
          <button class="btn" onClick={doOpen}>{t('file.open')}</button>
          <button class="btn pri" onClick={() => doSave(false)} title="Ctrl+S">{t('file.save')}</button>
          <button class="btn" onClick={() => doSave(true)} title="Ctrl+Shift+S">{t('file.saveAs')}</button>
          <input ref={fileRef} type="file" accept=".dtwin,.json" hidden onChange={async e => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            try { loadProject(await readProjectFile(f), null); } catch { say(t('file.invalid')); }
          }} />
          <div class="langsw" role="group" aria-label={t('lang')}>
            {(['es', 'en'] as Lang[]).map(l => <button class={lang === l ? 'on' : ''} onClick={() => switchLang(l)}>{l.toUpperCase()}</button>)}
          </div>
        </div>
        <nav>
          {(['plan', 'results', 'config'] as Tab[]).map(k => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t('tab.' + k)}</button>)}
        </nav>
        <span class="runinfo">{running ? t('run.running') : run ? t('run.info', { pkgs: nf(run.r.totals.pkgs), ms: nf(run.ms), seed: run.r.seed }) : ''}</span>
      </header>
      <main>
        {error && <div class="warns"><div class="warn">⚠ {t('run.error', { msg: error })}</div></div>}
        {run && run.warnings.length > 0 && <div class="warns">{run.warnings.map(x => <div class="warn">⚠ {warnText(x)}</div>)}</div>}
        {run && tab === 'plan' && <PlanTab key={lang} w={run.w} r={run.r} />}
        {run && tab === 'results' && <ResultsTab w={run.w} r={run.r} />}
        {tab === 'config' && <><div class="cfgbar"><span class="note">{t('cfg.note')}</span></div><ConfigTab /></>}
      </main>
      <div class={'toast ' + (toast ? 'on' : '')}>{toast}</div>
    </WhContext.Provider>
  );
}
