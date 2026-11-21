"use client";

import { PlayingCard } from "@/components/PlayingCard";
import { rankLabel } from "@/lib/cards";
import type { TeenPattiView } from "@/lib/games/teenpatti";
import { Avatar, Btn, HostBar, type PlayerView, secsLeft, type TableCtx } from "./ui";

// Seat positions around the felt (left%, top%). Index 0 is always "me" at the bottom.
const POS = {
  B: [50, 100],
  L: [2, 50],
  LB: [5, 80],
  LT: [5, 18],
  T: [50, 0],
  RT: [95, 18],
  R: [98, 50],
  RB: [95, 80],
} as const;
const LAYOUTS: Record<number, (keyof typeof POS)[]> = {
  1: ["B"],
  2: ["B", "T"],
  3: ["B", "LT", "RT"],
  4: ["B", "L", "T", "R"],
  5: ["B", "LB", "LT", "RT", "RB"],
  6: ["B", "LB", "LT", "T", "RT", "RB"],
};

export function TeenPattiTable({ ctx }: { ctx: TableCtx }) {
  const { view, now, busy, send, me, isHost } = ctx;
  const g = view.g as unknown as TeenPattiView;
  const hand = g.hand;
  const result = hand?.result ?? null;
  const live = !!hand && !result;
  const seat = (id: string) => g.seats[id];
  const mine = seat(me.id);
  const myTurn = live && hand.turn === me.id && !hand.sideShow;
  const inHand = live && !!mine?.inHand && !mine.folded;

  const meIdx = view.players.findIndex((p) => p.id === me.id);
  const ordered = [...view.players.slice(meIdx), ...view.players.slice(0, meIdx)];
  const layout = LAYOUTS[ordered.length] ?? LAYOUTS[6];

  const chaal = (hand?.stake ?? g.boot) * (mine?.seen ? 2 : 1);
  const turnLeft = hand ? Math.max(0, hand.turnDeadline - now) : 0;
  const ssTarget = hand?.sideShowTarget ? view.players.find((p) => p.id === hand.sideShowTarget) : null;
  const canSideShow =
    myTurn && mine.seen && hand.activeCount >= 3 && !!ssTarget && seat(ssTarget.id)?.seen && ssTarget.id !== me.id;
  const canShow = myTurn && hand.activeCount === 2;
  const sideShowForMe = live && hand.sideShow?.to === me.id;
  const sideShowFrom = hand?.sideShow ? view.players.find((p) => p.id === hand.sideShow!.from) : null;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? "Player";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* felt */}
      <div className="relative flex-1 min-h-[300px] mx-12 sm:mx-20 mt-16 mb-14">
        <div className="felt absolute inset-0 rounded-[48%]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
          {hand ? (
            <>
              {hand.jokerCard && (
                <div className="flex items-center gap-2 mb-2">
                  <PlayingCard card={hand.jokerCard} size="sm" />
                  <span className="text-[11px] font-bold text-amber-200 text-left leading-tight">
                    🃏 JOKER
                    <br />
                    all {rankLabel(hand.jokerCard.r)}s wild
                  </span>
                </div>
              )}
              <div className="text-[10px] uppercase tracking-[.2em] text-emerald-100/60">Pot</div>
              <div className="text-3xl sm:text-4xl font-black text-amber-300 drop-shadow">₹{hand.pot}</div>
              <div className="text-[11px] text-emerald-100/70 mt-0.5">
                Stake ₹{hand.stake} · Limit ₹{g.potLimit}
              </div>
              {result && (
                <div className="pop mt-2 rounded-xl bg-black/60 px-3 py-2 max-w-[90%]">
                  <div className="font-bold text-amber-300">🏆 {result.winners.map(nameOf).join(" & ")}</div>
                  <div className="text-xs text-white/70">{result.reason}</div>
                </div>
              )}
              {hand.sideShow && sideShowFrom && (
                <div className="pop mt-2 rounded-xl bg-black/60 px-3 py-1.5 text-xs">
                  {sideShowFrom.name} asked for a side show…
                </div>
              )}
            </>
          ) : (
            <div className="text-emerald-100/80 text-sm">
              {g.joker && <div className="text-amber-200 font-bold mb-1">🃏 Joker mode</div>}
              {view.players.length < 2 ? "Waiting for players…" : `${view.players.length} players seated`}
            </div>
          )}
        </div>

        {ordered.map((p, i) => {
          const [left, top] = POS[layout[i]];
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <Seat
                p={p}
                s={seat(p.id)}
                isMe={p.id === me.id}
                isHost={p.id === view.hostId}
                turnFrac={live && hand.turn === p.id && !hand.sideShow ? turnLeft / g.turnMs : null}
                winner={!!result?.winners.includes(p.id)}
                cardsBelow={top < 30}
                onRemove={
                  isHost && p.bot && !(live && seat(p.id)?.inHand && !seat(p.id)?.folded)
                    ? () => send({ type: "remove-bot", id: p.id })
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>

      {/* my cards + actions */}
      <div className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),12px)] space-y-3">
        {mine?.inHand && hand && (
          <div className="flex items-end justify-center gap-2">
            {mine.cards ? (
              <>
                {mine.cards.map((c, i) => (
                  <PlayingCard
                    key={`${hand.number}-${i}`}
                    card={c}
                    size="lg"
                    delay={i * 80}
                    dim={mine.folded}
                    wild={!!hand.jokerCard && c.r === hand.jokerCard.r}
                  />
                ))}
                <div className="ml-1 text-sm max-w-24">
                  <div className="font-bold text-amber-300 leading-tight">{mine.handName}</div>
                  <div className="text-white/50 text-xs">{mine.folded ? "Packed" : "Seen"}</div>
                </div>
              </>
            ) : (
              <button
                onClick={() => send({ type: "see" })}
                disabled={!inHand}
                className="flex items-end gap-2"
                aria-label="See my cards"
              >
                {[0, 1, 2].map((i) => (
                  <PlayingCard key={`${hand.number}-${i}`} card={null} size="lg" delay={i * 80} dim={mine.folded} />
                ))}
                {inHand && (
                  <span className="ml-1 rounded-full bg-white text-zinc-900 font-bold text-sm px-3 py-2 animate-pulse">
                    👀 See
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {sideShowForMe && sideShowFrom ? (
          <div className="pop rounded-2xl bg-zinc-900 ring-1 ring-amber-400/50 p-3 text-center">
            <p className="mb-2">
              <b>{sideShowFrom.name}</b> wants a side show with you
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Btn color="bg-zinc-700" onClick={() => send({ type: "sideshow-reply", accept: false })} disabled={busy}>
                Deny
              </Btn>
              <Btn
                color="bg-amber-400 text-zinc-900"
                onClick={() => send({ type: "sideshow-reply", accept: true })}
                disabled={busy}
              >
                Accept
              </Btn>
            </div>
          </div>
        ) : myTurn ? (
          <div className="space-y-2">
            <div className="text-center text-xs text-amber-300 font-semibold">
              Your turn · {secsLeft(hand.turnDeadline, now)}s
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Btn color="bg-red-600" onClick={() => send({ type: "pack" })} disabled={busy}>
                Pack
              </Btn>
              <Btn color="bg-emerald-600" onClick={() => send({ type: "chaal" })} disabled={busy}>
                {mine.seen ? "Chaal" : "Blind"} ₹{chaal}
              </Btn>
              <Btn color="bg-amber-400 text-zinc-900" onClick={() => send({ type: "chaal", raise: true })} disabled={busy}>
                Raise ₹{chaal * 2}
              </Btn>
            </div>
            {(canShow || canSideShow) && (
              <div className="grid grid-cols-1 gap-2">
                {canShow && (
                  <Btn color="bg-sky-600" onClick={() => send({ type: "show" })} disabled={busy}>
                    Show ₹{chaal}
                  </Btn>
                )}
                {canSideShow && (
                  <Btn color="bg-violet-600" onClick={() => send({ type: "sideshow" })} disabled={busy}>
                    Side show with {ssTarget!.name} ₹{chaal}
                  </Btn>
                )}
              </div>
            )}
          </div>
        ) : live ? (
          <p className="text-center text-white/60 text-sm py-3">
            {hand.sideShow
              ? "Waiting for side show reply…"
              : `Waiting for ${nameOf(hand.turn ?? "")} · ${secsLeft(hand.turnDeadline, now)}s`}
            {inHand && !hand.sideShow && (
              <button onClick={() => send({ type: "pack" })} className="ml-3 text-red-400 underline">
                Pack
              </button>
            )}
          </p>
        ) : (
          <HostBar
            ctx={ctx}
            hasRound={!!hand}
            endedAt={result?.at}
            extra={
              me.chips < g.boot * 5 && (
                <Btn color="bg-emerald-700" className="w-full" onClick={() => send({ type: "rebuy" })} disabled={busy}>
                  Out of chips? Rebuy ₹1000
                </Btn>
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function Seat({
  p,
  s,
  isMe,
  isHost,
  turnFrac,
  winner,
  cardsBelow,
  onRemove,
}: {
  p: PlayerView;
  s: TeenPattiView["seats"][string] | undefined;
  isMe: boolean;
  isHost: boolean;
  turnFrac: number | null;
  winner: boolean;
  cardsBelow: boolean;
  onRemove?: () => void;
}) {
  const cards = !isMe && s?.inHand && (
    <div className={`flex -space-x-3 ${cardsBelow ? "mt-1 order-last" : "mb-1"}`}>
      {(s.cards ?? [null, null, null]).map((c, i) => (
        <PlayingCard key={i} card={c} size="sm" delay={i * 80} />
      ))}
    </div>
  );
  return (
    <div className={`flex flex-col items-center w-[88px] ${s?.folded ? "opacity-50" : ""}`}>
      {cards}
      <div className="relative">
        <Avatar p={p} isMe={isMe} turnFrac={turnFrac} glow={winner} size="sm" />
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove ${p.name}`}
            className="absolute -left-1.5 -bottom-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-black"
          >
            ✕
          </button>
        )}
        {s?.dealer && (
          <span className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-white text-zinc-900 text-[10px] font-black flex items-center justify-center">
            D
          </span>
        )}
      </div>
      <div className="mt-1 rounded-lg bg-black/70 px-2 py-0.5 text-center leading-tight max-w-full">
        <div className="text-xs font-semibold truncate">
          {isHost && "👑 "}
          {isMe ? "You" : p.name}
        </div>
        <div className="text-[11px] text-amber-300 font-mono">₹{p.chips}</div>
      </div>
      {s?.inHand && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/70 whitespace-nowrap">
          {s.folded ? "Packed" : s.seen ? "Seen" : "Blind"}
          {s.bet > 0 && <span className="text-amber-200"> · ₹{s.bet}</span>}
        </div>
      )}
      {s?.handName && !isMe && <div className="text-[10px] font-bold text-amber-300 text-center">{s.handName}</div>}
    </div>
  );
}
