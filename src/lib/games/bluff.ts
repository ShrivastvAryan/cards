// Bluff: play cards face down claiming a rank. Anyone can call "Bluff!".
// Get rid of all your cards (and survive the call) to win the round.
import { type Card, newShuffledDeck, rankLabel, sameCard } from "../cards";
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
} from "../core";

export const TURN_MS = 40_000;
export const WINDOW_MS = 3_000; // time others get to call Bluff after a play
const REVEAL_MS = 2_500;

interface LastPlay {
  seq: number;
  by: string;
  cards: Card[];
  claim: number;
  botCall: { id: string; at: number } | null;
}

interface Round {
  number: number;
  order: string[];
  hands: Record<string, Card[]>;
  turn: string;
  turnDeadline: number;
  botAt: number;
  pile: Card[]; // every card played this pile (face down)
  claimRank: number | null; // rank everyone must claim until the pile is cleared
  lastPlay: LastPlay | null;
  windowUntil: number;
  playSeq: number;
  reveal: null | { by: string; caller: string; cards: Card[]; claim: number; liar: boolean; until: number };
  result: null | { winner: string; at: number };
}

interface BluffState {
  round: Round | null;
  roundCount: number;
  dealer: number;
}

type BRoom = Room<BluffState>;

const sortCards = (cards: Card[]) => cards.sort((a, b) => a.r - b.r || a.s.localeCompare(b.s));
const stillPlaying = (r: Round) => r.order.filter((id) => r.hands[id] !== undefined);

function nextPlayer(r: Round, id: string) {
  const ids = stillPlaying(r);
  const i = r.order.indexOf(id);
  for (let k = 1; k <= r.order.length; k++) {
    const cand = r.order[(i + k) % r.order.length];
    if (ids.includes(cand)) return cand;
  }
  return id;
}

function setTurn(r: Round, id: string, extraWait = 0) {
  r.turn = id;
  r.turnDeadline = Date.now() + TURN_MS + extraWait;
  r.botAt = botDelay(500 + extraWait, 900);
}

function newPile(r: Round) {
  r.pile = [];
  r.claimRank = null;
  r.lastPlay = null;
}

function finish(room: BRoom, winner: string) {
  const r = room.state.round!;
  r.result = { winner, at: Date.now() };
  const p = playerOf(room, winner);
  if (p) p.score++;
  log(room, `🏆 ${nameOf(room, winner)} got rid of all their cards and won!`);
}

function start(room: BRoom) {
  const s = room.state;
  const players = room.players.filter((p) => isOnline(p));
  if (players.length < 2) fail("Need at least 2 online players");
  s.dealer = (s.dealer + 1) % players.length;
  const order = [...players.slice(s.dealer), ...players.slice(0, s.dealer)].map((p) => p.id);
  const deck = newShuffledDeck();
  const hands: Record<string, Card[]> = Object.fromEntries(order.map((id) => [id, []]));
  deck.forEach((c, i) => hands[order[i % order.length]].push(c));
  for (const id of order) sortCards(hands[id]);
  const r: Round = {
    number: ++s.roundCount,
    order,
    hands,
    turn: order[0],
    turnDeadline: 0,
    botAt: 0,
    pile: [],
    claimRank: null,
    lastPlay: null,
    windowUntil: 0,
    playSeq: 0,
    reveal: null,
    result: null,
  };
  s.round = r;
  setTurn(r, order[0]);
  log(room, `— Round #${r.number}: all 52 cards dealt. ${nameOf(room, order[0])} starts —`);
}

function requireRound(room: BRoom) {
  const r = room.state.round;
  if (!r || r.result) fail("No round in progress");
  return r!;
}

function requireTurn(room: BRoom, p: Player) {
  const r = requireRound(room);
  if (r.turn !== p.id) fail("It's not your turn");
  if (Date.now() < r.windowUntil) fail("Wait — others can still call Bluff");
  return r;
}

