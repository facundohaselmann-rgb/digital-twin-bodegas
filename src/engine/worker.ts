/// <reference lib="webworker" />
import { simulate, type SimOptions } from './simulate';
import { kpis } from './kpis';
import type { Warehouse } from '../model/types';

type Msg = { id: number; kind?: 'run'; w: Warehouse; opt: SimOptions } | { id: number; kind: 'batch'; ws: Warehouse[]; n: number };
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.kind === 'batch') {
      // corridas múltiples: misma bodega con semillas consecutivas, sin registro de animación
      const out = m.ws.map(() => [] as ReturnType<typeof kpis>[]);
      const total = m.ws.length * m.n;
      m.ws.forEach((w, i) => { for (let k = 0; k < m.n; k++) { out[i].push(kpis(simulate(w, { seed: w.seed + k, log: false }), w)); post({ id: m.id, progress: (i * m.n + k + 1) / total }); } });
      post({ id: m.id, batch: out });
      return;
    }
    const t0 = performance.now();
    const r = simulate(m.w, m.opt);
    post({ id: m.id, r, ms: performance.now() - t0 });
  } catch (err) {
    post({ id: m.id, error: String(err) });
  }
};
