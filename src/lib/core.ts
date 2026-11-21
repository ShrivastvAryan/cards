// Shared building blocks for every game: players, rooms, errors, helpers.

export type GameKind = "teenpatti" | "bluff" | "colorrush" | "oldmaid";

export const STARTING_CHIPS = 1000;
export const OFFLINE_MS = 45_000;
export const AUTO_NEXT_MS = 8_000;

export interface Player {
  id: string;
  token: string;
  name: string;
  chips: number; // Teen Patti money
  score: number; // round wins / points in other games
  lastSeen: number;
  bot?: boolean;
}

export interface Room<S = unknown> {
  id: string;
  game: GameKind;
  options: Record<string, unknown>;
  hostId: string;
  players: Player[]; // seat order
  log: { id: number; text: string }[];
  logSeq: number;
  /** Table chat: memory only, gone when the table closes. */
  chat: ChatMessage[];
  chatSeq: number;
  lastChatAt: Record<string, number>;
  version: number;
  touched: number;
  state: S;
}

export interface ChatMessage {
  id: number;
  by: string;
  name: string;
  text: string;
  at: number;
}

export type Action = { type: string; [k: string]: unknown };

/** What every game module implements. */
export interface Engine<S = unknown> {
  title: string;
  minPlayers: number;
  maxPlayers: number;
  init(room: Room<S>): S;
  /** Deal / start a new round. Throws GameError if it can't. */
  start(room: Room<S>): void;
  /** Is a round currently being played? */
  live(room: Room<S>): boolean;
  /** Is this player still playing in the live round? */
  inRound(room: Room<S>, id: string): boolean;
  apply(room: Room<S>, p: Player, a: Action): void;
  /** Timers + computer players. Return true if state changed. */
  tick(room: Room<S>, now: number): boolean;
  /** Called before a player is removed from the table. */
  onRemove(room: Room<S>, id: string): void;
  view(room: Room<S>, viewer: Player | null): Record<string, unknown>;
}

export class GameError extends Error {}
export const fail = (msg: string): never => {
  throw new GameError(msg);
};

export const rid = (len: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") => {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
};

export function shuffle<T>(arr: T[]): T[] {
  const rand = new Uint32Array(arr.length);
  crypto.getRandomValues(rand);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function log(room: Room, text: string) {
  room.log.push({ id: ++room.logSeq, text });
  if (room.log.length > 50) room.log.splice(0, room.log.length - 50);
}

export function bump(room: Room) {
  room.version++;
  room.touched = Date.now();
}

export const nameOf = (room: Room, id: string) => room.players.find((p) => p.id === id)?.name ?? "Player";
export const playerOf = (room: Room, id: string) => room.players.find((p) => p.id === id);
export const isOnline = (p: Player, now = Date.now()) => !!p.bot || now - p.lastSeen < OFFLINE_MS;

/** Players who can be dealt into a new round. */
export const onlinePlayers = (room: Room, now = Date.now()) => room.players.filter((p) => isOnline(p, now));

/** Should a finished round roll into the next one automatically? */
export function readyForAutoNext(room: Room, endedAt: number | undefined, now: number, eligible: Player[]) {
  return (
    endedAt !== undefined &&
    now - endedAt > AUTO_NEXT_MS &&
    eligible.length >= 2 &&
    eligible.some((p) => !p.bot)
  );
}

/** Random delay before a computer player acts, so moves feel human. */
export const botDelay = (min = 900, spread = 1300) => Date.now() + min + Math.random() * spread;