function play(room: BRoom, p: Player, cards: Card[], claim: number | null) {
  const r = requireTurn(room, p);
  const hand = r.hands[p.id];
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 4) fail("Play 1 to 4 cards");
  for (const c of cards) if (!hand.some((h) => sameCard(h, c))) fail("You don't have that card");
  if (new Set(cards.map((c) => `${c.r}${c.s}`)).size !== cards.length) fail("Duplicate card");
  if (r.claimRank === null) {
    if (!claim || claim < 2 || claim > 14) fail("Pick the rank you're claiming");
    r.claimRank = claim;
  }
  r.hands[p.id] = hand.filter((h) => !cards.some((c) => sameCard(c, h)));
  r.pile.push(...cards);
  const lp: LastPlay = { seq: ++r.playSeq, by: p.id, cards, claim: r.claimRank!, botCall: null };
  r.lastPlay = lp;
  r.windowUntil = Date.now() + WINDOW_MS;
  r.reveal = null;
  log(
    room,
    `${p.name} played ${cards.length} card${cards.length > 1 ? "s" : ""}: "${cards.length} × ${rankLabel(lp.claim)}"`,
  );
  scheduleBotCall(room, r, lp);
  setTurn(r, nextPlayer(r, p.id), WINDOW_MS);
}

function call(room: BRoom, p: Player) {
  const r = requireRound(room);
  const lp = r.lastPlay;
  if (!lp) fail("Nothing to call right now");
  if (lp!.by === p.id) fail("You can't call your own play");
  if (r.hands[p.id] === undefined) fail("You're not in this round");
  const liar = lp!.cards.some((c) => c.r !== lp!.claim);
  const loser = liar ? lp!.by : p.id;
  const winner = liar ? p.id : lp!.by;
  r.hands[loser] = sortCards([...(r.hands[loser] ?? []), ...r.pile]);
  const taken = r.pile.length;
  r.reveal = { by: lp!.by, caller: p.id, cards: lp!.cards, claim: lp!.claim, liar, until: Date.now() + REVEAL_MS };
  log(
    room,
    liar
      ? `🚨 ${p.name} called Bluff — ${nameOf(room, lp!.by)} was lying and picks up ${taken} cards`
      : `😬 ${p.name} called Bluff — ${nameOf(room, lp!.by)} was honest! ${p.name} picks up ${taken} cards`,
  );
  newPile(r);
  r.windowUntil = Date.now() + REVEAL_MS;
  if (r.hands[winner]?.length === 0) return finish(room, winner);
  setTurn(r, winner, REVEAL_MS);
}

function pass(room: BRoom, p: Player) {
  const r = requireTurn(room, p);
  if (r.claimRank === null) fail("You're starting a new pile — play at least one card");
  log(room, `${p.name} passed`);
  const next = nextPlayer(r, p.id);
  if (r.lastPlay && next === r.lastPlay.by) {
    // Everyone passed back to the last player: the pile is cleared, they start fresh.
    log(room, `Everyone passed — pile of ${r.pile.length} cleared. ${nameOf(room, next)} starts a new pile`);
    newPile(r);
  }
  setTurn(r, next);
}

function apply(room: BRoom, p: Player, a: Action) {
  switch (a.type) {
    case "play":
      return play(room, p, a.cards as Card[], (a.claim as number) ?? null);
    case "pass":
      return pass(room, p);
    case "call":
      return call(room, p);
    default:
      fail("Unknown action");
  }
}

// ---------- computer players ----------

function scheduleBotCall(room: BRoom, r: Round, lp: LastPlay) {
  const bots = r.order.filter((id) => id !== lp.by && playerOf(room, id)?.bot && r.hands[id] !== undefined);
  for (const id of bots.sort(() => Math.random() - 0.5)) {
    const mine = r.hands[id].filter((c) => c.r === lp.claim).length;
    const claimed = lp.cards.length;
    let chance = 0.08 + claimed * 0.07;
    if (claimed + mine > 4) chance = 0.97; // impossible claim
    if (r.hands[lp.by].length === 0) chance += 0.45; // they'd win otherwise
    if (r.pile.length > 12) chance -= 0.05; // risky to pick up a big pile
    if (Math.random() < chance) {
      lp.botCall = { id, at: Date.now() + 1000 + Math.random() * (WINDOW_MS - 1600) };
      return;
    }
  }
}

