"use client";

import { useState } from "react";
import { COLOR_BG, COLOR_DOT, ColorCard } from "@/components/ColorCard";
import { type Color, COLOR_NAME, COLORS, type CRCard, playable } from "@/lib/games/colorrush";
import type { ColorRushView } from "@/lib/games/colorrush";
import { Btn, HostBar, OpponentStrip, ResultBanner, secsLeft, type TableCtx } from "./ui";

const GLOW: Record<Color, string> = { R: "#ef4444", Y: "#facc15", G: "#22c55e", B: "#3b82f6" };

/** Stable "thrown down" angle/offset for a discard, so it doesn't jitter between polls. */
const scatter = (id: number) => ({
  rot: ((id * 37) % 34) - 17,
  x: ((id * 13) % 15) - 7,
  y: ((id * 7) % 11) - 5,
});

export function ColorRushTable({ ctx }: { ctx: TableCtx }) {
  const { view, now, busy, send, me } = ctx;
  const g = view.g as unknown as ColorRushView;
  const r = g.round;
  const live = !!r && !r.result;
  const [wildPick, setWildPick] = useState<CRCard | null>(null);
  const nameOf = (id: string) => (id === me.id ? "You" : (view.players.find((p) => p.id === id)?.name ?? "Player"));

  const hand = r?.myHand ?? [];
  const myTurn = live && r.turn === me.id;
  const canPlay = (c: CRCard) => myTurn && playable(c, r.top, r.color) && (r.drawnCard === null || c.id === r.drawnCard);
  const anyPlayable = hand.some(canPlay);
  const mustDraw = myTurn && r.drawnCard === null && !anyPlayable;
  const canCatch = live && !!r.catchable && r.catchable !== me.id && !!r.myHand;
  const myPlace = r ? r.places.indexOf(me.id) : -1;
  const canCallLast = live && !!r.myHand && myPlace < 0 && hand.length <= 2 && !r.called[me.id];
  const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
  const MEDAL = ["🥇", "🥈", "🥉"];

  function tap(c: CRCard) {
    if (!canPlay(c) || busy) return;
    if (c.c === "W") return setWildPick(c);
    send({ type: "play", cardId: c.id });
  }

  // Fan geometry for my hand.
  const n = hand.length;
  const mid = (n - 1) / 2;
  const spread = Math.min(7, 48 / Math.max(n, 1));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <OpponentStrip
        ctx={ctx}
        turnId={live ? r.turn : null}
        turnDeadline={r?.turnDeadline}
        turnMs={g.turnMs}
        winners={r ? r.places.slice(0, 1) : []}
        sub={(p) =>
          r && r.counts[p.id] !== undefined && r.counts[p.id] !== null ? `${r.counts[p.id]} cards` : `${p.score} pts`
        }
        badge={(p) => {
          const c = r?.counts[p.id];
          if (!r || c === undefined || c === null) return null;
          const place = r.places.indexOf(p.id);
          if (place >= 0)
            return (
              <span className="mt-1 rounded-full bg-amber-400 text-zinc-900 px-1.5 text-[10px] font-black">
                {MEDAL[place] ?? "🏁"} {ORD[place]}
              </span>
            );
          return (
            <div className="mt-1 flex h-5 items-end justify-center">
              {Array.from({ length: Math.min(c, 7) }).map((_, i) => (
                <span
                  key={i}
                  className="-ml-1.5 first:ml-0 h-5 w-3.5 rounded-[3px] bg-gradient-to-br from-violet-500 to-indigo-800 ring-1 ring-white/70"
                  style={{ transform: `rotate(${(i - Math.min(c, 7) / 2) * 6}deg)` }}
                />
              ))}
              {c === 1 && (
                <span
                  className={`ml-1 rounded-full px-1.5 text-[9px] font-black ${r.called[p.id] ? "bg-emerald-500" : "bg-red-600 animate-pulse"}`}
                >
                  {r.called[p.id] ? "LAST!" : "1!"}
                </span>
              )}
            </div>
          );
        }}
      />

      {/* the board */}
      <div className="relative flex-1 min-h-[260px] mx-3 my-1">
        <div
          className="board absolute inset-0 rounded-[2.5rem]"
          style={{ ["--glow" as string]: r ? GLOW[r.color] : "#6366f1" }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center">
          {r ? (
            <>
              <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold">
                <span className={`w-3.5 h-3.5 rounded-full ring-2 ring-white/70 ${COLOR_DOT[r.color]}`} />
                {COLOR_NAME[r.color]}
                <span className="text-white/50">· {r.drawCount} in deck</span>
              </div>

              <div className="relative flex items-center justify-center gap-7 sm:gap-10">
                {/* direction ring */}
                <svg
                  viewBox="0 0 200 200"
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[290px] h-[290px] opacity-40 ${
                    r.dir === 1 ? "spin-cw" : "spin-ccw"
                  }`}
                >
                  <g transform={r.dir === 1 ? undefined : "translate(200 0) scale(-1 1)"}>
                    <circle cx="100" cy="100" r="92" fill="none" stroke="white" strokeWidth="2" strokeDasharray="5 9" />
                    <path d="M90 2 L104 8 L90 14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <path d="M110 186 L96 192 L110 198" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </g>
                </svg>

                {/* draw pile */}
                <button
                  onClick={() => send({ type: "draw" })}
                  disabled={!myTurn || r.drawnCard !== null || busy}
                  className={`relative w-20 h-28 active:scale-95 transition disabled:active:scale-100 ${
                    mustDraw ? "animate-pulse" : ""
                  }`}
                  aria-label="Draw a card"
                >
                  {[2, 1, 0].map((k) => (
                    <div key={k} className="absolute inset-0" style={{ transform: `translate(${k * 2}px, ${-k * 2}px)` }}>
                      <ColorCard card={null} size="lg" />
                    </div>
                  ))}
                  {myTurn && r.drawnCard === null && (
                    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 text-zinc-900 px-2 py-0.5 text-[11px] font-black whitespace-nowrap shadow">
                      {mustDraw ? "Draw!" : "Draw"}
                    </span>
                  )}
                </button>

                {/* discard pile: last few cards scattered */}
                <div className="relative w-20 h-28">
                  {r.recent.map((c, i) => {
                    const s = scatter(c.id);
                    const isTop = i === r.recent.length - 1;
                    return (
                      <div
                        key={c.id}
                        className={`absolute inset-0 ${isTop ? "toss" : ""}`}
                        style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`, zIndex: i }}
                      >
                        <ColorCard card={c} size="lg" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {r.result ? (
                <ResultBanner
                  title={`🏆 ${nameOf(r.result.places[0])} won!`}
                  sub={r.result.places
                    .slice(1)
                    .map((id, i) => `${ORD[i + 1]}: ${nameOf(id)} (+${r.placePoints[i + 1] ?? 0})`)
                    .join(" · ")}
                />
              ) : (
                <div
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                    myTurn ? "bg-amber-400 text-zinc-900" : "bg-black/35 text-white/80"
                  }`}
                >
                  {myTurn
                    ? r.drawnCard !== null
                      ? `Play the drawn card or pass · ${secsLeft(r.turnDeadline, now)}s`
                      : `Your turn · ${secsLeft(r.turnDeadline, now)}s`
                    : `${nameOf(r.turn)}'s turn · ${secsLeft(r.turnDeadline, now)}s`}
                </div>
              )}
            </>
          ) : (
            <div className="text-white/70 text-sm">
              <div className="text-5xl mb-2">🌈</div>
              {view.players.length < 2 ? "Waiting for players…" : `${view.players.length} players at the table`}
            </div>
          )}
        </div>
      </div>

      {/* actions + my hand */}
      <div className="shrink-0 pb-[max(env(safe-area-inset-bottom),10px)]">
        {live && r.myHand && (canCatch || canCallLast || (myTurn && r.drawnCard !== null)) && (
          <div className="px-3 pt-1 grid grid-cols-2 gap-2">
            {canCallLast && (
              <Btn color="bg-amber-400 text-zinc-900" onClick={() => send({ type: "lastcard" })} disabled={busy}>
                📣 Last card!
              </Btn>
            )}
            {canCatch && (
              <Btn color="bg-red-600 animate-pulse" onClick={() => send({ type: "catch" })} disabled={busy}>
                🫵 Catch {nameOf(r.catchable!)}
              </Btn>
            )}
            {myTurn && r.drawnCard !== null && (
              <Btn color="bg-zinc-700" onClick={() => send({ type: "pass" })} disabled={busy}>
                Pass
              </Btn>
            )}
          </div>
        )}

        {live && myPlace >= 0 && (
          <p className="text-center font-bold text-amber-300 py-4">
            {MEDAL[myPlace] ?? "🎉"} You finished {ORD[myPlace]} (+{r.placePoints[myPlace]} pts)! Watching the rest…
          </p>
        )}
        {r?.myHand && r.myHand.length > 0 && (
          <div className="no-scrollbar overflow-x-auto overflow-y-hidden px-6 pt-7 pb-7">
            <div className="flex w-max mx-auto items-end">
              {r.myHand.map((c, i) => {
                const ok = canPlay(c);
                const angle = (i - mid) * spread;
                const arc = Math.min(14, Math.abs(i - mid) ** 2 * 1.1);
                return (
                  <button
                    key={c.id}
                    onClick={() => tap(c)}
                    className={`${i ? "-ml-7 sm:-ml-6" : ""} origin-bottom transition-transform duration-200 ${
                      ok ? "hover:z-10" : "cursor-default"
                    }`}
                    style={{
                      transform: `rotate(${angle}deg) translateY(${arc - (ok ? 16 : 0)}px)`,
                      zIndex: i,
                    }}
                    aria-label={`Play ${c.c === "W" ? c.v : `${COLOR_NAME[c.c as Color]} ${c.v}`}`}
                  >
                    <ColorCard card={c} size="hand" lift={ok} dim={myTurn && !ok} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {r?.myHand && r.myHand.length > 0 && (
          <p className="text-center text-[11px] text-white/40">
            {r.myHand.length} cards
            {myTurn && anyPlayable ? " · tap a raised card to play" : ""}
          </p>
        )}

        {!live && (
          <div className="px-3 pt-2">
            <HostBar ctx={ctx} hasRound={!!r} endedAt={r?.result?.at} />
          </div>
        )}
      </div>

      {wildPick && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center"
          onClick={() => setWildPick(null)}
        >
          <div
            className="pop w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-zinc-900 p-5 pb-[max(env(safe-area-inset-bottom),20px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <ColorCard card={wildPick} size="md" />
            </div>
            <p className="text-center font-bold mb-4">Pick the new color</p>
            <div className="grid grid-cols-2 gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    send({ type: "play", cardId: wildPick.id, color: c });
                    setWildPick(null);
                  }}
                  className={`h-16 rounded-2xl bg-gradient-to-br ${COLOR_BG[c]} font-black text-lg ${
                    c === "Y" ? "text-zinc-900" : ""
                  } active:scale-95`}
                >
                  {COLOR_NAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
