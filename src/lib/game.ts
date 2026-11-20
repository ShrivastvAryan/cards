// Server-side Teen Patti room engine. State lives in memory on the Next.js server.
import { Card, compareHands, evaluateHand, newShuffledDeck } from "./cards";

export const MAX_PLAYERS = 6;
export const STARTING_CHIPS = 1000;
export const BOOT = 10;
export const TURN_MS = 30_000;
export const SIDESHOW_MS = 15_000;
export const AUTO_NEXT_MS = 8_000;
export const POT_LIMIT = BOOT * 200; // pot limit: forced showdown once reached
const OFFLINE_MS = 45_000;
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

export interface Player {
  id: string;
  token: string;
  name: string;
  chips: number;
  lastSeen: number;
  bot?: boolean;
}

interface HandPlayer {
  cards: Card[];
  seen: boolean;
  folded: boolean;
  bet: number;
  moves: number;
}

interface SideShow {
  from: string;
  to: string;
  deadline: number;
}

interface Hand {
  number: number;
  order: string[]; // player ids dealt in, seat order
  hp: Record<string, HandPlayer>;
  pot: number;
  stake: number; // current blind stake
  turn: string | null;
  turnDeadline: number;
  botAt: number; // earliest time a computer player may act
  sideShow: SideShow | null;
  result: null | {
    winners: string[];
    reason: string;
    reveal: string[]; // ids whose cards are shown to everyone
    at: number;
  };
}

export interface Room {
  id: string;
  hostId: string;
  players: Player[]; // seat order
  dealerIdx: number;
  hand: Hand | null;
  handCount: number;
  log: { id: number; text: string }[];
  logSeq: number;
  version: number;
  touched: number;
}

type Store = Map<string, Room>;
const g = globalThis as unknown as { __teenPattiRooms?: Store };
const rooms: Store = (g.__teenPattiRooms ??= new Map());

const rid = (len: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") => {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
};

export class GameError extends Error {}
const fail = (msg: string): never => {
  throw new GameError(msg);
};

function log(room: Room, text: string) {
  room.log.push({ id: ++room.logSeq, text });
  if (room.log.length > 40) room.log.splice(0, room.log.length - 40);
}

function bump(room: Room) {
  room.version++;
  room.touched = Date.now();
}

const cleanName = (name: unknown) => {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  return n || fail("Please enter a name");
};

function newPlayer(name: string): Player {
  return {
    id: rid(10),
    token: rid(24),
    name,
    chips: STARTING_CHIPS,
    lastSeen: Date.now(),
  };
}

function gc() {
  const now = Date.now();
  for (const [id, room] of rooms) if (now - room.touched > ROOM_IDLE_MS) rooms.delete(id);
}

export function createRoom(name: unknown, bots: unknown = 0) {
  gc();
  const host = newPlayer(cleanName(name));
  let id = rid(6);
  while (rooms.has(id)) id = rid(6);
  const room: Room = {
    id,
    hostId: host.id,
    players: [host],
    dealerIdx: -1,
    hand: null,
    handCount: 0,
    log: [],
    logSeq: 0,
    version: 1,
    touched: Date.now(),
  };
  log(room, `${host.name} created the table`);
  const n = Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(Number(bots) || 0)));
  for (let i = 0; i < n; i++) addBot(room);
  rooms.set(id, room);
  return { roomId: id, playerId: host.id, token: host.token };
}

export function getRoom(id: string) {
  return rooms.get(id.toUpperCase()) ?? fail("Table not found. It may have expired.");
}

export function joinRoom(room: Room, name: unknown) {
  if (room.players.length >= MAX_PLAYERS) fail("Table is full (max 6 players)");
  const p = newPlayer(cleanName(name));
  room.players.push(p);
  log(room, `${p.name} joined the table`);
  bump(room);
  return { roomId: room.id, playerId: p.id, token: p.token };
}

function addBot(room: Room) {
  if (room.players.length >= MAX_PLAYERS) fail("Table is full (max 6 players)");
  // Computer players are named F1, F2, F3… using the lowest free number.
  const used = new Set(room.players.map((p) => p.name));
  let n = 1;
  while (used.has(`F${n}`)) n++;
  const p = { ...newPlayer(`F${n}`), bot: true };
  room.players.push(p);
  log(room, `${p.name} (computer) joined the table`);
}

