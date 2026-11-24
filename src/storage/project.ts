/* Archivos de proyecto (.dtwin). En Chrome/Edge se guardan directo en la
   carpeta elegida (por ejemplo, la carpeta de Google Drive para escritorio)
   con la File System Access API; en otros navegadores se descargan. */
import type { Project, Scenario, Warehouse } from '../model/types';
import { defaultScenarios, jamaicaWarehouse, uid } from '../model/defaults';
import { normalize } from '../model/normalize';

/* Tipos mínimos de la File System Access API (no incluidos en lib.dom de TS). */
interface FsWritable { write(data: string): Promise<void>; close(): Promise<void> }
export interface FsHandle { name: string; createWritable(): Promise<FsWritable>; getFile(): Promise<File> }
type PickerOpts = { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[]; multiple?: boolean };
interface FsWindow { showSaveFilePicker?: (o: PickerOpts) => Promise<FsHandle>; showOpenFilePicker?: (o: PickerOpts) => Promise<FsHandle[]> }

const TYPES = [{ description: 'Digital Twin (.dtwin)', accept: { 'application/json': ['.dtwin'] } }];
const AUTOSAVE_KEY = 'dtw-autosave-v2';

export const fsSupported = (): boolean => typeof (window as unknown as FsWindow).showSaveFilePicker === 'function';

export function serialize(p: Project): string { return JSON.stringify(p, null, 2); }

export function parseProject(text: string): Project {
  const o = JSON.parse(text);
  if (!o || o.format !== 'dtwin' || !o.warehouse) throw new Error('invalid');
  if (o.version !== 2) throw new Error('version');
  // completa lo que falte con valores por defecto y valida; si no se puede, el archivo se rechaza
  const fix = (w: unknown): Warehouse => { const x = { ...jamaicaWarehouse(), ...(w as object) } as Warehouse; normalize(x); return x; };
  o.warehouse = fix(o.warehouse);
  // proyectos sin escenarios (iteraciones 1 y 2) arrancan con los 3 escenarios por defecto
  o.scenarios = Array.isArray(o.scenarios) && o.scenarios.length
    ? o.scenarios.map((s: Scenario) => ({ id: s.id || uid('e'), name: String(s.name || 'Escenario'), warehouse: fix(s.warehouse) }))
    : defaultScenarios(o.warehouse);
  const act = o.scenarios.find((s: Scenario) => s.id === o.activeScenario) ?? o.scenarios[0];
  o.activeScenario = act.id;
  act.warehouse = o.warehouse; // la bodega que se edita es la del escenario activo
  return o as Project;
}

const fileName = (p: Project): string => (p.name || 'bodega').replace(/[\\/:*?"<>|]+/g, '_').trim() + '.dtwin';

export type SaveResult = { handle: FsHandle | null; name: string; mode: 'fs' | 'download' };

/** Guarda en el archivo abierto; si no hay, pide ubicación (o descarga si no hay soporte). */
export async function saveProject(p: Project, handle: FsHandle | null, forceAsk = false): Promise<SaveResult> {
  const text = serialize(p);
  const W = window as unknown as FsWindow;
  if (W.showSaveFilePicker) {
    let h = handle;
    if (!h || forceAsk) h = await W.showSaveFilePicker({ suggestedName: fileName(p), types: TYPES });
    const wr = await h.createWritable();
    await wr.write(text);
    await wr.close();
    return { handle: h, name: h.name, mode: 'fs' };
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = fileName(p);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return { handle: null, name: a.download, mode: 'download' };
}

/** Abre un .dtwin con el selector nativo; devuelve null si el navegador no lo soporta. */
export async function openProjectFs(): Promise<{ project: Project; handle: FsHandle } | null> {
  const W = window as unknown as FsWindow;
  if (!W.showOpenFilePicker) return null;
  const [h] = await W.showOpenFilePicker({ types: TYPES, multiple: false });
  const f = await h.getFile();
  return { project: parseProject(await f.text()), handle: h };
}

export async function readProjectFile(f: File): Promise<Project> { return parseProject(await f.text()); }

export function autosave(p: Project): void {
  try { localStorage.setItem(AUTOSAVE_KEY, serialize(p)); } catch { /* sin espacio o bloqueado */ }
}
/* Marca de "guardado en archivo": si el autoguardado es más nuevo, hay cambios que no están en el .dtwin. */
export function markSaved(p: Project): void { try { localStorage.setItem('dtw-saved-at', p.updatedAt); } catch { /* ignorar */ } }
export function isSaved(p: Project): boolean { try { return localStorage.getItem('dtw-saved-at') === p.updatedAt; } catch { return false; } }
export function loadAutosave(): Project | null {
  try { const s = localStorage.getItem(AUTOSAVE_KEY); return s ? parseProject(s) : null; } catch { return null; }
}

export function download(name: string, text: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
