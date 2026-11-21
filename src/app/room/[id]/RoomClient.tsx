"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BuyMeCoffee } from "@/components/BuyMeCoffee";
import { BluffTable } from "@/components/game/BluffTable";
import { ChatSheet, LeaveSheet } from "@/components/game/Sheets";
import { ColorRushTable } from "@/components/game/ColorRushTable";
import { OldMaidTable } from "@/components/game/OldMaidTable";
import { TeenPattiTable } from "@/components/game/TeenPattiTable";
import type { TableCtx } from "@/components/game/ui";
import { Logo, LogoMark } from "@/components/Logo";
import { gameInfo } from "@/lib/catalog";
import { api, clearCreds, loadCreds, loadName, saveCreds, saveName, type Creds, type RoomView } from "@/lib/client";
import type { Action } from "@/lib/core";

export default function RoomClient() {
  const { id: rawId } = useParams<{ id: string }>();
  const roomId = rawId.toUpperCase();
  const router = useRouter();

  const [creds, setCreds] = useState<Creds | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
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

  // Poll the server for state (paused while the tab is hidden to save battery).
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const qs = creds ? `?pid=${creds.playerId}&token=${creds.token}` : "";
    async function poll() {
      if (document.hidden) return;
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
    document.addEventListener("visibilitychange", poll);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [ready, creds, roomId, applyView]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function send(action: Action): Promise<boolean> {
    if (!creds || (busy && action.type !== "chat")) return false;
    const chat = action.type === "chat";
    if (!chat) setBusy(true);
    try {
      const v = await api<RoomView>(`/api/rooms/${roomId}/action`, { pid: creds.playerId, token: creds.token, action });
      applyView(v);
      if (action.type === "leave") {
        clearCreds(roomId);
        router.push("/");
      }
      return true;
    } catch (e) {
      setToast((e as Error).message);
      if ("vibrate" in navigator) navigator.vibrate?.(60);
      return false;
    } finally {
      if (!chat) setBusy(false);
    }
  }

  if (notFound) {
    return (
      <Centered>
        <LogoMark className="w-16 h-16 opacity-60" />
        <p className="text-xl font-semibold">Table {roomId} not found</p>
        <p className="text-white/60 text-sm">It may have expired or the server restarted.</p>
        <Link href="/" className="rounded-2xl bg-amber-400 text-zinc-900 font-bold px-6 py-3">
          Back to games
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

  return <GameScreen view={view} now={now || view.serverNow} busy={busy} send={send} toast={toast} setToast={setToast} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col gap-4 items-center justify-center p-6 text-center">{children}</div>;
}

// ------------------------------------------------------------------ join

function JoinForm({ roomId, view, onJoined }: { roomId: string; view: RoomView; onJoined: (c: Creds) => void }) {
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : loadName()));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const full = view.players.length >= view.maxPlayers;
  const info = gameInfo(view.game);

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
      <div className="w-full max-w-sm rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4 text-left">
        <div className={`rounded-2xl bg-gradient-to-br ${info.accent} p-4`}>
          <p className="text-xs uppercase tracking-wider text-white/80">You&apos;re invited to play</p>
          <p className="text-2xl font-black">
            {info.emoji} {view.title}
            {view.game === "teenpatti" && view.options.joker === true && " · Joker"}
          </p>
          <p className="text-sm font-mono tracking-widest text-white/80">Table {roomId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.players.map((p) => (
            <span key={p.id} className="rounded-full bg-black/30 px-3 py-1 text-sm">
              {p.bot ? "🤖 " : ""}
              {p.name}
            </span>
          ))}
        </div>
        {full ? (
          <p className="text-red-400">
            This table is full ({view.players.length}/{view.maxPlayers}).
          </p>
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="Your guest name"
              autoComplete="nickname"
              enterKeyHint="go"
              onKeyDown={(e) => e.key === "Enter" && join()}
              className="w-full rounded-2xl bg-black/40 ring-1 ring-white/15 px-4 py-3.5 text-lg outline-none focus:ring-amber-400"
            />
            <button
              onClick={join}
              disabled={busy}
              className="w-full min-h-14 rounded-2xl bg-amber-400 text-zinc-900 font-bold text-lg active:scale-[.98] disabled:opacity-60"
            >
              {busy ? "Joining…" : "Take a seat"}
            </button>
          </>
        )}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <Link href="/" className="block text-center text-sm text-white/50 underline py-1">
          Back to all games
        </Link>
      </div>
      <BuyMeCoffee compact />
    </Centered>
  );
}

// ------------------------------------------------------------------ game screen

/** Is this player still holding cards in the live round? */
function inLiveRound(view: RoomView) {
  if (!view.live || !view.me) return false;
  const g = view.g as Record<string, unknown>;
  if (view.game === "teenpatti") {
    const seat = (g.seats as Record<string, { inHand: boolean; folded: boolean }>)[view.me];
    return !!seat?.inHand && !seat.folded;
  }
  return !!(g.round as { myHand: unknown } | null)?.myHand;
}

