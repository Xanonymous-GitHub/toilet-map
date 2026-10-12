import { isToilet } from "./api";
import type { Envelope, Region, Toilet } from "./core";

const NAME = "relief-pwa";
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 2);
    r.onupgradeneeded = () => {
      for (const store of ["regions", "toilets"])
        if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store);
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
  });
}
export async function saveToilet(toilet: Toilet) {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("toilets", "readwrite");
      transaction.objectStore("toilets").put(toilet, toilet.id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function readToilet(id: string): Promise<Toilet | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("toilets").objectStore("toilets").get(id);
      request.onsuccess = () =>
        resolve(isToilet(request.result) && request.result.id === id ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
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
    const serialized = JSON.stringify(value);
    if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
  } catch {
    /* Private browsing may disable local storage. */
  }
}
