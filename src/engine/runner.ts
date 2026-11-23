/* Ejecuta simulaciones en un Web Worker (no bloquea la pantalla). Si el
   navegador no permite crear el worker, corre en el hilo principal. */
import SimWorker from './worker?worker&inline';
import { simulate, type SimOptions, type SimResult } from './simulate';
import type { Warehouse } from '../model/types';

type Pending = { resolve: (v: { r: SimResult; ms: number }) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let workerFailed = false;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new SimWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; r?: SimResult; ms?: number; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error || !e.data.r) p.reject(new Error(e.data.error ?? 'error'));
      else p.resolve({ r: e.data.r, ms: e.data.ms ?? 0 });
    };
    worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(p => p.reject(new Error('worker'))); pending.clear(); };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function runSimulation(w: Warehouse, opt: SimOptions = {}): Promise<{ r: SimResult; ms: number; inWorker: boolean }> {
  const wk = getWorker();
  const direct = () => { const t0 = performance.now(); const r = simulate(w, opt); return { r, ms: performance.now() - t0, inWorker: false }; };
  if (!wk) return Promise.resolve().then(direct);
  const id = ++seq;
  return new Promise<{ r: SimResult; ms: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    wk.postMessage({ id, w, opt });
  }).then(x => ({ ...x, inWorker: true }), () => direct());
}
