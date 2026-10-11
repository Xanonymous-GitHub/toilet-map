import type { Envelope, Region } from "./core";

const NAME = "relief-pwa";
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("regions");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveRegion(region: Region, data: Envelope) {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("regions", "readwrite");
      t.objectStore("regions").put(data, region);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
export async function readRegion(region: Region): Promise<Envelope | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("regions").objectStore("regions").get(region);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export function readPreference<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disable local storage. */
  }
}
