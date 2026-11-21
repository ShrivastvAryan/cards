// Teen Patti (Classic + Joker). Each player gets 3 cards; bet blind or seen.
import { type Card, compareScores, newShuffledDeck, scoreHand } from "../cards";
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
  STARTING_CHIPS,
} from "../core";

export const BOOT = 10;
export const TURN_MS = 30_000;
export const SIDESHOW_MS = 15_000;
export const POT_LIMIT = BOOT * 200; // forced showdown once reached

interface HandPlayer {
  cards: Card[];
  seen: boolean;
  folded: boolean;
  bet: number;
  moves: number;
}

interface Hand {
  number: number;
  order: string[];
  hp: Record<string, HandPlayer>;
  pot: number;
  stake: number;
  turn: string | null;
  turnDeadline: number;
  botAt: number;
  joker: Card | null; // Joker mode: every card of this rank is wild
  sideShow: { from: string; to: string; deadline: number } | null;
  result: null | { winners: string[]; reason: string; reveal: string[]; at: number };
}

interface TPState {
  dealerIdx: number;
  hand: Hand | null;
  handCount: number;
}

type TPRoom = Room<TPState>;

const isJoker = (room: TPRoom) => room.options.joker === true;
const score = (h: Hand, id: string) => scoreHand(h.hp[id].cards, h.joker?.r);
const cmp = (h: Hand, a: string, b: string) => compareScores(score(h, a), score(h, b));
const handName = (h: Hand, id: string) => {
  const s = score(h, id);
  return s.usedJoker ? `${s.name} (joker)` : s.name;
};

const active = (h: Hand) => h.order.filter((id) => !h.hp[id].folded);

function nextActive(h: Hand, id: string) {
  const n = h.order.length;
  const i = h.order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = h.order[(i + k) % n];
    if (!h.hp[cand].folded) return cand;
  }
  return id;
}

function prevActive(h: Hand, id: string) {
  const n = h.order.length;
  const i = h.order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = h.order[(i - k + n) % n];
    if (!h.hp[cand].folded) return cand;
  }
  return id;
}

const chaalCost = (h: Hand, id: string, raise: boolean) => h.stake * (h.hp[id].seen ? 2 : 1) * (raise ? 2 : 1);

function pay(room: TPRoom, h: Hand, id: string, amount: number) {
  const p = playerOf(room, id);
  const amt = Math.min(amount, p?.chips ?? 0);
  if (p) p.chips -= amt;
  h.hp[id].bet += amt;
  h.pot += amt;
  return amt;
}

function setTurn(h: Hand, id: string | null) {
  h.turn = id;
  h.turnDeadline = Date.now() + TURN_MS;
  h.botAt = botDelay();
}

function finishHand(room: TPRoom, winners: string[], reason: string, reveal: string[]) {
  const h = room.state.hand!;
  const share = Math.floor(h.pot / winners.length);
  let rem = h.pot - share * winners.length;
  for (const w of winners) {
    const p = playerOf(room, w);
    if (p) {
      p.chips += share + (rem-- > 0 ? 1 : 0);
      p.score++;
    }
  }
  h.turn = null;
  h.sideShow = null;
  h.result = { winners, reason, reveal, at: Date.now() };
  log(room, `🏆 ${winners.map((w) => nameOf(room, w)).join(" & ")} won ₹${h.pot} — ${reason}`);
}

function showdownAll(room: TPRoom, reason: string) {
  const h = room.state.hand!;
  const ids = active(h);
  let best = [ids[0]];
  for (const id of ids.slice(1)) {
    const c = cmp(h, id, best[0]);
    if (c > 0) best = [id];
    else if (c === 0) best.push(id);
  }
  finishHand(room, best, `${reason} (${handName(h, best[0])})`, ids);
}

function afterAction(room: TPRoom, actor: string) {
  const h = room.state.hand!;
  const left = active(h);
  if (left.length === 1) return finishHand(room, left, "everyone else packed", []);
  if (h.pot >= POT_LIMIT) {
    log(room, `Pot limit ₹${POT_LIMIT} reached — everyone shows`);
    return showdownAll(room, "pot limit showdown");
  }
  setTurn(h, nextActive(h, actor));
}

