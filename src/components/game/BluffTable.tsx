"use client";

import { useState } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import { type Card, cardKey, rankLabel } from "@/lib/cards";
import type { BluffView } from "@/lib/games/bluff";
import { Btn, HostBar, OpponentStrip, ResultBanner, secsLeft, type TableCtx } from "./ui";

const RANKS = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function BluffTable({ ctx }: { ctx: TableCtx }) {
  const { view, now, busy, send, me } = ctx;
  const g = view.g as unknown as BluffView;
  const r = g.round;
  const live = !!r && !r.result;
  const [selected, setSelected] = useState<string[]>([]); // card keys, e.g. "7H"
  const [claim, setClaim] = useState<number | null>(null);
  const nameOf = (id: string) => (id === me.id ? "You" : (view.players.find((p) => p.id === id)?.name ?? "Player"));

  const hand = r?.myHand ?? [];
  // Drop selections that are no longer in hand (after a play or picking up the pile).
  const sel = hand.filter((c) => selected.includes(cardKey(c)));
  const myTurn = live && r.turn === me.id;
  const windowOpen = live && now < r.windowUntil;
  const canAct = myTurn && !windowOpen;
  const startingPile = live && r.claimRank === null;
  const canCall = live && !!r.lastPlay && r.lastPlay.by !== me.id && !!r.myHand;

  const toggle = (c: Card) => {
    const k = cardKey(c);
    setSelected((s) =>
      s.includes(k) ? s.filter((x) => x !== k) : s.filter((x) => hand.some((h) => cardKey(h) === x)).length >= 4 ? s : [...s, k],
    );
  };

  function playSelected() {
    const rank = startingPile ? claim : null;
    send({ type: "play", cards: sel, claim: rank });
    setSelected([]);
    setClaim(null);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <OpponentStrip
        ctx={ctx}
        turnId={live ? r.turn : null}
        turnDeadline={r?.turnDeadline}
        turnMs={g.turnMs}
        winners={r?.result ? [r.result.winner] : []}
        sub={(p) => (r && r.counts[p.id] !== undefined && r.counts[p.id] !== null ? `🂠 ${r.counts[p.id]}` : `${p.score} wins`)}
      />

      {/* center: the pile */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
        {r ? (
          <>
            <div className="relative h-28 w-24">
              {r.pileCount === 0 ? (
                <div className="absolute inset-0 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center text-xs text-white/40">
                  empty pile
                </div>
              ) : (
                Array.from({ length: Math.min(r.pileCount, 6) }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 card-back rounded-xl"
                    style={{ transform: `rotate(${(i - 2) * 6}deg) translate(${i * 2}px, ${-i}px)` }}
                  />
                ))
              )}
              {r.pileCount > 0 && (
                <span className="absolute -bottom-2 -right-3 rounded-full bg-black/80 px-2 py-0.5 text-xs font-bold">
                  {r.pileCount}
                </span>
              )}
            </div>

            {r.claimRank !== null ? (
              <div className="text-sm">
                Pile rank:{" "}
                <span className="inline-block rounded-lg bg-amber-400 text-zinc-900 font-black px-2 py-0.5">
                  {rankLabel(r.claimRank)}
                </span>
              </div>
            ) : (
              live && <div className="text-sm text-white/60">{nameOf(r.turn)} will start a new pile</div>
            )}

            {r.lastPlay && (
              <div className="text-sm">
                <b>{nameOf(r.lastPlay.by)}</b> {r.lastPlay.by === me.id ? "claim" : "claims"}{" "}
                <b className="text-amber-300">
                  {r.lastPlay.count} × {rankLabel(r.lastPlay.claim)}
                </b>
              </div>
            )}

            {r.reveal && (
              <div className={`pop rounded-2xl px-3 py-2 ${r.reveal.liar ? "bg-red-600/30" : "bg-emerald-600/30"}`}>
                <div className="text-sm font-bold mb-1">
                  {r.reveal.liar
                    ? `🚨 ${nameOf(r.reveal.by)} lied!`
                    : `😬 ${nameOf(r.reveal.by)} told the truth!`}
                </div>
                <div className="flex justify-center gap-1">
                  {r.reveal.cards.map((c, i) => (
                    <PlayingCard key={i} card={c} size="sm" />
                  ))}
                </div>
                <div className="text-[11px] text-white/70 mt-1">
                  {nameOf(r.reveal.liar ? r.reveal.by : r.reveal.caller)} picked up the pile
                </div>
              </div>
            )}

            {r.result && (
              <ResultBanner title={`🏆 ${nameOf(r.result.winner)} won!`} sub="First to empty their hand" />
            )}
          </>
        ) : (
          <div className="text-white/60 text-sm">
            <div className="text-4xl mb-2">🤥</div>
            {view.players.length < 2 ? "Waiting for players…" : `${view.players.length} players ready`}
          </div>
        )}
      </div>

      {/* bottom: actions + my hand */}
      <div className="shrink-0 space-y-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {canCall && (
          <div className="px-3">
            <button
              onClick={() => send({ type: "call" })}
              disabled={busy}
              className="relative w-full overflow-hidden min-h-14 rounded-2xl bg-red-600 font-black text-xl tracking-wide shadow-lg shadow-red-900/50 active:scale-95 transition"
            >
              {windowOpen && (
                <span
                  className="absolute inset-y-0 left-0 bg-red-400/40"
                  style={{ width: `${((r.windowUntil - now) / g.windowMs) * 100}%` }}
                />
              )}
              <span className="relative">🚨 BLUFF!</span>
            </button>
          </div>
        )}

        {live && r.myHand && (
          <div className="px-3">
            {myTurn ? (
              windowOpen ? (
                <p className="text-center text-sm text-white/60 py-2">
                  Others can call bluff… your turn in {secsLeft(r.windowUntil, now)}s
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="text-center text-xs text-amber-300 font-semibold">
                    Your turn · {secsLeft(r.turnDeadline, now)}s ·{" "}
                    {startingPile ? "pick a rank and 1–4 cards" : `play cards as ${rankLabel(r.claimRank!)} or pass`}
                  </div>
                  {startingPile && (
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                      {RANKS.map((rk) => (
                        <button
                          key={rk}
                          onClick={() => setClaim(rk)}
                          className={`shrink-0 w-11 h-11 rounded-xl font-black ${
                            claim === rk ? "bg-amber-400 text-zinc-900" : "bg-white/10"
                          }`}
                        >
                          {rankLabel(rk)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {!startingPile && (
                      <Btn color="bg-zinc-700" onClick={() => send({ type: "pass" })} disabled={busy || !canAct}>
                        Pass
                      </Btn>
                    )}
                    <Btn
                      color="bg-amber-400 text-zinc-900"
                      className={startingPile ? "col-span-3" : "col-span-2"}
                      onClick={playSelected}
                      disabled={busy || !sel.length || (startingPile && !claim)}
                    >
                      {sel.length
                        ? `Play ${sel.length} as ${(startingPile ? claim : r.claimRank) ? rankLabel((startingPile ? claim : r.claimRank)!) : "?"}`
                        : "Tap cards to select"}
                    </Btn>
                  </div>
                </div>
              )
            ) : (
              <p className="text-center text-sm text-white/60 py-2">
                {nameOf(r.turn)}&apos;s turn · {secsLeft(r.turnDeadline, now)}s
              </p>
            )}
          </div>
        )}

        {r?.myHand && (
          <div className="no-scrollbar overflow-x-auto px-3 pt-3 pb-1">
            <div className="flex w-max mx-auto">
              {r.myHand.map((c, i) => {
                const on = selected.includes(cardKey(c));
                return (
                  <button
                    key={`${c.r}${c.s}`}
                    onClick={() => myTurn && toggle(c)}
                    className={`transition-transform ${i ? "-ml-5" : ""} ${on ? "-translate-y-3" : ""}`}
                    aria-pressed={on}
                  >
                    <div className={on ? "rounded-lg ring-4 ring-amber-400" : ""}>
                      <PlayingCard card={c} size="md" />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-[11px] text-white/40 mt-1">{r.myHand.length} cards in hand</p>
          </div>
        )}

        {!live && (
          <div className="px-3">
            <HostBar ctx={ctx} hasRound={!!r} endedAt={r?.result?.at} />
          </div>
        )}
      </div>
    </div>
  );
}
