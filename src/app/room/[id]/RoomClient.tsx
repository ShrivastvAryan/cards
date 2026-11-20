"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/Logo";
import { PlayingCard } from "@/components/PlayingCard";
import type { Action } from "@/lib/game";
import {
  api,
  clearCreds,
  loadCreds,
  loadName,
  saveCreds,
  saveName,
  type Creds,
  type RoomView,
} from "@/lib/client";

type PlayerView = RoomView["players"][number];

// Seat positions around the table (left%, top%). Index 0 is always "me" at the bottom.
const POS = {
  B: [50, 100],
  L: [3, 50],
  LB: [6, 80],
  LT: [6, 18],
  T: [50, 0],
  RT: [94, 18],
  R: [97, 50],
  RB: [94, 80],
} as const;
const LAYOUTS: Record<number, (keyof typeof POS)[]> = {
  1: ["B"],
  2: ["B", "T"],
  3: ["B", "LT", "RT"],
  4: ["B", "L", "T", "R"],
  5: ["B", "LB", "LT", "RT", "RB"],
  6: ["B", "LB", "LT", "T", "RT", "RB"],
};

export default function RoomClient() {
  const { id: rawId } = useParams<{ id: string }>();
  const roomId = rawId.toUpperCase();
  const router = useRouter();

  const [creds, setCreds] = useState<Creds | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const offset = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage
    setCreds(loadCreds(roomId));
    setReady(true);
  }, [roomId]);

  const applyView = useCallback((v: RoomView) => {
    offset.current = v.serverNow - Date.now();
    setView((old) => (old && old.version === v.version && old.me === v.me ? { ...old, serverNow: v.serverNow } : v));
  }, []);

  // Poll the server for state.
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const qs = creds ? `?pid=${creds.playerId}&token=${creds.token}` : "";
    async function poll() {
      try {
        const v = await api<RoomView>(`/api/rooms/${roomId}${qs}`);
        if (stop) return;
        applyView(v);
        setNotFound(false);
        if (creds && !v.me) {
          clearCreds(roomId);
          setCreds(null);
        }
      } catch (e) {
        if (!stop && (e as Error).message.includes("not found")) setNotFound(true);
      }
    }
    poll();
    const t = setInterval(poll, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [ready, creds, roomId, applyView]);

  // Local clock for timers.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function send(action: Action) {
    if (!creds || busy) return;
    setBusy(true);
    try {
      const v = await api<RoomView>(`/api/rooms/${roomId}/action`, {
        pid: creds.playerId,
        token: creds.token,
        action,
      });
      applyView(v);
      if (action.type === "leave") {
        clearCreds(roomId);
        router.push("/");
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <Centered>
        <LogoMark className="w-16 h-16 opacity-60" />
        <p className="text-xl font-semibold">Table {roomId} not found</p>
        <p className="text-white/60 text-sm">It may have expired or the server restarted.</p>
        <Link href="/" className="rounded-xl bg-amber-400 text-zinc-900 font-bold px-6 py-3">
          Create a new table
        </Link>
      </Centered>
    );
  }

  if (!ready || !view)
    return (
      <Centered>
        <LogoMark className="w-16 h-16 animate-pulse" />
        <span className="text-emerald-200/70">Loading table…</span>
      </Centered>
    );

  if (!creds || !view.me) {
    return (
      <JoinForm
        roomId={roomId}
        view={view}
        onJoined={(c) => {
          saveCreds(roomId, c);
          setCreds(c);
        }}
      />
    );
  }

  return (
    <Table
      view={view}
      now={now || view.serverNow}
      busy={busy}
      send={send}
      error={error}
      setError={setError}
      toast={toast}
      setToast={setToast}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col gap-4 items-center justify-center p-6 text-center">{children}</div>;
}

// ------------------------------------------------------------------ join

