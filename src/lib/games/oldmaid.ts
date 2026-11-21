// Old Maid: a full deck plus one Joker. Players throw away pairs themselves and
// take turns drawing a hidden card from the next player. The Joker never pairs:
// whoever is left holding it is the Old Maid.
import { type Card, isJokerCard, JOKER, newShuffledDeck, rankLabel, sameCard } from "../cards";
import {
  type Action,
  botDelay,
  type Engine,
  fail,
  isOnline,
  log,
  nameOf,
  type Player,
  playerOf,
  readyForAutoNext,
  type Room,
  shuffle,
} from "../core";

export const TURN_MS = 30_000;
const TOTAL_CARDS = 53;

interface Round {
  number: number;
  order: string[];
  hands: Record<string, Card[]>; // stored shuffled, so a hand's positions reveal nothing
  turn: string;
  turnDeadline: number;
  botAt: number;
  botPairAt: number; // next time a computer player throws a pair
  safe: string[]; // players who ran out of cards, in order
  discarded: number;
  lastPair: null | { by: string; cards: Card[] };
  lastDraw: null | { by: string; from: string; card: Card; at: number };
  result: null | { loser: string; safe: string[]; at: number };
}

interface OMState {
  round: Round | null;
  roundCount: number;
  dealer: number;
}

type OMRoom = Room<OMState>;

const isActive = (r: Round, id: string) => r.hands[id] !== undefined && !r.safe.includes(id);
const active = (r: Round) => r.order.filter((id) => isActive(r, id));

function nextActive(r: Round, id: string) {
  const i = r.order.indexOf(id);
  for (let k = 1; k <= r.order.length; k++) {
    const cand = r.order[(i + k) % r.order.length];
    if (isActive(r, cand)) return cand;
  }
  return id;
}

/** One pair (two cards of the same rank, never the Joker) in a hand, if any. */
export function findPair(hand: Card[]): [Card, Card] | null {
  const seen = new Map<number, Card>();
  for (const c of hand) {
    if (isJokerCard(c)) continue;
    const other = seen.get(c.r);
    if (other) return [other, c];
    seen.set(c.r, c);
  }
  return null;
}

function setTurn(r: Round, id: string) {
  r.turn = id;
  r.turnDeadline = Date.now() + TURN_MS;
  r.botAt = botDelay(1100, 1300);
}

function markSafe(room: OMRoom, id: string) {
  const r = room.state.round!;
  if (r.hands[id]?.length === 0 && !r.safe.includes(id)) {
    r.safe.push(id);
    const p = playerOf(room, id);
    if (p) p.score++;
    log(room, `✅ ${nameOf(room, id)} is out of cards — safe!`);
  }
}

/** The round ends once only one player still holds cards: they have the Joker. */
function checkEnd(room: OMRoom) {
  const r = room.state.round!;
  const left = active(r);
  if (left.length > 1) return false;
  const loser = left[0] ?? r.order.find((id) => r.hands[id]?.some(isJokerCard)) ?? "";
  r.result = { loser, safe: [...r.safe], at: Date.now() };
  log(room, loser ? `🃏 ${nameOf(room, loser)} is left with the Joker — the Old Maid!` : "Round over");
  return true;
}

/** If it's someone's turn but they just went safe, move the turn on. */
function fixTurn(r: Round) {
  if (!r.result && !isActive(r, r.turn)) setTurn(r, nextActive(r, r.turn));
}

function start(room: OMRoom) {
  const s = room.state;
  const players = room.players.filter((p) => isOnline(p));
  if (players.length < 2) fail("Need at least 2 online players");
  s.dealer = (s.dealer + 1) % players.length;
  const order = [...players.slice(s.dealer), ...players.slice(0, s.dealer)].map((p) => p.id);
  const deck = shuffle([...newShuffledDeck(), { ...JOKER }]);
  const hands: Record<string, Card[]> = Object.fromEntries(order.map((id) => [id, []]));
  deck.forEach((c, i) => hands[order[i % order.length]].push(c));
  s.round = {
    number: ++s.roundCount,
    order,
    hands,
    turn: order[0],
    turnDeadline: 0,
    botAt: 0,
    botPairAt: botDelay(1500, 1000),
    safe: [],
    discarded: 0,
    lastPair: null,
    lastDraw: null,
    result: null,
  };
  setTurn(s.round, order[0]);
  log(room, `— Round #${s.round.number}: 52 cards + 1 Joker dealt. Throw away your pairs! —`);
}

function requireLive(room: OMRoom, p: Player) {
  const r = room.state.round;
  if (!r || r.result) fail("No round in progress");
  if (!isActive(r!, p.id)) fail("You're not holding cards this round");
  return r!;
}

function throwPair(room: OMRoom, p: Player, cards: unknown) {
  const r = requireLive(room, p);
  const hand = r.hands[p.id];
  if (!Array.isArray(cards) || cards.length !== 2) fail("Pick two cards");
  const [a, b] = cards as Card[];
  if (sameCard(a, b)) fail("Pick two different cards");
  if (isJokerCard(a) || isJokerCard(b)) fail("The Joker has no partner");
  if (a.r !== b.r) fail("Those two don't match");
  if (!hand.some((c) => sameCard(c, a)) || !hand.some((c) => sameCard(c, b))) fail("You don't have those cards");
  r.hands[p.id] = hand.filter((c) => !sameCard(c, a) && !sameCard(c, b));
  r.discarded += 2;
  r.lastPair = { by: p.id, cards: [a, b] };
  log(room, `${p.name} threw away a pair of ${rankLabel(a.r)}s`);
  markSafe(room, p.id);
  if (!checkEnd(room)) fixTurn(r);
}

