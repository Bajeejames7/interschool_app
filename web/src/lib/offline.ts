import { useSyncExternalStore } from "react";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ApiError, api } from "./api";

/**
 * Working without a connection.
 *
 * Three parts:
 * - the data the phone last saw is saved (React Query's cache, persisted to
 *   localStorage), so every screen still shows something offline;
 * - `online` tracks whether the server answered the last request;
 * - the outbox keeps changes made offline — check-ins and tally points — and
 *   sends them, in order, as soon as the server answers again. Both are safe
 *   to send late: a tally tap carries its own id so it is never counted
 *   twice, and a check-in simply sets the coach's answer.
 * Admin edits (roles, schedules, setup, people) need a connection, so two
 * admins can never make conflicting changes offline.
 */

const CACHE_KEY = "ambassadors.cache";
const OUTBOX_KEY = "ambassadors.outbox";

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const persister = createSyncStoragePersister({
  storage: storage(),
  key: CACHE_KEY,
  throttleTime: 0, // save at once: the app may be closed the moment after data arrives
});

/** Saved data older than this is thrown away rather than shown. */
export const SAVED_DATA_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// ---- a tiny store for "are we connected" and the outbox --------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let online = typeof navigator === "undefined" ? true : navigator.onLine;
let lastSync = Date.now();

export function reportConnection(ok: boolean): void {
  if (ok) lastSync = Date.now();
  if (ok !== online) {
    online = ok;
    emit();
    if (ok) void flushOutbox();
  }
}

export interface OutboxItem {
  id: string;
  path: string;
  method: "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** What it was, for the "waiting to sync" note. */
  label: string;
}

function readOutbox(): OutboxItem[] {
  try {
    return JSON.parse(storage()?.getItem(OUTBOX_KEY) ?? "[]");
  } catch {
    return [];
  }
}

let outbox: OutboxItem[] = readOutbox();

function saveOutbox(next: OutboxItem[]): void {
  outbox = next;
  try {
    storage()?.setItem(OUTBOX_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the item still waits in memory */
  }
  emit();
}

export function enqueue(item: Omit<OutboxItem, "id">): void {
  // A newer answer to the same question replaces the older one (a coach who
  // changes their check-in twice offline only needs the last one sent).
  const rest = item.method === "POST" ? outbox : outbox.filter((o) => o.path !== item.path);
  saveOutbox([...rest, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
}

/** Called after the outbox has been sent, so screens can reload from the server. */
let afterFlush: () => void = () => {};
export function onFlushed(fn: () => void): void {
  afterFlush = fn;
}

let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing || outbox.length === 0) return;
  flushing = true;
  let sent = 0;
  try {
    while (outbox.length > 0) {
      const item = outbox[0];
      try {
        await api(item.path, { method: item.method, body: item.body });
      } catch (err) {
        // Still no connection: stop and try again later.
        if (err instanceof ApiError && err.status === 0) break;
        // The server said no (e.g. the session was removed): drop it, it will
        // never succeed, and do not block everything behind it.
      }
      saveOutbox(outbox.slice(1));
      sent += 1;
    }
  } finally {
    flushing = false;
    if (sent > 0) afterFlush();
  }
}

export function clearOffline(): void {
  saveOutbox([]);
  try {
    storage()?.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function useConnection(): { online: boolean; lastSync: number; waiting: number } {
  const snapshot = useSyncExternalStore(subscribe, () => `${online}|${lastSync}|${outbox.length}`);
  const [o, t, w] = snapshot.split("|");
  return { online: o === "true", lastSync: Number(t), waiting: Number(w) };
}

// Try the outbox whenever there is a chance the connection is back.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOutbox());
  window.addEventListener("offline", () => reportConnection(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
  setInterval(() => void flushOutbox(), 15_000);
}