function JoinForm({ roomId, view, onJoined }: { roomId: string; view: RoomView; onJoined: (c: Creds) => void }) {
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : loadName()));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const full = view.players.length >= 6;

  async function join() {
    setErr("");
    if (!name.trim()) return setErr("Enter a guest name");
    setBusy(true);
    try {
      saveName(name.trim());
      const r = await api<{ playerId: string; token: string }>(`/api/rooms/${roomId}/join`, { name });
      onJoined({ playerId: r.playerId, token: r.token });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Centered>
      <Logo size="lg" />
      <div className="w-full max-w-sm rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-4 text-left">
        <div>
          <p className="text-xs uppercase tracking-wider text-emerald-200/70">You&apos;re invited to table</p>
          <p className="text-3xl font-black text-amber-300 tracking-widest">{roomId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.players.map((p) => (
            <span key={p.id} className="rounded-full bg-black/30 px-3 py-1 text-sm">
              {p.name}
            </span>
          ))}
        </div>
        {full ? (
          <p className="text-red-400">This table is full (6/6).</p>
        ) : (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="Your guest name"
              onKeyDown={(e) => e.key === "Enter" && join()}
              className="w-full rounded-xl bg-black/40 ring-1 ring-white/15 px-4 py-3 text-lg outline-none focus:ring-amber-400"
            />
            <button
              onClick={join}
              disabled={busy}
              className="w-full rounded-xl bg-amber-400 text-zinc-900 font-bold py-3.5 text-lg active:scale-[.98] disabled:opacity-60"
            >
              {busy ? "Joining…" : "Take a seat"}
            </button>
          </>
        )}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <Link href="/" className="block text-center text-sm text-white/50 underline">
          Back home
        </Link>
      </div>
    </Centered>
  );
}

// ------------------------------------------------------------------ table

