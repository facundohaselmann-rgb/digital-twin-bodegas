import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Warehouse } from '../model/types';

export type Updater = (fn: (w: Warehouse) => void) => void;
export const WhContext = createContext<{ w: Warehouse; update: Updater } | null>(null);

export function useWh(): { w: Warehouse; update: Updater } {
  const c = useContext(WhContext);
  if (!c) throw new Error('WhContext');
  return c;
}

type Obj = Record<string, unknown>;
const key = (k: string): string | number => (/^\d+$/.test(k) ? +k : k);

export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((x, k) => (x == null ? x : (x as Obj)[key(k) as string]), o);
}
export function setPath(o: unknown, path: string, v: unknown): void {
  const ks = path.split('.');
  let x = o as Obj;
  for (let i = 0; i < ks.length - 1; i++) x = x[key(ks[i]) as string] as Obj;
  x[key(ks[ks.length - 1]) as string] = v;
}