const isOnline = (p: Player, now = Date.now()) => p.bot || now - p.lastSeen < OFFLINE_MS;

export function auth(room: Room, pid: unknown, token: unknown) {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.token !== token) fail("You are not seated at this table");
  return p!;
}

// ---------- hand helpers ----------

const nameOf = (room: Room, id: string) => room.players.find((p) => p.id === id)?.name ?? "Player";
const playerOf = (room: Room, id: string) => room.players.find((p) => p.id === id)!;

function active(hand: Hand) {
  return hand.order.filter((id) => !hand.hp[id].folded);
}

/** Next non-folded player after `id` in seat order. */
function nextActive(hand: Hand, id: string) {
  const n = hand.order.length;
  const i = hand.order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = hand.order[(i + k) % n];
    if (!hand.hp[cand].folded) return cand;
  }
  return id;
}

/** Previous non-folded player before `id` in seat order. */
function prevActive(hand: Hand, id: string) {
  const n = hand.order.length;
  const i = hand.order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = hand.order[(i - k + n) % n];
    if (!hand.hp[cand].folded) return cand;
  }
  return id;
}

function chaalCost(hand: Hand, id: string, raise: boolean) {
  return hand.stake * (hand.hp[id].seen ? 2 : 1) * (raise ? 2 : 1);
}

function pay(room: Room, hand: Hand, id: string, amount: number) {
  const p = playerOf(room, id);
  const amt = Math.min(amount, p.chips);
  p.chips -= amt;
  hand.hp[id].bet += amt;
  hand.pot += amt;
  return amt;
}

function setTurn(hand: Hand, id: string | null) {
  hand.turn = id;
  hand.turnDeadline = Date.now() + TURN_MS;
  hand.botAt = Date.now() + 900 + Math.random() * 1200;
}

function finishHand(room: Room, winners: string[], reason: string, reveal: string[]) {
  const hand = room.hand!;
  const share = Math.floor(hand.pot / winners.length);
  let rem = hand.pot - share * winners.length;
  for (const w of winners) {
    playerOf(room, w).chips += share + (rem-- > 0 ? 1 : 0);
  }
  hand.turn = null;
  hand.sideShow = null;
  hand.result = { winners, reason, reveal, at: Date.now() };
  log(room, `🏆 ${winners.map((w) => nameOf(room, w)).join(" & ")} won ₹${hand.pot} — ${reason}`);
}

/** Full showdown among every non-folded player. */
function showdownAll(room: Room, reason: string) {
  const hand = room.hand!;
  const ids = active(hand);
  let best = [ids[0]];
  for (const id of ids.slice(1)) {
    const c = compareHands(hand.hp[id].cards, hand.hp[best[0]].cards);
    if (c > 0) best = [id];
    else if (c === 0) best.push(id);
  }
  const hn = evaluateHand(hand.hp[best[0]].cards).name;
  finishHand(room, best, `${reason} (${hn})`, ids);
}

/** After a player acts or folds: end the hand if only one left, else pass the turn. */
function afterAction(room: Room, actor: string) {
  const hand = room.hand!;
  const left = active(hand);
  if (left.length === 1) {
    finishHand(room, left, "everyone else packed", []);
    return;
  }
  if (hand.pot >= POT_LIMIT) {
    log(room, `Pot limit ₹${POT_LIMIT} reached — everyone shows`);
    showdownAll(room, "pot limit showdown");
    return;
  }
  setTurn(hand, nextActive(hand, actor));
}

function requireTurn(room: Room, p: Player) {
  const hand = room.hand;
  if (!hand || hand.result) fail("No hand in progress");
  if (hand!.sideShow) fail("Waiting for side show response");
  if (hand!.turn !== p.id) fail("It's not your turn");
  return hand!;
}

// ---------- actions ----------

