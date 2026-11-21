// Color Rush: match the top card by color or symbol, use action cards,
// shout "Last card!" with one card left, and be first to empty your hand.
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

export type Color = "R" | "Y" | "G" | "B";
export type Face = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "skip" | "rev" | "+2" | "wild" | "+4";
export interface CRCard {
  id: number;
  c: Color | "W";
  v: Face;
}

export const COLORS: Color[] = ["R", "Y", "G", "B"];
export const COLOR_NAME: Record<Color, string> = { R: "Red", Y: "Yellow", G: "Green", B: "Blue" };
export const TURN_MS = 30_000;
const HAND_SIZE = 7;

interface Round {
  number: number;
  order: string[];
  hands: Record<string, CRCard[]>;
  draw: CRCard[];
  discard: CRCard[];
  color: Color;
  dir: 1 | -1;
  turn: string;
  turnDeadline: number;
  botAt: number;
  drawnCard: number | null; // id of the card drawn this turn (may be played)
  called: Record<string, boolean>; // shouted "Last card!"
  catchable: string | null; // has 1 card, didn't call — can be caught
  catchBotAt: number | null;
  places: string[]; // finish order; finished players sit out the rest of the round
  result: null | { places: string[]; at: number };
}

interface CRState {
  round: Round | null;
  roundCount: number;
  dealer: number;
}

type CRRoom = Room<CRState>;

function newDeck(): CRCard[] {
  const deck: CRCard[] = [];
  let id = 0;
  for (const c of COLORS) {
    deck.push({ id: id++, c, v: "0" });
    for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "rev", "+2"] as Face[]) {
      deck.push({ id: id++, c, v }, { id: id++, c, v });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ id: id++, c: "W", v: "wild" }, { id: id++, c: "W", v: "+4" });
  return shuffle(deck);
}

const top = (r: Round) => r.discard[r.discard.length - 1];
export const playable = (card: CRCard, topCard: CRCard, color: Color) =>
  card.c === "W" || card.c === color || card.v === topCard.v;
const faceName = (c: CRCard) =>
  c.c === "W"
    ? c.v === "+4"
      ? "Wild +4"
      : "Wild"
    : `${COLOR_NAME[c.c]} ${({ skip: "Skip", rev: "Reverse", "+2": "+2" } as Record<string, string>)[c.v] ?? c.v}`;

const isActive = (r: Round, id: string) => r.hands[id] !== undefined && !r.places.includes(id);
const inPlay = (r: Round) => r.order.filter((id) => isActive(r, id));
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function step(r: Round, from: string, n = 1) {
  const ids = r.order;
  let i = ids.indexOf(from);
  let moved = 0;
  while (moved < n) {
    i = (i + r.dir + ids.length) % ids.length;
    if (isActive(r, ids[i])) moved++;
  }
  return ids[i];
}

function drawCards(r: Round, id: string, n: number) {
  const got: CRCard[] = [];
  for (let k = 0; k < n; k++) {
    if (!r.draw.length) {
      const keep = r.discard.pop()!;
      r.draw = shuffle(r.discard);
      r.discard = [keep];
    }
    const c = r.draw.pop();
    if (!c) break;
    got.push(c);
  }
  r.hands[id].push(...got);
  if (r.hands[id].length > 1) r.called[id] = false;
  return got;
}

function setTurn(r: Round, id: string) {
  r.turn = id;
  r.turnDeadline = Date.now() + TURN_MS;
  r.botAt = botDelay();
  r.drawnCard = null;
}

/** Place points: 10 for every player you finish ahead of. */
const placePoints = (r: Round, place: number) => Math.max(0, r.order.length - 1 - place) * 10;

/** A player emptied their hand: record their place; end the round when one player is left. */
function placeFinished(room: CRRoom, id: string) {
  const r = room.state.round!;
  const place = r.places.length;
  r.places.push(id);
  const pts = placePoints(r, place);
  const p = playerOf(room, id);
  if (p) p.score += pts;
  log(room, `${place === 0 ? "🏆" : "🎉"} ${nameOf(room, id)} finished ${ORDINAL[place]} (+${pts} pts)`);
  const left = inPlay(r);
  if (left.length <= 1) endRound(room);
}

function endRound(room: CRRoom) {
  const r = room.state.round!;
  const last = inPlay(r);
  for (const id of last) r.places.push(id);
  r.result = { places: [...r.places], at: Date.now() };
  if (last.length) log(room, `${nameOf(room, last[0])} is left holding cards — round over`);
}