function requireTurn(room: TPRoom, p: Player) {
  const h = room.state.hand;
  if (!h || h.result) fail("No hand in progress");
  if (h!.sideShow) fail("Waiting for side show response");
  if (h!.turn !== p.id) fail("It's not your turn");
  return h!;
}

function resolveSideShow(room: TPRoom, accept: boolean) {
  const h = room.state.hand!;
  const { from, to } = h.sideShow!;
  h.sideShow = null;
  if (!accept) {
    log(room, `${nameOf(room, to)} denied the side show`);
    setTurn(h, nextActive(h, from));
    return;
  }
  const loser = cmp(h, from, to) > 0 ? to : from; // tie → requester loses
  h.hp[loser].folded = true;
  log(room, `Side show: ${nameOf(room, loser)} lost and packed`);
  afterAction(room, from);
}

function startHand(room: TPRoom) {
  const s = room.state;
  for (const p of room.players) {
    if (p.bot && p.chips < BOOT) {
      p.chips = STARTING_CHIPS;
      log(room, `${p.name} re-bought ₹${STARTING_CHIPS} chips`);
    }
  }
  const eligible = room.players.filter((p) => p.chips >= BOOT && isOnline(p));
  if (eligible.length < 2) fail("Need at least 2 online players with chips");

  const n = room.players.length;
  let d = Math.min(s.dealerIdx, n - 1);
  for (let k = 1; k <= n; k++) {
    const cand = room.players[(d + k + n) % n];
    if (eligible.includes(cand)) {
      d = (d + k + n) % n;
      break;
    }
  }
  s.dealerIdx = d;
  const dealer = room.players[d];
  const order = room.players.filter((p) => eligible.includes(p));
  const deck = newShuffledDeck();
  const h: Hand = {
    number: ++s.handCount,
    order: order.map((p) => p.id),
    hp: {},
    pot: 0,
    stake: BOOT,
    turn: null,
    turnDeadline: 0,
    botAt: 0,
    joker: isJoker(room) ? deck.pop()! : null,
    sideShow: null,
    result: null,
  };
  for (const p of order) h.hp[p.id] = { cards: deck.splice(0, 3), seen: false, folded: false, bet: 0, moves: 0 };
  s.hand = h;
  for (const p of order) pay(room, h, p.id, BOOT);
  setTurn(h, nextActive(h, dealer.id));
  log(room, `— Hand #${h.number} dealt. Boot ₹${BOOT} each, pot ₹${h.pot} —`);
  if (h.joker) log(room, `🃏 Joker this hand: every ${rankName(h.joker.r)} is wild`);
}

const rankName = (r: number) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[r] ?? String(r);

