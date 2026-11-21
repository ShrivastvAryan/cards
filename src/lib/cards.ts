// Card + hand evaluation for Teen Patti (shared by server and client).

export type Suit = "S" | "H" | "D" | "C" | "X"; // X = Joker (Old Maid only)
export interface Card {
  r: number; // 2..14 (11=J, 12=Q, 13=K, 14=A); 0 = Joker
  s: Suit;
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣", X: "🃏" };
export const JOKER: Card = { r: 0, s: "X" };
export const isJokerCard = (c: Card) => c.r === 0;
export const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  0: "JOKER",
};
export const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r);

export function newShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  // Fisher–Yates with crypto randomness
  const rand = new Uint32Array(deck.length);
  crypto.getRandomValues(rand);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const HAND_NAMES = [
  "High Card",
  "Pair",
  "Color",
  "Sequence",
  "Pure Sequence",
  "Trail",
] as const;

export interface HandScore {
  category: number; // index into HAND_NAMES
  tiebreak: number[]; // compared lexicographically
  name: string;
}

export function evaluateHand(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);

  // Sequences: A-K-Q highest, A-2-3 second highest, then K-Q-J ... 4-3-2.
  let seqHigh = 0;
  if (ranks[0] === 14 && ranks[1] === 13 && ranks[2] === 12) seqHigh = 16;
  else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) seqHigh = 15;
  else if (ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2]) seqHigh = ranks[0];

  let category: number;
  let tiebreak: number[];
  if (ranks[0] === ranks[2]) {
    category = 5;
    tiebreak = [ranks[0]];
  } else if (seqHigh && flush) {
    category = 4;
    tiebreak = [seqHigh];
  } else if (seqHigh) {
    category = 3;
    tiebreak = [seqHigh];
  } else if (flush) {
    category = 2;
    tiebreak = ranks;
  } else if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) {
    category = 1;
    const pair = ranks[1];
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    tiebreak = [pair, kicker];
  } else {
    category = 0;
    tiebreak = ranks;
  }
  return { category, tiebreak, name: HAND_NAMES[category] };
}

/** >0 if a beats b, <0 if b beats a, 0 if equal. */
export function compareHands(a: Card[], b: Card[]): number {
  const ea = evaluateHand(a);
  const eb = evaluateHand(b);
  if (ea.category !== eb.category) return ea.category - eb.category;
  for (let i = 0; i < Math.max(ea.tiebreak.length, eb.tiebreak.length); i++) {
    const d = (ea.tiebreak[i] ?? 0) - (eb.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function compareScores(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const ALL_CARDS: Card[] = SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ r: i + 2, s })));

/**
 * Best possible score when every card of `jokerRank` is wild (Joker mode).
 * Without a joker rank this is the normal evaluation.
 */
export function scoreHand(cards: Card[], jokerRank?: number | null): HandScore & { usedJoker: boolean } {
  const wilds = jokerRank ? cards.filter((c) => c.r === jokerRank) : [];
  if (!wilds.length) return { ...evaluateHand(cards), usedJoker: false };
  if (wilds.length === 3) return { category: 5, tiebreak: [14], name: HAND_NAMES[5], usedJoker: true };
  const fixed = cards.filter((c) => c.r !== jokerRank);
  let best: HandScore | null = null;
  const tryHand = (h: Card[]) => {
    const e = evaluateHand(h);
    if (!best || compareScores(e, best) > 0) best = e;
  };
  if (wilds.length === 1) {
    for (const a of ALL_CARDS) tryHand([...fixed, a]);
  } else {
    for (const a of ALL_CARDS) for (const b of ALL_CARDS) tryHand([...fixed, a, b]);
  }
  return { ...(best as unknown as HandScore), usedJoker: true };
}

export const sameCard = (a: Card, b: Card) => !!a && !!b && a.r === b.r && a.s === b.s;
/** Stable text key for a card, e.g. "7H" (safe to keep in React state). */
export const cardKey = (c: Card) => `${c.r}${c.s}`;