function start(room: CRRoom) {
  const s = room.state;
  const players = room.players.filter((p) => isOnline(p));
  if (players.length < 2) fail("Need at least 2 online players");
  s.dealer = (s.dealer + 1) % players.length;
  const order = [...players.slice(s.dealer), ...players.slice(0, s.dealer)].map((p) => p.id);
  const deck = newDeck();
  const hands: Record<string, CRCard[]> = {};
  for (const id of order) hands[id] = deck.splice(0, HAND_SIZE);
  // First discard must be a number card.
  let firstIdx = deck.findIndex((c) => /^\d$/.test(c.v));
  if (firstIdx < 0) firstIdx = 0;
  const [first] = deck.splice(firstIdx, 1);
  const r: Round = {
    number: ++s.roundCount,
    order,
    hands,
    draw: deck,
    discard: [first],
    color: first.c as Color,
    dir: 1,
    turn: order[0],
    turnDeadline: 0,
    botAt: 0,
    drawnCard: null,
    called: {},
    catchable: null,
    catchBotAt: null,
    places: [],
    result: null,
  };
  s.round = r;
  setTurn(r, order[0]);
  log(room, `— Round #${r.number}: ${HAND_SIZE} cards each. Starting card: ${faceName(first)} —`);
}

function requireTurn(room: CRRoom, p: Player) {
  const r = room.state.round;
  if (!r || r.result) fail("No round in progress");
  if (r!.turn !== p.id) fail("It's not your turn");
  return r!;
}

function clearCatchableIfMovedOn(r: Round, actor: string) {
  if (r.catchable && r.catchable !== actor) {
    r.catchable = null;
    r.catchBotAt = null;
  }
}

function play(room: CRRoom, p: Player, cardId: number, chosen?: unknown) {
  const r = requireTurn(room, p);
  const hand = r.hands[p.id];
  const card = hand.find((c) => c.id === cardId) ?? fail("You don't have that card");
  if (r.drawnCard !== null && card.id !== r.drawnCard) fail("You can only play the card you just drew");
  if (!playable(card, top(r), r.color)) fail("That card doesn't match");
  if (card.c === "W" && !COLORS.includes(chosen as Color)) fail("Pick a color");
  clearCatchableIfMovedOn(r, p.id);

  r.hands[p.id] = hand.filter((c) => c.id !== card.id);
  r.discard.push(card);
  r.color = card.c === "W" ? (chosen as Color) : card.c;
  log(room, `${p.name} played ${faceName(card)}${card.c === "W" ? ` → ${COLOR_NAME[r.color]}` : ""}`);

  const left = r.hands[p.id].length;
  if (left === 0) {
    placeFinished(room, p.id);
    if (r.result) return;
  }
  if (left === 1 && !r.called[p.id]) {
    r.catchable = p.id;
    r.catchBotAt = scheduleCatch(room, r, p.id);
  }

  const players = inPlay(r).length;
  let next = step(r, p.id);
  if (card.v === "rev") {
    if (players === 2 && left > 0) next = p.id;
    else {
      r.dir = r.dir === 1 ? -1 : 1;
      next = step(r, p.id);
    }
  } else if (card.v === "skip") {
    log(room, `${nameOf(room, next)} is skipped`);
    next = step(r, p.id, 2);
  } else if (card.v === "+2" || card.v === "+4") {
    const n = card.v === "+2" ? 2 : 4;
    drawCards(r, next, n);
    log(room, `${nameOf(room, next)} draws ${n} and is skipped`);
    next = step(r, p.id, 2);
  }
  setTurn(r, next);
}

function draw(room: CRRoom, p: Player) {
  const r = requireTurn(room, p);
  if (r.drawnCard !== null) fail("You already drew — play it or pass");
  clearCatchableIfMovedOn(r, p.id);
  const [c] = drawCards(r, p.id, 1);
  if (c && playable(c, top(r), r.color)) {
    r.drawnCard = c.id;
    log(room, `${p.name} drew a card`);
    return;
  }
  log(room, `${p.name} drew a card and passed`);
  setTurn(r, step(r, p.id));
}

function apply(room: CRRoom, p: Player, a: Action) {
  const r = room.state.round;
  switch (a.type) {
    case "play":
      return play(room, p, Number(a.cardId), a.color);
    case "draw":
      return draw(room, p);
    case "pass": {
      const rr = requireTurn(room, p);
      if (rr.drawnCard === null) fail("Draw a card first");
      log(room, `${p.name} passed`);
      return setTurn(rr, step(rr, p.id));
    }
    case "lastcard": {
      if (!r || r.result || !r.hands[p.id]) fail("No round in progress");
      if (r!.hands[p.id].length > 2) fail("You can call it when you have 2 cards or fewer");
      if (!r!.called[p.id]) log(room, `📣 ${p.name}: "Last card!"`);
      r!.called[p.id] = true;
      if (r!.catchable === p.id) {
        r!.catchable = null;
        r!.catchBotAt = null;
      }
      return;
    }
    case "catch": {
      if (!r || r.result || !r.catchable) fail("Nobody to catch");
      const target = r!.catchable!;
      if (target === p.id) fail("You can't catch yourself");
      if (!r!.hands[p.id]) fail("You're not in this round");
      drawCards(r!, target, 2);
      r!.catchable = null;
      r!.catchBotAt = null;
      log(room, `🫵 ${p.name} caught ${nameOf(room, target)} without "Last card!" — they draw 2`);
      return;
    }
    default:
      fail("Unknown action");
  }
}