function botTurn(room: BRoom, p: Player) {
  const r = room.state.round!;
  const hand = r.hands[p.id];
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(c.r, [...(byRank.get(c.r) ?? []), c]);

  if (r.claimRank === null) {
    // Start a pile with the rank we hold most of; sometimes slip in an extra card.
    const [rank, cards] = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const extra = hand.filter((c) => c.r !== rank);
    const play_ = cards.slice(0, 4);
    if (extra.length > 2 && play_.length < 4 && Math.random() < 0.3) play_.push(extra[0]);
    return play(room, p, play_, rank);
  }
  const honest = (byRank.get(r.claimRank) ?? []).slice(0, 4);
  if (honest.length) {
    const play_ = [...honest];
    const others = hand.filter((c) => c.r !== r.claimRank);
    if (others.length > 3 && play_.length < 3 && Math.random() < 0.2) play_.push(others[0]);
    return play(room, p, play_, null);
  }
  const lie = Math.random() < (hand.length <= 3 ? 0.75 : 0.5);
  if (lie) {
    const n = hand.length > 6 && Math.random() < 0.35 ? 2 : 1;
    const junk = [...hand].sort(() => Math.random() - 0.5).slice(0, n);
    return play(room, p, junk, null);
  }
  return pass(room, p);
}

// ---------- engine ----------

export const bluff: Engine<BluffState> = {
  title: "Bluff",
  minPlayers: 2,
  maxPlayers: 8,
  init: () => ({ round: null, roundCount: 0, dealer: -1 }),
  start,
  live: (room) => !!room.state.round && !room.state.round.result,
  inRound: (room, id) => {
    const r = room.state.round;
    return !!r && !r.result && r.hands[id] !== undefined;
  },
  apply,
  tick(room, now) {
    const r = room.state.round;
    if (r && !r.result) {
      const lp = r.lastPlay;
      // A player who emptied their hand wins once nobody called in time.
      if (lp && now >= r.windowUntil && r.hands[lp.by]?.length === 0) {
        finish(room, lp.by);
        return true;
      }
      if (lp?.botCall && now >= lp.botCall.at) {
        const bot = playerOf(room, lp.botCall.id);
        lp.botCall = null;
        if (bot && r.hands[bot.id] !== undefined) {
          call(room, bot);
          return true;
        }
      }
      const turnP = playerOf(room, r.turn);
      if (turnP?.bot && now >= r.botAt && now >= r.windowUntil) {
        try {
          botTurn(room, turnP);
        } catch {
          // fall through to timeout handling next tick
        }
        return true;
      }
      if (now > r.turnDeadline) {
        const p = turnP!;
        if (r.claimRank === null) {
          const c = r.hands[p.id][0];
          log(room, `${p.name} ran out of time`);
          play(room, p, [c], c.r);
        } else {
          log(room, `${p.name} ran out of time`);
          pass(room, p);
        }
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
    if (!r || r.result || r.hands[id] === undefined) return;
    const wasTurn = r.turn === id;
    const next = nextPlayer(r, id);
    delete r.hands[id];
    if (r.lastPlay?.by === id) r.lastPlay = null;
    const left = stillPlaying(r);
    if (left.length === 1) return finish(room, left[0]);
    if (wasTurn) setTurn(r, next);
  },
  view(room, viewer) {
    const r = room.state.round;
    const now = Date.now();
    return {
      turnMs: TURN_MS,
      windowMs: WINDOW_MS,
      round: r && {
        number: r.number,
        turn: r.turn,
        turnDeadline: r.turnDeadline,
        counts: Object.fromEntries(r.order.map((id) => [id, r.hands[id]?.length ?? null])),
        myHand: viewer && r.hands[viewer.id] ? r.hands[viewer.id] : null,
        pileCount: r.pile.length,
        claimRank: r.claimRank,
        lastPlay: r.lastPlay && { by: r.lastPlay.by, count: r.lastPlay.cards.length, claim: r.lastPlay.claim },
        windowUntil: r.windowUntil,
        reveal: r.reveal && now < r.reveal.until + 2000 ? r.reveal : null,
        result: r.result,
      },
    };
  },
};

export interface BluffView {
  turnMs: number;
  windowMs: number;
  round: null | {
    number: number;
    turn: string;
    turnDeadline: number;
    counts: Record<string, number | null>;
    myHand: Card[] | null;
    pileCount: number;
    claimRank: number | null;
    lastPlay: { by: string; count: number; claim: number } | null;
    windowUntil: number;
    reveal: Round["reveal"];
    result: Round["result"];
  };
}