function Table({
  view,
  now,
  busy,
  send,
  toast,
  setToast,
}: {
  view: RoomView;
  now: number;
  busy: boolean;
  send: (a: Action) => void;
  error: string;
  setError: (s: string) => void;
  toast: string;
  setToast: (s: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const meIdx = view.players.findIndex((p) => p.id === view.me);
  const me = view.players[meIdx];
  const hand = view.hand;
  const result = hand?.result ?? null;
  const live = !!hand && !result;
  const isHost = view.hostId === view.me;
  const myTurn = live && hand.turn === me.id && !hand.sideShow;
  const inHand = live && me.inHand && !me.folded;

  // rotate so I'm at index 0
  const ordered = [...view.players.slice(meIdx), ...view.players.slice(0, meIdx)];
  const layout = LAYOUTS[ordered.length] ?? LAYOUTS[6];

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${view.id}` : "";
  async function share() {
    const text = `Join my Teen Patti table! ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Teen Patti", text, url: shareUrl });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast("Invite link copied!");
    } catch {
      setToast(shareUrl);
    }
  }

  const multiplier = me.seen ? 2 : 1;
  const chaal = (hand?.stake ?? view.boot) * multiplier;
  const turnLeft = hand ? Math.max(0, hand.turnDeadline - now) : 0;
  const nextIn = result ? Math.max(0, Math.ceil((result.at + view.autoNextMs - now) / 1000)) : 0;
  const ssTarget = hand?.sideShowTarget ? view.players.find((p) => p.id === hand.sideShowTarget) : null;
  const canSideShow =
    myTurn && me.seen && hand.activeCount >= 3 && !!ssTarget && ssTarget.seen && ssTarget.id !== me.id;
  const canShow = myTurn && hand.activeCount === 2;
  const sideShowForMe = live && hand.sideShow?.to === me.id;
  const sideShowFrom = hand?.sideShow ? view.players.find((p) => p.id === hand.sideShow!.from) : null;
  const onlineEligible = view.players.filter((p) => p.online && p.chips >= view.boot).length;

  return (
    <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto">
      {/* header */}
      <header className="flex items-center justify-between gap-2 px-3 pt-3">
        <Link href="/" aria-label="Teen Patti home" className="shrink-0">
          <span className="hidden min-[400px]:inline">
            <Logo size="sm" />
          </span>
          <span className="min-[400px]:hidden">
            <LogoMark className="w-8 h-8" />
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={share}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold active:scale-95"
          >
            🔗 Invite · <span className="tracking-widest">{view.id}</span>
          </button>
          <button
            onClick={() => setShowLog((s) => !s)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-sm active:scale-95"
          >
            📜
          </button>
          <button
            onClick={() => confirm("Leave this table?") && send({ type: "leave" })}
            className="rounded-full bg-white/10 px-3 py-1.5 text-sm active:scale-95"
            title="Leave table"
          >
            ✕
          </button>
        </div>
      </header>

      {/* table */}
      <div className="relative flex-1 min-h-[400px] max-h-[600px] mx-10 sm:mx-16 mt-16 mb-24">
        <div className="felt absolute inset-0 rounded-[50%]" />
        {/* center pot */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {hand ? (
            <>
              <div className="text-[10px] uppercase tracking-[.2em] text-emerald-100/60">Pot</div>
              <div className="text-3xl sm:text-4xl font-black text-amber-300 drop-shadow">₹{hand.pot}</div>
              <div className="text-xs text-emerald-100/70 mt-1">
                Stake ₹{hand.stake} · Limit ₹{view.potLimit}
              </div>
              {result && (
                <div className="pop mt-3 rounded-xl bg-black/60 px-4 py-2 max-w-[80%]">
                  <div className="font-bold text-amber-300">
                    🏆 {result.winners.map((w) => view.players.find((p) => p.id === w)?.name ?? "Player").join(" & ")}
                  </div>
                  <div className="text-xs text-white/70">{result.reason}</div>
                  {onlineEligible >= 2 && <div className="text-[11px] text-white/50 mt-1">Next hand in {nextIn}s</div>}
                </div>
              )}
              {hand.sideShow && sideShowFrom && (
                <div className="pop mt-3 rounded-xl bg-black/60 px-3 py-1.5 text-xs">
                  {sideShowFrom.name} asked for a side show…
                </div>
              )}
            </>
          ) : (
            <div className="px-6">
              <div className="text-emerald-100/80 text-sm">
                {view.players.length < 2 ? "Waiting for friends to join…" : `${view.players.length} players seated`}
              </div>
              {view.players.length < 2 && (
                <button onClick={share} className="pointer-events-auto mt-3 rounded-xl bg-amber-400 text-zinc-900 font-bold px-4 py-2 text-sm">
                  Share invite link
                </button>
              )}
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
                isMe={p.id === me.id}
                isHost={p.id === view.hostId}
                turn={live && hand.turn === p.id && !hand.sideShow}
                turnFrac={turnLeft / view.turnMs}
                winner={!!result?.winners.includes(p.id)}
                cardsBelow={top < 30}
                onRemove={
                  isHost && p.bot && !(live && p.inHand && !p.folded)
                    ? () => send({ type: "remove-bot", id: p.id })
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>

      {/* my hand + actions */}
      <div className="sticky bottom-0 bg-gradient-to-t from-black via-black/95 to-black/0 pt-6 pb-[max(env(safe-area-inset-bottom),12px)] px-3">
        {me.inHand && hand && (
          <div className="flex items-end justify-center gap-2 mb-3">
            {me.cards ? (
              <>
                {me.cards.map((c, i) => (
                  <PlayingCard key={`${hand.number}-${i}`} card={c} size="lg" delay={i * 80} dim={me.folded} />
                ))}
                <div className="ml-2 text-sm">
                  <div className="font-bold text-amber-300">{me.handName}</div>
                  <div className="text-white/50 text-xs">{me.folded ? "Packed" : me.seen ? "Seen" : ""}</div>
                </div>
              </>
            ) : (
              <button
                onClick={() => send({ type: "see" })}
                disabled={!inHand}
                className="flex items-end gap-2 group"
                title="See cards"
              >
                {[0, 1, 2].map((i) => (
                  <PlayingCard key={`${hand.number}-${i}`} card={null} size="lg" delay={i * 80} dim={me.folded} />
                ))}
                {inHand && (
                  <span className="ml-2 rounded-full bg-white text-zinc-900 font-bold text-sm px-3 py-1.5 animate-pulse">
                    👀 See cards
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
              <Btn color="bg-amber-400 text-zinc-900" onClick={() => send({ type: "sideshow-reply", accept: true })} disabled={busy}>
                Accept
              </Btn>
            </div>
          </div>
        ) : myTurn ? (
          <div className="space-y-2">
            <div className="text-center text-xs text-amber-300 font-semibold">
              Your turn · {Math.ceil(turnLeft / 1000)}s
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Btn color="bg-red-600" onClick={() => send({ type: "pack" })} disabled={busy}>
                Pack
              </Btn>
              <Btn color="bg-emerald-600" onClick={() => send({ type: "chaal" })} disabled={busy}>
                {me.seen ? "Chaal" : "Blind"} ₹{chaal}
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
        ) : (
          <div className="text-center space-y-2">
            {live ? (
              <p className="text-white/60 text-sm py-2">
                {hand.sideShow
                  ? "Waiting for side show reply…"
                  : `Waiting for ${view.players.find((p) => p.id === hand.turn)?.name ?? "…"} · ${Math.ceil(turnLeft / 1000)}s`}
                {inHand && !hand.sideShow && (
                  <button onClick={() => send({ type: "pack" })} className="ml-3 text-red-400 underline">
                    Pack
                  </button>
                )}
              </p>
            ) : (
              <>
                {isHost ? (
                  <Btn
                    color="bg-amber-400 text-zinc-900 w-full"
                    onClick={() => send({ type: "start" })}
                    disabled={busy || onlineEligible < 2}
                  >
                    {onlineEligible < 2 ? "Need 2+ players to deal" : hand ? "Deal next hand now" : "Deal cards"}
                  </Btn>
                ) : (
                  !hand && <p className="text-white/60 text-sm py-2">Waiting for the host to deal…</p>
                )}
              </>
            )}
            {isHost && !live && view.players.length < 6 && (
              <button
                onClick={() => send({ type: "add-bot" })}
                disabled={busy}
                className="w-full rounded-xl bg-violet-600/80 py-2.5 text-sm font-semibold active:scale-95 disabled:opacity-50"
              >
                🤖 Add computer player
              </button>
            )}
            {!inHand && me.chips < view.boot * 5 && !live && (
              <Btn color="bg-emerald-700 w-full" onClick={() => send({ type: "rebuy" })} disabled={busy}>
                Out of chips? Rebuy ₹1000
              </Btn>
            )}
          </div>
        )}
      </div>

      {showLog && (
        <div className="fixed inset-0 z-40 bg-black/60 flex justify-end" onClick={() => setShowLog(false)}>
          <div
            className="w-full max-w-xs h-full bg-zinc-950 ring-1 ring-white/10 p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">Table log</h2>
              <button onClick={() => setShowLog(false)} className="text-white/60">
                ✕
              </button>
            </div>
            <ul className="space-y-1.5 text-sm text-white/80">
              {[...view.log].reverse().map((l) => (
                <li key={l.id}>{l.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div className="pop fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-white text-zinc-900 px-4 py-2 text-sm font-semibold shadow-xl max-w-[90vw] text-center break-all">
          {toast}
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  color,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${color} rounded-xl py-3 px-2 font-bold text-sm sm:text-base shadow-lg active:scale-95 transition disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Seat({
  p,
  isMe,
  isHost,
  turn,
  turnFrac,
  winner,
  cardsBelow,
  onRemove,
}: {
  p: PlayerView;
  isMe: boolean;
  isHost: boolean;
  turn: boolean;
  turnFrac: number;
  winner: boolean;
  cardsBelow: boolean;
  onRemove?: () => void;
}) {
  const displayName = p.bot ? p.name.replace(/^🤖\s*/, "") : p.name;
  const deg = Math.round(turnFrac * 360);
  const cards = !isMe && p.inHand && (
    <div className={`flex -space-x-3 ${cardsBelow ? "mt-1 order-last" : "mb-1"}`}>
      {(p.cards ?? [null, null, null]).map((c, i) => (
        <PlayingCard key={i} card={c} size="sm" delay={i * 80} />
      ))}
    </div>
  );
  return (
    <div className={`flex flex-col items-center w-24 ${p.folded ? "opacity-50" : ""}`}>
      {cards}
      <div
        className={`relative rounded-full p-[3px] ${winner ? "bg-amber-300 shadow-[0_0_24px_rgba(252,211,77,.8)]" : ""}`}
        style={turn ? { background: `conic-gradient(#fbbf24 ${deg}deg, rgba(255,255,255,.15) 0)` } : undefined}
      >
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-lg ${
            isMe ? "bg-amber-500 text-zinc-900" : p.bot ? "bg-violet-700 text-white" : "bg-zinc-800 text-white"
          }`}
        >
          {p.bot ? "🤖" : displayName.slice(0, 1).toUpperCase()}
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove computer player"
            className="absolute -left-1.5 -bottom-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center"
          >
            ✕
          </button>
        )}
        {p.dealer && (
          <span className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-white text-zinc-900 text-[10px] font-black flex items-center justify-center">
            D
          </span>
        )}
        {!p.online && <span className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-zinc-500 ring-2 ring-black" />}
      </div>
      <div className="mt-1 rounded-lg bg-black/70 px-2 py-0.5 text-center leading-tight max-w-full">
        <div className="text-xs font-semibold truncate">
          {isHost && "👑 "}
          {isMe ? "You" : displayName}
        </div>
        <div className="text-[11px] text-amber-300 font-mono">₹{p.chips}</div>
      </div>
      {p.inHand && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/70">
          {p.folded ? "Packed" : p.seen ? "Seen" : "Blind"}
          {p.bet > 0 && <span className="text-amber-200"> · ₹{p.bet}</span>}
        </div>
      )}
      {p.handName && !isMe && <div className="text-[10px] font-bold text-amber-300">{p.handName}</div>}
    </div>
  );
}