// ---------- computer players ----------

function scheduleCatch(room: CRRoom, r: Round, target: string) {
  const bots = inPlay(r).filter((id) => id !== target && playerOf(room, id)?.bot);
  if (!bots.length || Math.random() > 0.7) return null;
  return Date.now() + 1200 + Math.random() * 1800;
}

function bestColor(hand: CRCard[]): Color {
  const count: Record<Color, number> = { R: 0, Y: 0, G: 0, B: 0 };
  for (const c of hand) if (c.c !== "W") count[c.c]++;
  return COLORS.reduce((a, b) => (count[b] > count[a] ? b : a), COLORS[Math.floor(Math.random() * 4)]);
}

function botTurn(room: CRRoom, p: Player) {
  const r = room.state.round!;
  const hand = r.hands[p.id];
  if (hand.length === 2 && Math.random() < 0.9) apply(room, p, { type: "lastcard" });
  const options = hand.filter((c) => playable(c, top(r), r.color) && (r.drawnCard === null || c.id === r.drawnCard));
  if (!options.length) {
    if (r.drawnCard !== null) return apply(room, p, { type: "pass" });
    draw(room, p);
    return; // if the drawn card is playable, we'll act again next tick
  }
  const nextCount = r.hands[step(r, p.id)]?.length ?? 9;
  const rank = (c: CRCard) => {
    if (c.c === "W") return c.v === "+4" ? (nextCount <= 2 ? 0 : 9) : 8; // save wilds
    if (["skip", "+2", "rev"].includes(c.v)) return nextCount <= 3 ? 1 : 4;
    return c.c === r.color ? 3 : 5;
  };
  const pick = [...options].sort((a, b) => rank(a) - rank(b))[0];
  const rest = hand.filter((c) => c.id !== pick.id);
  play(room, p, pick.id, pick.c === "W" ? bestColor(rest) : undefined);
}

// ---------- engine ----------

export const colorRush: Engine<CRState> = {
  title: "Color Rush",
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
      if (r.catchable && r.catchBotAt && now >= r.catchBotAt) {
        const catcher = inPlay(r).find((id) => id !== r.catchable && playerOf(room, id)?.bot);
        r.catchBotAt = null;
        if (catcher) apply(room, playerOf(room, catcher)!, { type: "catch" });
        return true;
      }
      const turnP = playerOf(room, r.turn);
      if (turnP?.bot && now >= r.botAt) {
        botTurn(room, turnP);
        if (r.turn === turnP.id && r.drawnCard !== null) r.botAt = botDelay(600, 600);
        return true;
      }
      if (now > r.turnDeadline && turnP) {
        log(room, `${turnP.name} ran out of time`);
        if (r.drawnCard === null) draw(room, turnP);
        if (!r.result && r.turn === turnP.id) setTurn(r, step(r, turnP.id));
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
    const next = step(r, id);
    r.draw.unshift(...r.hands[id]);
    const wasTurn = r.turn === id;
    delete r.hands[id];
    if (r.catchable === id) r.catchable = null;
    if (inPlay(r).length <= 1) return endRound(room);
    if (wasTurn) setTurn(r, next);
  },
  view(room, viewer) {
    const r = room.state.round;
    return {
      turnMs: TURN_MS,
      round: r && {
        number: r.number,
        turn: r.turn,
        turnDeadline: r.turnDeadline,
        dir: r.dir,
        color: r.color,
        top: top(r),
        recent: r.discard.slice(-4),
        drawCount: r.draw.length,
        counts: Object.fromEntries(r.order.map((id) => [id, r.hands[id]?.length ?? null])),
        called: r.called,
        catchable: r.catchable,
        myHand: viewer && r.hands[viewer.id] ? r.hands[viewer.id] : null,
        places: r.places,
        placePoints: r.order.map((_, i) => placePoints(r, i)),
        drawnCard: viewer && r.turn === viewer.id ? r.drawnCard : null,
        result: r.result,
      },
    };
  },
};

export interface ColorRushView {
  turnMs: number;
  round: null | {
    number: number;
    turn: string;
    turnDeadline: number;
    dir: 1 | -1;
    color: Color;
    top: CRCard;
    recent: CRCard[]; // last few discards, oldest first (top card last)
    drawCount: number;
    counts: Record<string, number | null>;
    called: Record<string, boolean>;
    catchable: string | null;
    myHand: CRCard[] | null;
    places: string[];
    placePoints: number[];
    drawnCard: number | null;
    result: Round["result"];
  };
}
