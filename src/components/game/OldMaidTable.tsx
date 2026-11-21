"use client";

import { useState } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import { type Card, cardKey, isJokerCard, rankLabel, sameCard } from "@/lib/cards";
import type { OldMaidView } from "@/lib/games/oldmaid";
import { Btn, HostBar, OpponentStrip, ResultBanner, secsLeft, type TableCtx } from "./ui";

/** Every pair (same rank, never the Joker) currently in a hand. */
function pairsIn(hand: Card[]): [Card, Card][] {
  const byRank = new Map<number, Card[]>();
  for (const c of hand) if (!isJokerCard(c)) byRank.set(c.r, [...(byRank.get(c.r) ?? []), c]);
  const out: [Card, Card][] = [];
  for (const cards of byRank.values()) for (let i = 0; i + 1 < cards.length; i += 2) out.push([cards[i], cards[i + 1]]);
  return out;
}

export function OldMaidTable({ ctx }: { ctx: TableCtx }) {
  const { view, now, busy, send, me } = ctx;
  const g = view.g as unknown as OldMaidView;
  const r = g.round;
  const live = !!r && !r.result;
  const nameOf = (id: string) => (id === me.id ? "You" : (view.players.find((p) => p.id === id)?.name ?? "Player"));

  const myTurn = live && r.turn === me.id;
  const target = live ? r.target : null;
  const targetCount = target ? (r?.counts[target] ?? 0) : 0;
  const iAmSafe = !!r?.safe.includes(me.id);
  const ld = r?.lastDraw;
  const recent = ld && now - ld.at < 6000 ? ld : null;
  const [picked, setPicked] = useState<string[]>([]); // card keys, e.g. "7H"
  const hand = r?.myHand ?? [];
  const sel = hand.filter((c) => picked.includes(cardKey(c)));
  const pairs = live && !iAmSafe ? pairsIn(hand) : [];
  const pairable = (c: Card) => pairs.some(([a, b]) => sameCard(a, c) || sameCard(b, c));
  const selIsPair = sel.length === 2 && sel[0].r === sel[1].r && !isJokerCard(sel[0]);
  const toggle = (c: Card) => {
    const k = cardKey(c);
    setPicked((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s.slice(-1), k]));
  };
  const throwPair = (pair: Card[]) => {
    send({ type: "pair", cards: pair });
    setPicked([]);
  };
  const drewMatch =
    recent?.by === me.id && recent.card && !isJokerCard(recent.card) && hand.filter((c) => c.r === recent.card!.r).length >= 2;

  // Fan for the face-down hand we pick from.
  const spread = Math.min(8, 60 / Math.max(targetCount, 1));
  const mid = (targetCount - 1) / 2;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <OpponentStrip
        ctx={ctx}
        turnId={live ? r.turn : null}
        turnDeadline={r?.turnDeadline}
        turnMs={g.turnMs}
        winners={r?.result ? r.result.safe.slice(0, 1) : []}
        sub={(p) => {
          const c = r?.counts[p.id];
          return r && c !== undefined && c !== null ? `${c} cards` : `${p.score} safe`;
        }}
        badge={(p) =>
          r?.result?.loser === p.id ? (
            <span className="mt-0.5 rounded-full bg-fuchsia-600 px-1.5 text-[9px] font-black">👵 OLD MAID</span>
          ) : r?.safe.includes(p.id) ? (
            <span className="mt-0.5 rounded-full bg-emerald-600 px-1.5 text-[9px] font-black">✅ SAFE</span>
          ) : target === p.id ? (
            <span className="mt-0.5 rounded-full bg-amber-400 text-zinc-900 px-1.5 text-[9px] font-black">PICKING</span>
          ) : null
        }
      />

      {/* board */}
      <div className="relative flex-1 min-h-[260px] mx-3 my-1">
        <div className="felt absolute inset-0 rounded-[2.5rem]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          {r ? (
            <>
              <div className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold">
                🗑️ {r.discarded} thrown away
                {r.lastPair && (
                  <span className="text-white/60">
                    {" "}
                    · {nameOf(r.lastPair.by)}: pair of {rankLabel(r.lastPair.cards[0].r)}s
                  </span>
                )}
              </div>

              {live && target && (
                <>
                  <p className="text-sm font-bold">
                    {myTurn ? (
                      <span className="text-amber-300">Pick a card from {nameOf(target)} 👇</span>
                    ) : (
                      <span className="text-white/80">
                        {nameOf(r.turn)} is picking from {target === me.id ? "you" : nameOf(target)}
                      </span>
                    )}
                  </p>
                  <div className="no-scrollbar max-w-full overflow-x-auto overflow-y-hidden px-4 pt-4 pb-3">
                    <div className="flex w-max mx-auto items-end">
                      {Array.from({ length: targetCount }).map((_, i) => (
                        <button
                          key={`${r.turn}-${i}`}
                          onClick={() => myTurn && !busy && send({ type: "draw", index: i })}
                          disabled={!myTurn || busy}
                          aria-label={`Take card ${i + 1}`}
                          className={`${i ? "-ml-6" : ""} origin-bottom transition-transform ${
                            myTurn ? "hover:-translate-y-3 active:-translate-y-3" : ""
                          }`}
                          style={{ transform: `rotate(${(i - mid) * spread}deg)`, zIndex: i }}
                        >
                          <div className={`card-back rounded-xl ${myTurn ? "w-14 h-20" : "w-10 h-14"} shadow-lg`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-white/60">
                    {myTurn ? `${secsLeft(r.turnDeadline, now)}s to pick` : `${secsLeft(r.turnDeadline, now)}s`}
                  </p>
                </>
              )}

              {recent && (
                <div className="pop rounded-2xl bg-black/45 px-3 py-2 text-sm">
                  {recent.by === me.id ? (
                    <span className="flex items-center gap-2">
                      You took
                      {recent.card && <PlayingCard card={recent.card} size="sm" />}
                      {recent.card && isJokerCard(recent.card)
                        ? "— the Joker 😱 pass it on!"
                        : drewMatch
                          ? "— it makes a pair! 👇"
                          : "— no match"}
                    </span>
                  ) : recent.from === me.id ? (
                    <span>{nameOf(recent.by)} took a card from you</span>
                  ) : (
                    <span>
                      {nameOf(recent.by)} took a card from {nameOf(recent.from)}
                    </span>
                  )}
                </div>
              )}

              {r.result && (
                <ResultBanner
                  title={
                    r.result.loser
                      ? `🃏 ${nameOf(r.result.loser)} ${r.result.loser === me.id ? "are" : "is"} the Old Maid!`
                      : "Round over"
                  }
                  sub={r.result.safe.length ? `First safe: ${nameOf(r.result.safe[0])}` : undefined}
                />
              )}
            </>
          ) : (
            <div className="text-white/70 text-sm">
              <div className="text-5xl mb-2">👵</div>
              {view.players.length < 2 ? "Waiting for players…" : `${view.players.length} players at the table`}
            </div>
          )}
        </div>
      </div>

      {/* my hand */}
      <div className="shrink-0 pb-[max(env(safe-area-inset-bottom),10px)]">
        {live && iAmSafe && (
          <p className="text-center text-emerald-300 font-bold py-3">✅ You&apos;re safe! Watching the rest…</p>
        )}
        {pairs.length > 0 && (
          <div className="px-3 pt-1 space-y-2">
            <p className="text-center text-xs font-bold text-emerald-300">
              You have {pairs.length} pair{pairs.length > 1 ? "s" : ""} — throw {pairs.length > 1 ? "them" : "it"} away!
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {pairs.length > 1 && (
                <Btn
                  color="bg-emerald-600"
                  className="shrink-0"
                  onClick={() => {
                    send({ type: "pair-all" });
                    setPicked([]);
                  }}
                  disabled={busy}
                >
                  Throw all {pairs.length}
                </Btn>
              )}
              {pairs.map((pair) => (
                <Btn
                  key={`${pair[0].r}${pair[0].s}${pair[1].s}`}
                  color="bg-emerald-800/80"
                  className="shrink-0"
                  onClick={() => throwPair(pair)}
                  disabled={busy}
                >
                  🗑️ {rankLabel(pair[0].r)}s
                </Btn>
              ))}
            </div>
          </div>
        )}
        {r?.myHand && r.myHand.length > 0 && (
          <>
            <div className="no-scrollbar overflow-x-auto overflow-y-hidden px-4 pt-5 pb-2">
              <div className="flex w-max mx-auto">
                {r.myHand.map((c, i) => {
                  const on = picked.includes(cardKey(c));
                  const glow = pairable(c);
                  return (
                    <button
                      key={`${c.r}${c.s}`}
                      onClick={() => live && !iAmSafe && !isJokerCard(c) && toggle(c)}
                      className={`${i ? "-ml-5" : ""} transition-transform ${on ? "-translate-y-4" : glow ? "-translate-y-1.5" : ""}`}
                      aria-pressed={on}
                      aria-label={isJokerCard(c) ? "Joker" : `${rankLabel(c.r)} ${c.s}`}
                    >
                      <div
                        className={`rounded-lg ${
                          on ? "ring-4 ring-amber-400" : glow ? "ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" : ""
                        }`}
                      >
                        <PlayingCard card={c} size="md" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {sel.length === 2 ? (
              <div className="px-3 pb-1">
                <Btn
                  color={selIsPair ? "bg-amber-400 text-zinc-900" : "bg-zinc-700"}
                  className="w-full"
                  onClick={() => selIsPair && throwPair(sel)}
                  disabled={busy || !selIsPair}
                >
                  {selIsPair ? `Throw away pair of ${rankLabel(sel[0].r)}s` : "Those two don't match"}
                </Btn>
              </div>
            ) : (
              <p className="text-center text-[11px] text-white/40">
                {r.myHand.length} cards · glowing cards make pairs · tap two matching cards to throw them
              </p>
            )}
          </>
        )}
        {!live && (
          <div className="px-3 pt-2">
            <HostBar ctx={ctx} hasRound={!!r} endedAt={r?.result?.at} />
          </div>
        )}
      </div>
    </div>
  );
}
