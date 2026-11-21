// Client-safe info about each game (used by the home hub and table headers).
import type { GameKind } from "./core";

export interface GameInfo {
  id: GameKind;
  title: string;
  tagline: string;
  players: string;
  maxBots: number;
  scoreUnit: string; // what Player.score counts in this game
  emoji: string;
  accent: string; // tailwind gradient classes
  rules: string[];
}

export const GAMES: GameInfo[] = [
  {
    id: "teenpatti",
    title: "Teen Patti",
    tagline: "3 cards, big bluffs. Classic or Joker.",
    players: "2–6 players",
    maxBots: 5,
    scoreUnit: "wins",
    emoji: "👑",
    accent: "from-emerald-500 to-emerald-800",
    rules: [
      "Everyone puts in a ₹10 boot and gets 3 cards. Each guest starts with ₹1000 play chips.",
      "Blind players bet the stake; after “See cards” you bet double. Raise doubles the stake. Pack to fold.",
      "Side show: compare privately with the previous seen player. Show: when 2 are left.",
      "Trail › Pure sequence › Sequence › Color › Pair › High card.",
      "Joker mode: a joker card is turned up — every card of that rank is wild.",
      "Pot limit ₹2000, then everyone shows. 30 seconds per turn.",
    ],
  },
  {
    id: "bluff",
    title: "Bluff",
    tagline: "Lie with a straight face. Call out the liars.",
    players: "2–8 players",
    maxBots: 7,
    scoreUnit: "wins",
    emoji: "🤥",
    accent: "from-rose-500 to-rose-800",
    rules: [
      "All 52 cards are dealt out. First to get rid of every card wins.",
      "Starting a pile? Pick a rank and put 1–4 cards face down, claiming they're that rank.",
      "Next players must claim the same rank — truthfully or not — or pass.",
      "After every play anyone can shout “Bluff!”. Caught lying? You take the whole pile. Wrong call? You take it.",
      "If everyone passes, the pile is cleared and the last player starts a new one.",
    ],
  },
  {
    id: "colorrush",
    title: "Color Rush",
    tagline: "Match colors, drop action cards, race to zero.",
    players: "2–8 players",
    maxBots: 7,
    scoreUnit: "pts",
    emoji: "🌈",
    accent: "from-sky-500 to-violet-700",
    rules: [
      "Everyone gets 7 cards. Play a card that matches the top card's color or symbol.",
      "Skip jumps the next player, Reverse flips direction, +2 makes the next player draw 2 and miss a turn.",
      "Wild picks a new color; Wild +4 also makes the next player draw 4.",
      "Can't play? Draw one — play it if it fits, otherwise your turn ends.",
      "Down to 1 card? Tap “Last card!” first, or anyone can catch you and you draw 2.",
      "Emptied your hand? You're placed (1st, 2nd…) and the rest play on until one player is left.",
      "Points by place: 10 for every player you finish ahead of.",
    ],
  },
  {
    id: "oldmaid",
    title: "Old Maid",
    tagline: "Throw your pairs, dodge the Joker.",
    players: "2–8 players",
    maxBots: 7,
    scoreUnit: "safe",
    emoji: "👵",
    accent: "from-fuchsia-500 to-purple-800",
    rules: [
      "All 52 cards plus one 🃏 Joker are dealt out. The Joker never makes a pair.",
      "Your pairs (two cards of the same rank) glow. Throw them away yourself, any time.",
      "On your turn, pick one face-down card from the next player's hand. If it matches one of yours, throw the pair!",
      "Run out of cards and you're safe. Whoever is left holding the Joker is the Old Maid!",
      "Every safe finish earns a point. If your turn timer runs out, your pairs are thrown and a card is drawn for you.",
    ],
  },
];

export const gameInfo = (id: string) => GAMES.find((g) => g.id === id) ?? GAMES[0];