function startHand(room: Room) {
  for (const p of room.players) {
    if (p.bot && p.chips < BOOT) {
      p.chips = STARTING_CHIPS;
      log(room, `${p.name} re-bought ₹${STARTING_CHIPS} chips`);
    }
  }
  const eligible = room.players.filter((p) => (p.bot || p.chips >= BOOT) && isOnline(p));
  if (eligible.length < 2) fail("Need at least 2 online players with chips to start");

  // rotate dealer among eligible players
  const n = room.players.length;
  let d = room.dealerIdx;
  for (let k = 1; k <= n; k++) {
    const cand = room.players[(d + k + n) % n];
    if (eligible.includes(cand)) {
      d = (d + k + n) % n;
      break;
    }
  }
  room.dealerIdx = d;
  const dealer = room.players[d];

  const order = room.players.filter((p) => eligible.includes(p));
  const deck = newShuffledDeck();
  const hand: Hand = {
    number: ++room.handCount,
    order: order.map((p) => p.id),
    hp: {},
    pot: 0,
    stake: BOOT,
    turn: null,
    turnDeadline: 0,
    botAt: 0,
    sideShow: null,
    result: null,
  };
  for (const p of order) {
    hand.hp[p.id] = { cards: deck.splice(0, 3), seen: false, folded: false, bet: 0, moves: 0 };
  }
  room.hand = hand;
  for (const p of order) pay(room, hand, p.id, BOOT);
  setTurn(hand, nextActive(hand, dealer.id));
  log(room, `— Hand #${hand.number} dealt. Boot ₹${BOOT} each, pot ₹${hand.pot} —`);
}

export type Action =
  | { type: "start" }
  | { type: "see" }
  | { type: "chaal"; raise?: boolean }
  | { type: "pack" }
  | { type: "show" }
  | { type: "sideshow" }
  | { type: "sideshow-reply"; accept: boolean }
  | { type: "rebuy" }
  | { type: "add-bot" }
  | { type: "remove-bot"; id: string }
  | { type: "leave" };

export function act(room: Room, p: Player, a: Action) {
  tick(room);
  apply(room, p, a);
  bump(room);
}

function apply(room: Room, p: Player, a: Action) {
  const hand = room.hand;
  const inHand = !!hand && !hand.result && !!hand.hp[p.id] && !hand.hp[p.id].folded;

  switch (a.type) {
    case "start": {
      if (p.id !== room.hostId) fail("Only the host can deal");
      if (hand && !hand.result) fail("A hand is already in progress");
      startHand(room);
      break;
    }
    case "see": {
      if (!inHand) fail("You're not in this hand");
      if (!hand!.hp[p.id].seen) {
        hand!.hp[p.id].seen = true;
        log(room, `${p.name} saw their cards`);
      }
      break;
    }
    case "chaal": {
      const h = requireTurn(room, p);
      const raise = !!a.raise;
      const cost = chaalCost(h, p.id, raise);
      if (p.chips < cost) {
        // Can't cover the bet: all-in and force a showdown.
        const paid = pay(room, h, p.id, cost);
        log(room, `${p.name} went all-in with ₹${paid}`);
        showdownAll(room, "all-in showdown");
        break;
      }
      pay(room, h, p.id, cost);
      h.hp[p.id].moves++;
      if (raise) h.stake *= 2;
      log(room, `${p.name} ${raise ? "raised" : h.hp[p.id].seen ? "chaal" : "blind"} ₹${cost}`);
      afterAction(room, p.id);
      break;
    }
    case "pack": {
      if (!inHand) fail("You're not in this hand");
      const h = hand!;
      h.hp[p.id].folded = true;
      log(room, `${p.name} packed`);
      if (h.sideShow && (h.sideShow.from === p.id || h.sideShow.to === p.id)) {
        const from = h.sideShow.from;
        h.sideShow = null;
        if (active(h).length > 1) setTurn(h, nextActive(h, from));
      }
      if (active(h).length === 1) finishHand(room, active(h), "everyone else packed", []);
      else if (h.turn === p.id) afterAction(room, p.id);
      break;
    }
    case "show": {
      const h = requireTurn(room, p);
      const left = active(h);
      if (left.length !== 2) fail("Show is only allowed when 2 players remain");
      const other = left.find((id) => id !== p.id)!;
      const cost = chaalCost(h, p.id, false);
      pay(room, h, p.id, cost);
      log(room, `${p.name} paid ₹${cost} and asked for a show`);
      const c = compareHands(h.hp[p.id].cards, h.hp[other].cards);
      // On a tie, the player who asked for the show loses.
      const winner = c > 0 ? p.id : other;
      const hn = evaluateHand(h.hp[winner].cards).name;
      finishHand(room, [winner], `show (${hn})`, left);
      break;
    }
    case "sideshow": {
      const h = requireTurn(room, p);
      if (!h.hp[p.id].seen) fail("You must see your cards to ask for a side show");
      if (active(h).length < 3) fail("Use Show when only 2 players remain");
      const target = prevActive(h, p.id);
      if (!h.hp[target].seen) fail(`${nameOf(room, target)} is playing blind — no side show`);
      const cost = chaalCost(h, p.id, false);
      if (p.chips < cost) fail("Not enough chips");
      pay(room, h, p.id, cost);
      h.sideShow = { from: p.id, to: target, deadline: Date.now() + SIDESHOW_MS };
      log(room, `${p.name} paid ₹${cost} and asked ${nameOf(room, target)} for a side show`);
      break;
    }
    case "sideshow-reply": {
      const h = hand;
      if (!h || !h.sideShow || h.sideShow.to !== p.id) fail("No side show request for you");
      resolveSideShow(room, !!a.accept);
      break;
    }
    case "rebuy": {
      if (inHand) fail("Finish the current hand first");
      if (p.chips >= BOOT * 5) fail("You still have chips");
      p.chips = STARTING_CHIPS;
      log(room, `${p.name} re-bought ₹${STARTING_CHIPS} chips`);
      break;
    }
    case "add-bot": {
      if (p.id !== room.hostId) fail("Only the host can add computer players");
      addBot(room);
      break;
    }
    case "remove-bot": {
      if (p.id !== room.hostId) fail("Only the host can remove computer players");
      const bot = room.players.find((x) => x.id === a.id && x.bot) ?? fail("Not a computer player");
      if (hand && !hand.result && hand.hp[bot.id] && !hand.hp[bot.id].folded)
        fail("Wait for this hand to finish");
      removePlayer(room, bot.id);
      break;
    }
    case "leave": {
      if (inHand) apply(room, p, { type: "pack" });
      removePlayer(room, p.id);
      break;
    }
    default:
      fail("Unknown action");
  }
}

