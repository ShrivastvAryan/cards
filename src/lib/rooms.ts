// Room store + actions shared by all games. State lives in server memory.
import {
  type Action,
  bump,
  type Engine,
  fail,
  type GameKind,
  isOnline,
  log,
  type Player,
  rid,
  type Room,
  STARTING_CHIPS,
} from "./core";
import { bluff } from "./games/bluff";
import { colorRush } from "./games/colorrush";
import { oldMaid } from "./games/oldmaid";
import { teenPatti } from "./games/teenpatti";

export { GameError } from "./core";

export const ENGINES: Record<GameKind, Engine<never>> = {
  teenpatti: teenPatti as Engine<never>,
  bluff: bluff as Engine<never>,
  colorrush: colorRush as Engine<never>,
  oldmaid: oldMaid as Engine<never>,
};

const engineOf = (room: Room) => ENGINES[room.game] as unknown as Engine<unknown>;

const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
type Store = Map<string, Room>;
const g = globalThis as unknown as { __cardRooms?: Store };
const rooms: Store = (g.__cardRooms ??= new Map());

const cleanName = (name: unknown) => {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  return n || fail("Please enter a name");
};

function newPlayer(name: string, bot = false): Player {
  return { id: rid(10), token: rid(24), name, chips: STARTING_CHIPS, score: 0, lastSeen: Date.now(), bot };
}

function gc() {
  const now = Date.now();
  for (const [id, room] of rooms) if (now - room.touched > ROOM_IDLE_MS) rooms.delete(id);
}

function addBot(room: Room) {
  if (room.players.length >= engineOf(room).maxPlayers) fail("Table is full");
  // Computer players are named F1, F2, F3… using the lowest free number.
  const used = new Set(room.players.map((p) => p.name));
  let n = 1;
  while (used.has(`F${n}`)) n++;
  const p = newPlayer(`F${n}`, true);
  room.players.push(p);
  log(room, `${p.name} (computer) joined the table`);
}

export function createRoom(input: { name: unknown; bots?: unknown; game?: unknown; options?: unknown }) {
  gc();
  const game = (typeof input.game === "string" && input.game in ENGINES ? input.game : "teenpatti") as GameKind;
  const engine = ENGINES[game] as unknown as Engine<unknown>;
  const host = newPlayer(cleanName(input.name));
  let id = rid(6);
  while (rooms.has(id)) id = rid(6);
  const options =
    input.options && typeof input.options === "object" ? (input.options as Record<string, unknown>) : {};
  const room: Room = {
    id,
    game,
    options,
    hostId: host.id,
    players: [host],
    log: [],
    logSeq: 0,
    chat: [],
    chatSeq: 0,
    lastChatAt: {},
    version: 1,
    touched: Date.now(),
    state: null,
  };
  room.state = engine.init(room);
  log(room, `${host.name} created a ${engine.title} table`);
  const n = Math.max(0, Math.min(engine.maxPlayers - 1, Math.floor(Number(input.bots) || 0)));
  for (let i = 0; i < n; i++) addBot(room);
  rooms.set(id, room);
  return { roomId: id, playerId: host.id, token: host.token };
}

export function getRoom(id: string) {
  return rooms.get(id.toUpperCase()) ?? fail("Table not found. It may have expired.");
}

export function joinRoom(room: Room, name: unknown) {
  const max = engineOf(room).maxPlayers;
  if (room.players.length >= max) fail(`Table is full (max ${max} players)`);
  const p = newPlayer(cleanName(name));
  room.players.push(p);
  log(room, `${p.name} joined the table`);
  bump(room);
  return { roomId: room.id, playerId: p.id, token: p.token };
}

export function auth(room: Room, pid: unknown, token: unknown) {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.token !== token) fail("You are not seated at this table");
  return p!;
}

function removePlayer(room: Room, id: string) {
  const idx = room.players.findIndex((x) => x.id === id);
  if (idx < 0) return;
  engineOf(room).onRemove(room, id);
  const [gone] = room.players.splice(idx, 1);
  log(room, `${gone.name} left the table`);
  const humans = room.players.filter((p) => !p.bot);
  if (!humans.length) {
    rooms.delete(room.id);
    return;
  }
  if (room.hostId === id) {
    room.hostId = humans[0].id;
    log(room, `${humans[0].name} is now the host`);
  }
}

export function act(room: Room, p: Player, a: Action) {
  const engine = engineOf(room);
  tick(room);
  if (!a || typeof a.type !== "string") fail("Unknown action");
  switch (a.type) {
    case "start":
      if (p.id !== room.hostId) fail("Only the host can start");
      if (engine.live(room)) fail("A round is already in progress");
      engine.start(room);
      break;
    case "add-bot":
      if (p.id !== room.hostId) fail("Only the host can add computer players");
      addBot(room);
      break;
    case "remove-bot": {
      if (p.id !== room.hostId) fail("Only the host can remove computer players");
      const bot = room.players.find((x) => x.id === a.id && x.bot) ?? fail("Not a computer player");
      if (engine.live(room) && engine.inRound(room, bot.id)) fail("Wait for this round to finish");
      removePlayer(room, bot.id);
      break;
    }
    case "leave":
      removePlayer(room, p.id);
      break;
    case "chat": {
      const text = String(a.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) fail("Type a message");
      const now = Date.now();
      if (now - (room.lastChatAt[p.id] ?? 0) < 600) fail("Slow down a little");
      room.lastChatAt[p.id] = now;
      room.chat.push({ id: ++room.chatSeq, by: p.id, name: p.name, text, at: now });
      if (room.chat.length > 60) room.chat.splice(0, room.chat.length - 60);
      break;
    }
    default:
      engine.apply(room, p, a);
  }
  bump(room);
}

/** Lazy timers: run on every request. */
export function tick(room: Room) {
  const now = Date.now();
  let changed = engineOf(room).tick(room, now);
  // Drop humans who closed the page, once no round is running.
  if (!engineOf(room).live(room)) {
    for (const p of [...room.players]) {
      if (!p.bot && !isOnline(p, now - 45_000)) {
        removePlayer(room, p.id);
        changed = true;
      }
    }
  }
  if (changed && rooms.has(room.id)) bump(room);
}

export function viewFor(room: Room, viewer: Player | null) {
  if (viewer) viewer.lastSeen = Date.now();
  tick(room);
  const engine = engineOf(room);
  const now = Date.now();
  return {
    id: room.id,
    game: room.game,
    title: engine.title,
    options: room.options,
    version: room.version,
    hostId: room.hostId,
    me: viewer?.id ?? null,
    serverNow: now,
    maxPlayers: engine.maxPlayers,
    minPlayers: engine.minPlayers,
    live: engine.live(room),
    log: room.log,
    chat: viewer ? room.chat : [], // only seated players can read the chat
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      score: p.score,
      online: isOnline(p, now),
      bot: !!p.bot,
    })),
    g: engine.view(room, viewer),
  };
}

export type RoomView = ReturnType<typeof viewFor>;