function draw(room: OMRoom, p: Player, index: number) {
  const r = requireLive(room, p);
  if (r.turn !== p.id) fail("It's not your turn");
  const from = nextActive(r, p.id);
  if (from === p.id) fail("Nobody to draw from");
  const target = r.hands[from];
  if (!Number.isInteger(index) || index < 0 || index >= target.length) fail("Pick one of their cards");
  const [card] = target.splice(index, 1);
  const mine = r.hands[p.id];
  mine.splice(Math.floor(Math.random() * (mine.length + 1)), 0, card);
  r.hands[from] = shuffle(target);
  r.lastDraw = { by: p.id, from, card, at: Date.now() };
  log(room, `${p.name} took a card from ${nameOf(room, from)}`);
  markSafe(room, from);
  if (checkEnd(room)) return;
  setTurn(r, nextActive(r, p.id));
}

/** Idle fallback only: throw every pair, then draw a random card. */
function autoPlay(room: OMRoom, p: Player) {
  const r = room.state.round!;
  let pair = findPair(r.hands[p.id]);
  while (pair && !r.result) {
    throwPair(room, p, pair);
    pair = isActive(r, p.id) ? findPair(r.hands[p.id]) : null;
  }
  if (r.result || r.turn !== p.id) return;
  const from = r.hands[nextActive(r, p.id)];
  draw(room, p, Math.floor(Math.random() * from.length));
}

function apply(room: OMRoom, p: Player, a: Action) {
  if (a.type === "draw") return draw(room, p, Number(a.index));
  if (a.type === "pair") return throwPair(room, p, a.cards);
  if (a.type === "pair-all") {
    const r = requireLive(room, p);
    let pair = findPair(r.hands[p.id]);
    if (!pair) fail("No pairs to throw away");
    while (pair && !r.result) {
      throwPair(room, p, pair);
      pair = isActive(r, p.id) ? findPair(r.hands[p.id]) : null;
    }
    return;
  }
  fail("Unknown action");
}

export const oldMaid: Engine<OMState> = {
  title: "Old Maid",
  minPlayers: 2,
  maxPlayers: 8,
  init: () => ({ round: null, roundCount: 0, dealer: -1 }),
  start,
  live: (room) => !!room.state.round && !room.state.round.result,
  inRound: (room, id) => {
    const r = room.state.round;
    return !!r && !r.result && isActive(r, id);
  },
  apply,
  tick(room, now) {
    const r = room.state.round;
    if (r && !r.result) {
      // Computer players throw their pairs one at a time, like a person would.
      if (now >= r.botPairAt) {
        r.botPairAt = botDelay(500, 700);
        const bot = active(r)
          .map((id) => playerOf(room, id)!)
          .find((p) => p?.bot && findPair(r.hands[p.id]));
        if (bot) {
          throwPair(room, bot, findPair(r.hands[bot.id]));
          return true;
        }
      }
      const turnP = playerOf(room, r.turn);
      if (turnP?.bot && now >= r.botAt && !findPair(r.hands[turnP.id])) {
        const from = r.hands[nextActive(r, r.turn)];
        draw(room, turnP, Math.floor(Math.random() * from.length));
        return true;
      }
      if (turnP && now > r.turnDeadline) {
        log(room, `${turnP.name} ran out of time — pairs thrown and a card drawn for them`);
        autoPlay(room, turnP);
        return true;
      }
      return false;
    }
    if (r?.result && readyForAutoNext(room, r.result.at, now, room.players.filter((p) => isOnline(p, now)))) {
      start(room);
      return true;
    }
    return false;
  },
  onRemove(room, id) {
    const r = room.state.round;
    if (!r || r.result || !isActive(r, id)) return;
    const next = nextActive(r, id);
    // Their cards (maybe the Joker) go to the next player.
    if (next !== id) r.hands[next] = shuffle([...r.hands[next], ...r.hands[id]]);
    delete r.hands[id];
    if (checkEnd(room)) return;
    fixTurn(r);
  },
  view(room, viewer) {
    const r = room.state.round;
    const me = viewer?.id;
    return {
      turnMs: TURN_MS,
      totalCards: TOTAL_CARDS,
      round: r && {
        number: r.number,
        turn: r.turn,
        turnDeadline: r.turnDeadline,
        target: r.result ? null : nextActive(r, r.turn),
        counts: Object.fromEntries(r.order.map((id) => [id, r.hands[id]?.length ?? null])),
        myHand: me && r.hands[me] ? [...r.hands[me]].sort((a, b) => a.r - b.r || a.s.localeCompare(b.s)) : null,
        safe: r.safe,
        discarded: r.discarded,
        lastPair: r.lastPair,
        // Only the drawer sees which card they took.
        lastDraw: r.lastDraw && {
          by: r.lastDraw.by,
          from: r.lastDraw.from,
          at: r.lastDraw.at,
          card: r.lastDraw.by === me ? r.lastDraw.card : null,
        },
        // At the end everyone sees who holds the Joker.
        result: r.result,
      },
    };
  },
};

export interface OldMaidView {
  turnMs: number;
  totalCards: number;
  round: null | {
    number: number;
    turn: string;
    turnDeadline: number;
    target: string | null;
    counts: Record<string, number | null>;
    myHand: Card[] | null;
    safe: string[];
    discarded: number;
    lastPair: Round["lastPair"];
    lastDraw: null | { by: string; from: string; at: number; card: Card | null };
    result: Round["result"];
  };
}