function apply(room: TPRoom, p: Player, a: Action) {
  const h = room.state.hand;
  const inHand = !!h && !h.result && !!h.hp[p.id] && !h.hp[p.id].folded;
  switch (a.type) {
    case "see": {
      if (!inHand) fail("You're not in this hand");
      if (!h!.hp[p.id].seen) {
        h!.hp[p.id].seen = true;
        log(room, `${p.name} saw their cards`);
      }
      return;
    }
    case "chaal": {
      const hh = requireTurn(room, p);
      const raise = !!a.raise;
      const cost = chaalCost(hh, p.id, raise);
      if (p.chips < cost) {
        const paid = pay(room, hh, p.id, cost);
        log(room, `${p.name} went all-in with ₹${paid}`);
        return showdownAll(room, "all-in showdown");
      }
      pay(room, hh, p.id, cost);
      hh.hp[p.id].moves++;
      if (raise) hh.stake *= 2;
      log(room, `${p.name} ${raise ? "raised" : hh.hp[p.id].seen ? "chaal" : "blind"} ₹${cost}`);
      return afterAction(room, p.id);
    }
    case "pack": {
      if (!inHand) fail("You're not in this hand");
      const hh = h!;
      hh.hp[p.id].folded = true;
      log(room, `${p.name} packed`);
      if (hh.sideShow && (hh.sideShow.from === p.id || hh.sideShow.to === p.id)) {
        const from = hh.sideShow.from;
        hh.sideShow = null;
        if (active(hh).length > 1) setTurn(hh, nextActive(hh, from));
      }
      if (active(hh).length === 1) finishHand(room, active(hh), "everyone else packed", []);
      else if (hh.turn === p.id) afterAction(room, p.id);
      return;
    }
    case "show": {
      const hh = requireTurn(room, p);
      const left = active(hh);
      if (left.length !== 2) fail("Show is only allowed when 2 players remain");
      const other = left.find((id) => id !== p.id)!;
      const cost = chaalCost(hh, p.id, false);
      pay(room, hh, p.id, cost);
      log(room, `${p.name} paid ₹${cost} and asked for a show`);
      const winner = cmp(hh, p.id, other) > 0 ? p.id : other; // tie → asker loses
      return finishHand(room, [winner], `show (${handName(hh, winner)})`, left);
    }
    case "sideshow": {
      const hh = requireTurn(room, p);
      if (!hh.hp[p.id].seen) fail("You must see your cards to ask for a side show");
      if (active(hh).length < 3) fail("Use Show when only 2 players remain");
      const target = prevActive(hh, p.id);
      if (!hh.hp[target].seen) fail(`${nameOf(room, target)} is playing blind — no side show`);
      const cost = chaalCost(hh, p.id, false);
      if (p.chips < cost) fail("Not enough chips");
      pay(room, hh, p.id, cost);
      hh.sideShow = { from: p.id, to: target, deadline: Date.now() + SIDESHOW_MS };
      log(room, `${p.name} paid ₹${cost} and asked ${nameOf(room, target)} for a side show`);
      return;
    }
    case "sideshow-reply": {
      if (!h || !h.sideShow || h.sideShow.to !== p.id) fail("No side show request for you");
      return resolveSideShow(room, !!a.accept);
    }
    case "rebuy": {
      if (inHand) fail("Finish the current hand first");
      if (p.chips >= BOOT * 5) fail("You still have chips");
      p.chips = STARTING_CHIPS;
      log(room, `${p.name} re-bought ₹${STARTING_CHIPS} chips`);
      return;
    }
    default:
      fail("Unknown action");
  }
}

// ---------- computer players ----------

function strength(h: Hand, id: string) {
  const e = score(h, id);
  const top = e.tiebreak[0] ?? 0;
  if (e.category === 0) return 0.05 + ((top - 2) / 12) * 0.3;
  return Math.min(1, 0.35 + e.category * 0.13 + (top / 16) * 0.12);
}

function botMove(room: TPRoom, p: Player) {
  const h = room.state.hand!;
  const me = h.hp[p.id];
  const left = active(h).length;
  const pressure = h.stake / BOOT;
  const run = (a: Action) => {
    try {
      apply(room, p, a);
    } catch {
      apply(room, p, { type: "pack" });
    }
  };

  if (!me.seen) {
    const lookChance = 0.15 + me.moves * 0.2 + (pressure >= 4 ? 0.3 : 0);
    if (Math.random() > lookChance) {
      if (left === 2 && me.moves >= 4 && Math.random() < 0.3) return run({ type: "show" });
      return run({ type: "chaal", raise: Math.random() < 0.1 && pressure < 4 });
    }
    me.seen = true;
    log(room, `${p.name} saw their cards`);
  }

  const s = strength(h, p.id);
  const affordable = p.chips >= chaalCost(h, p.id, false);
  if (left === 2) {
    if (!affordable) return run({ type: "show" });
    if (s >= 0.75 && Math.random() < 0.5 && pressure < 16) return run({ type: "chaal", raise: true });
    if (s < 0.2 && pressure >= 2) return run({ type: "pack" });
    if (s < 0.45 && me.moves >= 1 && Math.random() < 0.35) return run({ type: "pack" });
    if (me.moves >= 2 || pressure >= 8 || s < 0.5) return run({ type: "show" });
    return run({ type: "chaal" });
  }
  const foldBar = Math.min(0.6, 0.15 + me.moves * 0.06 + pressure * 0.03);
  if (s < foldBar && Math.random() < 0.75) return run({ type: "pack" });
  if (!affordable) return run({ type: s >= 0.5 ? "chaal" : "pack" });
  if (s >= 0.3 && s < 0.6 && h.hp[prevActive(h, p.id)].seen && Math.random() < 0.25)
    return run({ type: "sideshow" });
  if (s >= 0.7 && Math.random() < 0.4 && pressure < 16) return run({ type: "chaal", raise: true });
  return run({ type: "chaal" });
}

