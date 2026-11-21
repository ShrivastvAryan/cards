"use client";
import type { RoomView } from "./rooms";

export type { RoomView };
export interface Creds {
  playerId: string;
  token: string;
}

const key = (roomId: string) => `tp_room_${roomId.toUpperCase()}`;

export function loadCreds(roomId: string): Creds | null {
  try {
    const raw = localStorage.getItem(key(roomId));
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}
export function saveCreds(roomId: string, c: Creds) {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(c));
  } catch {}
}
export function clearCreds(roomId: string) {
  try {
    localStorage.removeItem(key(roomId));
  } catch {}
}
export function loadName() {
  try {
    return localStorage.getItem("tp_name") ?? "";
  } catch {
    return "";
  }
}
export function saveName(n: string) {
  try {
    localStorage.setItem("tp_name", n);
  } catch {}
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Network error" }));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