function GameScreen({
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
  send: (a: Action) => Promise<boolean>;
  toast: string;
  setToast: (s: string) => void;
}) {
  const [panel, setPanel] = useState<null | "chat" | "log">(null);
  const [leaving, setLeaving] = useState(false);
  const [readUpTo, setReadUpTo] = useState(() => view.chat.at(-1)?.id ?? 0);
  const [bubble, setBubble] = useState<RoomView["chat"][number] | null>(null);
  const me = view.players.find((p) => p.id === view.me)!;
  const info = gameInfo(view.game);
  const lastMsg = view.chat.at(-1);

  // Mark messages read while the chat is open; otherwise pop up new ones from others.
  useEffect(() => {
    if (!lastMsg) return;
    if (panel === "chat") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync read marker with open panel
      setReadUpTo(lastMsg.id);
      return;
    }
    if (lastMsg.id > readUpTo && lastMsg.by !== me.id) {
      setBubble(lastMsg);
      const t = setTimeout(() => setBubble(null), 3500);
      return () => clearTimeout(t);
    }
  }, [lastMsg, panel, readUpTo, me.id]);

  const unread = view.chat.filter((m) => m.id > readUpTo && m.by !== me.id).length;

  async function share() {
    const url = `${window.location.origin}/room/${view.id}`;
    const text = `Join my ${view.title} table on Taash! ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${view.title} · Taash`, text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast("Invite link copied!");
    } catch {
      setToast(url);
    }
  }

  const ctx: TableCtx = { view, now, busy, send, me, isHost: view.hostId === me.id, share };

  return (
    <div className="h-dvh flex flex-col w-full overflow-hidden">
      <header className="shrink-0 flex items-center gap-1.5 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-1">
        <Link href="/" aria-label="All games" className="shrink-0">
          <LogoMark className="w-9 h-9" />
        </Link>
        <div className="min-w-0 flex-1 leading-tight ml-0.5">
          <div className="font-black truncate">
            {info.emoji} {view.title}
            {view.game === "teenpatti" && view.options.joker === true && " · Joker"}
          </div>
          <div className="text-[11px] text-white/50 font-mono tracking-wider truncate">
            {view.id} · {me.name}
            {view.game === "teenpatti" ? ` · ₹${me.chips}` : ` · ${me.score} ${info.scoreUnit}`}
          </div>
        </div>
        <button
          onClick={share}
          className="shrink-0 h-10 min-w-10 rounded-full bg-emerald-600 px-2.5 text-sm font-bold active:scale-95"
          aria-label="Invite friends"
        >
          🔗<span className="hidden min-[420px]:inline"> Invite</span>
        </button>
        <button
          onClick={() => setPanel("chat")}
          className="relative shrink-0 w-10 h-10 rounded-full bg-white/10 active:scale-95"
          aria-label={unread ? `Chat, ${unread} unread` : "Chat and log"}
        >
          💬
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 h-5 rounded-full bg-red-600 px-1 text-[11px] font-black leading-5">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <button
          onClick={() => setLeaving(true)}
          className="shrink-0 h-10 rounded-full bg-red-600/15 ring-1 ring-red-500/60 px-3 text-sm font-bold text-red-300 active:scale-95"
        >
          Leave
        </button>
      </header>

      {view.game === "teenpatti" && <TeenPattiTable ctx={ctx} />}
      {view.game === "bluff" && <BluffTable ctx={ctx} />}
      {view.game === "colorrush" && <ColorRushTable ctx={ctx} />}
      {view.game === "oldmaid" && <OldMaidTable ctx={ctx} />}

      {bubble && !panel && (
        <button
          onClick={() => setPanel("chat")}
          className="pop fixed left-1/2 top-[max(env(safe-area-inset-top),64px)] z-30 -translate-x-1/2 max-w-[88vw] rounded-2xl bg-white text-zinc-900 px-4 py-2 text-left shadow-2xl"
        >
          <span className="block text-[11px] font-black text-emerald-700">💬 {bubble.name}</span>
          <span className="block text-sm line-clamp-2">{bubble.text}</span>
        </button>
      )}

      {panel && (
        <ChatSheet
          view={view}
          tab={panel}
          setTab={setPanel}
          onClose={() => setPanel(null)}
          onSend={(text) => send({ type: "chat", text })}
        />
      )}

      {leaving && (
        <LeaveSheet
          view={view}
          inRound={inLiveRound(view)}
          onStay={() => setLeaving(false)}
          onLeave={() => {
            setLeaving(false);
            send({ type: "leave" });
          }}
        />
      )}

      {toast && (
        <div className="pop fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-white text-zinc-900 px-4 py-2 text-sm font-semibold shadow-xl max-w-[90vw] text-center break-all">
          {toast}
        </div>
      )}
    </div>
  );
}