function resolveSideShow(room: Room, accept: boolean) {
  const h = room.hand!;
  const { from, to } = h.sideShow!;
  h.sideShow = null;
  if (!accept) {
    log(room, `${nameOf(room, to)} denied the side show`);
    setTurn(h, nextActive(h, from));
    return;
  }
  const c = compareHands(h.hp[from].cards, h.hp[to].cards);
  const loser = c > 0 ? to : from; // tie → requester loses
  h.hp[loser].folded = true;
  log(room, `Side show: ${nameOf(room, loser)} lost and packed`);
  afterAction(room, from);
}

function removePlayer(room: Room, id: string) {
  const idx = room.players.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [gone] = room.players.splice(idx, 1);
  if (idx <= room.dealerIdx) room.dealerIdx--;
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

/** Lazy timers: run on every request. */
export function tick(room: Room) {
  const now = Date.now();
  const h = room.hand;
  let changed = false;
  if (h && !h.result) {
    if (h.sideShow && now > h.sideShow.deadline) {
      resolveSideShow(room, false);
      changed = true;
    } else if (h.sideShow && playerOf(room, h.sideShow.to)?.bot && now > h.sideShow.deadline - SIDESHOW_MS + 1500) {
      resolveSideShow(room, botAcceptsSideShow(h.hp[h.sideShow.to].cards));
      changed = true;
    } else if (!h.sideShow && h.turn && playerOf(room, h.turn)?.bot && now > h.botAt) {
      botMove(room, playerOf(room, h.turn));
      changed = true;
    } else if (!h.sideShow && h.turn && now > h.turnDeadline) {
      const p = playerOf(room, h.turn);
      h.hp[p.id].folded = true;
      log(room, `${p.name} ran out of time and packed`);
      afterAction(room, p.id);
      changed = true;
    }
  }
  // Drop offline players while no hand is running.
  if (!h || h.result) {
    for (const p of [...room.players]) {
      if (!p.bot && now - p.lastSeen > OFFLINE_MS * 2) {
        removePlayer(room, p.id);
        changed = true;
      }
    }
  }
  // Auto-deal the next hand.
  if (room.hand?.result && now - room.hand.result.at > AUTO_NEXT_MS) {
    const eligible = room.players.filter((p) => (p.bot || p.chips >= BOOT) && isOnline(p, now));
    const humanPlaying = eligible.some((p) => !p.bot);
    if (eligible.length >= 2 && humanPlaying) {
      startHand(room);
      changed = true;
    }
  }
  if (changed) bump(room);
}

// ---------- computer players ----------

/** 0..1 rough strength of a 3-card hand. */
function strength(cards: Card[]) {
  const e = evaluateHand(cards);
  const top = e.tiebreak[0] ?? 0; // 2..16
  if (e.category === 0) return 0.05 + ((top - 2) / 12) * 0.3; // high card: 0.05..0.35
  return Math.min(1, 0.35 + e.category * 0.13 + (top / 16) * 0.12);
}

function botAcceptsSideShow(cards: Card[]) {
  return strength(cards) >= 0.5;
}

function botMove(room: Room, p: Player) {
  const h = room.hand!;
  const me = h.hp[p.id];
  const left = active(h).length;
  const pressure = h.stake / BOOT; // grows as people raise
  const r = Math.random();
  const run = (a: Action) => {
    try {
      apply(room, p, a);
    } catch {
      apply(room, p, { type: "pack" });
    }
  };

  // Blind play: keep going blind a few rounds, then look.
  if (!me.seen) {
    const lookChance = 0.15 + me.moves * 0.2 + (pressure >= 4 ? 0.3 : 0);
    if (r > lookChance) {
      if (left === 2 && me.moves >= 4 && Math.random() < 0.3) return run({ type: "show" });
      return run({ type: "chaal", raise: Math.random() < 0.1 && pressure < 4 });
    }
    me.seen = true;
    log(room, `${p.name} saw their cards`);
  }

  const s = strength(me.cards);
  const cost = chaalCost(h, p.id, false);
  const affordable = p.chips >= cost;

  if (left === 2) {
    if (!affordable) return run({ type: "show" });
    if (s >= 0.75 && Math.random() < 0.5 && pressure < 16) return run({ type: "chaal", raise: true });
    if (s < 0.2 && pressure >= 2) return run({ type: "pack" });
    if (s < 0.45 && me.moves >= 1 && Math.random() < 0.35) return run({ type: "pack" });
    if (me.moves >= 2 || pressure >= 8 || s < 0.5) return run({ type: "show" });
    return run({ type: "chaal" });
  }

  // 3+ players
  const foldBar = Math.min(0.6, 0.15 + me.moves * 0.06 + pressure * 0.03);
  if (s < foldBar && Math.random() < 0.75) return run({ type: "pack" });
  if (!affordable) return s >= 0.5 ? run({ type: "chaal" }) : run({ type: "pack" });
  const target = prevActive(h, p.id);
  if (s >= 0.3 && s < 0.6 && h.hp[target].seen && Math.random() < 0.25) return run({ type: "sideshow" });
  if (s >= 0.7 && Math.random() < 0.4 && pressure < 16) return run({ type: "chaal", raise: true });
  return run({ type: "chaal" });
}

// ---------- client view ----------

export function viewFor(room: Room, viewer: Player | null) {
  if (viewer) viewer.lastSeen = Date.now();
  tick(room);
  const h = room.hand;
  const now = Date.now();
  return {
    id: room.id,
    version: room.version,
    hostId: room.hostId,
    me: viewer?.id ?? null,
    boot: BOOT,
    potLimit: POT_LIMIT,
    turnMs: TURN_MS,
    autoNextMs: AUTO_NEXT_MS,
    serverNow: now,
    log: room.log,
    players: room.players.map((p, i) => {
      const hp = h?.hp[p.id];
      const reveal = !!h?.result && h.result.reveal.includes(p.id);
      const own = viewer?.id === p.id && hp?.seen;
      return {
        id: p.id,
        name: p.name,
        chips: p.chips,
        online: isOnline(p, now),
        bot: !!p.bot,
        dealer: i === room.dealerIdx && !!h,
        inHand: !!hp,
        seen: !!hp?.seen,
        folded: !!hp?.folded,
        bet: hp?.bet ?? 0,
        cards: hp && (reveal || own) ? hp.cards : null,
        handName: hp && (reveal || own) ? evaluateHand(hp.cards).name : null,
      };
    }),
    hand: h && {
      number: h.number,
      pot: h.pot,
      stake: h.stake,
      turn: h.turn,
      turnDeadline: h.turnDeadline,
      activeCount: active(h).length,
      sideShow: h.sideShow,
      sideShowTarget: h.turn && h.hp[h.turn] ? prevActive(h, h.turn) : null,
      result: h.result,
    },
  };
}

export type RoomView = ReturnType<typeof viewFor>;