// ---------- engine ----------

export const teenPatti: Engine<TPState> = {
  title: "Teen Patti",
  minPlayers: 2,
  maxPlayers: 6,
  init: () => ({ dealerIdx: -1, hand: null, handCount: 0 }),
  start: startHand,
  live: (room) => !!room.state.hand && !room.state.hand.result,
  inRound: (room, id) => {
    const h = room.state.hand;
    return !!h && !h.result && !!h.hp[id] && !h.hp[id].folded;
  },
  apply,
  tick(room, now) {
    const h = room.state.hand;
    if (h && !h.result) {
      if (h.sideShow && now > h.sideShow.deadline) {
        resolveSideShow(room, false);
        return true;
      }
      const ssTo = h.sideShow && playerOf(room, h.sideShow.to);
      if (h.sideShow && ssTo?.bot && now > h.sideShow.deadline - SIDESHOW_MS + 1500) {
        resolveSideShow(room, strength(h, ssTo.id) >= 0.5);
        return true;
      }
      const turnP = h.turn ? playerOf(room, h.turn) : undefined;
      if (!h.sideShow && turnP?.bot && now > h.botAt) {
        botMove(room, turnP);
        return true;
      }
      if (!h.sideShow && h.turn && now > h.turnDeadline) {
        h.hp[h.turn].folded = true;
        log(room, `${nameOf(room, h.turn)} ran out of time and packed`);
        afterAction(room, h.turn);
        return true;
      }
      return false;
    }
    const eligible = room.players.filter((p) => (p.bot || p.chips >= BOOT) && isOnline(p, now));
    if (h?.result && readyForAutoNext(room, h.result.at, now, eligible)) {
      startHand(room);
      return true;
    }
    return false;
  },
  onRemove(room, id) {
    const h = room.state.hand;
    const idx = room.players.findIndex((p) => p.id === id);
    if (idx <= room.state.dealerIdx) room.state.dealerIdx--;
    if (h && !h.result && h.hp[id] && !h.hp[id].folded) {
      const p = playerOf(room, id)!;
      apply(room, p, { type: "pack" });
    }
  },
  view(room, viewer) {
    const s = room.state;
    const h = s.hand;
    return {
      boot: BOOT,
      potLimit: POT_LIMIT,
      turnMs: TURN_MS,
      joker: isJoker(room),
      seats: Object.fromEntries(
        room.players.map((p, i) => {
          const hp = h?.hp[p.id];
          const reveal = !!h?.result && h.result.reveal.includes(p.id);
          const own = viewer?.id === p.id && hp?.seen;
          return [
            p.id,
            {
              dealer: i === s.dealerIdx && !!h,
              inHand: !!hp,
              seen: !!hp?.seen,
              folded: !!hp?.folded,
              bet: hp?.bet ?? 0,
              cards: hp && (reveal || own) ? hp.cards : null,
              handName: hp && h && (reveal || own) ? handName(h, p.id) : null,
            },
          ];
        }),
      ),
      hand: h && {
        number: h.number,
        pot: h.pot,
        stake: h.stake,
        turn: h.turn,
        turnDeadline: h.turnDeadline,
        jokerCard: h.joker,
        activeCount: active(h).length,
        sideShow: h.sideShow,
        sideShowTarget: h.turn && h.hp[h.turn] ? prevActive(h, h.turn) : null,
        result: h.result,
      },
    };
  },
};

export interface TeenPattiView {
  boot: number;
  potLimit: number;
  turnMs: number;
  joker: boolean;
  seats: Record<
    string,
    {
      dealer: boolean;
      inHand: boolean;
      seen: boolean;
      folded: boolean;
      bet: number;
      cards: Card[] | null;
      handName: string | null;
    }
  >;
  hand: null | {
    number: number;
    pot: number;
    stake: number;
    turn: string | null;
    turnDeadline: number;
    jokerCard: Card | null;
    activeCount: number;
    sideShow: { from: string; to: string; deadline: number } | null;
    sideShowTarget: string | null;
    result: Hand["result"];
  };
}
