/// <reference lib="webworker" />
import { simulate, type SimOptions } from './simulate';
import type { Warehouse } from '../model/types';

self.onmessage = (e: MessageEvent<{ id: number; w: Warehouse; opt: SimOptions }>) => {
  const { id, w, opt } = e.data;
  try {
    const t0 = performance.now();
    const r = simulate(w, opt);
    (self as unknown as Worker).postMessage({ id, r, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
