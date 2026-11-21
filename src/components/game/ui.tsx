"use client";

import type { Action } from "@/lib/core";
import type { RoomView } from "@/lib/client";

export type PlayerView = RoomView["players"][number];

/** Everything a game table needs from the room shell. */
export interface TableCtx {
  view: RoomView;
  now: number;
  busy: boolean;
  send: (a: Action) => void;
  me: PlayerView;
  isHost: boolean;
  share: () => void;
}

export function Btn({
  children,
  color = "bg-white/10",
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${color} min-h-12 rounded-2xl px-3 font-bold text-[15px] shadow-lg active:scale-95 transition disabled:opacity-40 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

export const displayName = (p: { name: string; bot?: boolean }) => p.name;

export function Avatar({
  p,
  isMe,
  turnFrac,
  glow,
  size = "md",
}: {
  p: PlayerView;
  isMe?: boolean;
  turnFrac?: number | null; // 0..1 remaining when it's their turn
  glow?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-10 h-10 text-base" : "w-12 h-12 text-lg";
  const ring =
    turnFrac !== null && turnFrac !== undefined
      ? { background: `conic-gradient(#fbbf24 ${Math.round(turnFrac * 360)}deg, rgba(255,255,255,.15) 0)` }
      : undefined;
  return (
    <div
      className={`relative rounded-full p-[3px] ${glow ? "bg-amber-300 shadow-[0_0_22px_rgba(252,211,77,.8)]" : ""}`}
      style={ring}
    >
      <div
        className={`${dim} rounded-full flex items-center justify-center font-black ${
          isMe ? "bg-amber-500 text-zinc-900" : p.bot ? "bg-violet-700 text-white" : "bg-zinc-700 text-white"
        }`}
      >
        {p.bot ? "🤖" : p.name.slice(0, 1).toUpperCase()}
      </div>
      {!p.online && <span className="absolute -left-0.5 -top-0.5 w-3 h-3 rounded-full bg-zinc-500 ring-2 ring-black" />}
    </div>
  );
}

/** Horizontal, swipeable row of the other players (mobile-first). */
export function OpponentStrip({
  ctx,
  turnId,
  turnDeadline,
  turnMs,
  sub,
  badge,
  winners = [],
}: {
  ctx: TableCtx;
  turnId?: string | null;
  turnDeadline?: number;
  turnMs: number;
  sub: (p: PlayerView) => React.ReactNode;
  badge?: (p: PlayerView) => React.ReactNode;
  winners?: string[];
}) {
  const { view, me, isHost, send, now } = ctx;
  const meIdx = view.players.findIndex((p) => p.id === me.id);
  const others = [...view.players.slice(meIdx + 1), ...view.players.slice(0, meIdx)];
  if (!others.length) return null;
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2 snap-x">
      {others.map((p) => {
        const turn = turnId === p.id;
        const frac = turn && turnDeadline ? Math.max(0, (turnDeadline - now) / turnMs) : null;
        return (
          <div
            key={p.id}
            className={`snap-start shrink-0 relative flex flex-col items-center w-[76px] rounded-2xl py-2 transition ${
              turn ? "bg-amber-400/15 ring-1 ring-amber-400/60" : "bg-white/5"
            }`}
          >
            <Avatar p={p} turnFrac={frac} glow={winners.includes(p.id)} size="sm" />
            <div className="mt-1 max-w-full truncate px-1 text-xs font-semibold">
              {p.id === view.hostId && "👑 "}
              {p.name}
            </div>
            <div className="text-[11px] text-white/60 leading-tight">{sub(p)}</div>
            {badge?.(p)}
            {isHost && p.bot && !view.live && (
              <button
                onClick={() => send({ type: "remove-bot", id: p.id })}
                aria-label={`Remove ${p.name}`}
                className="absolute right-1 top-1 w-5 h-5 rounded-full bg-red-600/90 text-[10px] font-black"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Lobby / between-rounds controls shared by every game. */
export function HostBar({
  ctx,
  hasRound,
  endedAt,
  extra,
}: {
  ctx: TableCtx;
  hasRound: boolean;
  endedAt?: number | null;
  extra?: React.ReactNode;
}) {
  const { view, isHost, send, busy, now, share } = ctx;
  const online = view.players.filter((p) => p.online).length;
  const nextIn = endedAt ? Math.max(0, Math.ceil((endedAt + 8000 - now) / 1000)) : 0;
  return (
    <div className="space-y-2">
      {endedAt && online >= 2 && (
        <p className="text-center text-xs text-white/50">Next round starts in {nextIn}s</p>
      )}
      {isHost ? (
        <Btn
          color="bg-amber-400 text-zinc-900"
          className="w-full"
          onClick={() => send({ type: "start" })}
          disabled={busy || online < view.minPlayers}
        >
          {online < view.minPlayers ? "Need 2+ players" : hasRound ? "Start next round now" : "Start game"}
        </Btn>
      ) : (
        !hasRound && <p className="text-center text-sm text-white/60 py-2">Waiting for the host to start…</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {isHost && view.players.length < view.maxPlayers ? (
          <Btn color="bg-violet-600" onClick={() => send({ type: "add-bot" })} disabled={busy}>
            🤖 Add computer
          </Btn>
        ) : (
          <span />
        )}
        <Btn color="bg-emerald-600" onClick={share}>
          🔗 Invite friends
        </Btn>
      </div>
      {extra}
    </div>
  );
}

export function ResultBanner({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="pop rounded-2xl bg-black/60 ring-1 ring-amber-300/40 px-4 py-3 text-center">
      <div className="font-black text-amber-300 text-lg">{title}</div>
      {sub && <div className="text-xs text-white/70 mt-0.5">{sub}</div>}
    </div>
  );
}

export const secsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
