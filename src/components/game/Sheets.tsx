"use client";

import { useEffect, useRef, useState } from "react";
import { BuyMeCoffee } from "@/components/BuyMeCoffee";
import type { RoomView } from "@/lib/client";

const QUICK = ["👍", "😂", "😮", "🔥", "🙏", "Nice one!", "Hurry up 😅", "GG!"];

/** Bottom sheet used on phones; a side panel on wider screens. */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="pop w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-zinc-950 ring-1 ring-white/10 pb-[max(env(safe-area-inset-bottom),12px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

export function ChatSheet({
  view,
  tab,
  setTab,
  onClose,
  onSend,
}: {
  view: RoomView;
  tab: "chat" | "log";
  setTab: (t: "chat" | "log") => void;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const last = view.chat.at(-1)?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [last, tab]);

  async function send(t: string) {
    if (!t.trim() || sending) return;
    setSending(true);
    if (await onSend(t)) setText("");
    setSending(false);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
        <div className="flex flex-1 rounded-full bg-white/10 p-1">
          {(["chat", "log"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-2 text-sm font-bold transition ${
                tab === t ? "bg-white text-zinc-900" : "text-white/70"
              }`}
            >
              {t === "chat" ? "💬 Chat" : "📜 Log & scores"}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10" aria-label="Close">
          ✕
        </button>
      </div>

      {tab === "chat" ? (
        <>
          <div ref={listRef} className="flex-1 min-h-[180px] overflow-y-auto px-4 py-2 space-y-2">
            {view.chat.length === 0 && (
              <p className="text-center text-sm text-white/40 py-8">
                No messages yet. Say hi 👋
                <br />
                <span className="text-xs">Chat isn&apos;t saved: it disappears when the table closes.</span>
              </p>
            )}
            {view.chat.map((m) => {
              const mine = m.by === view.me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-[15px] leading-snug break-words ${
                      mine ? "bg-amber-400 text-zinc-900 rounded-br-md" : "bg-white/10 rounded-bl-md"
                    }`}
                  >
                    {!mine && <div className="text-[11px] font-bold text-emerald-300">{m.name}</div>}
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2 shrink-0">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={sending}
                className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-sm active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 px-4 pt-1 shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder="Message the table…"
              enterKeyHint="send"
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="w-12 h-12 shrink-0 rounded-full bg-amber-400 text-zinc-900 text-lg font-black disabled:opacity-40 active:scale-95"
              aria-label="Send"
            >
              ➤
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-2" ref={listRef}>
          <div className="mb-4 flex flex-wrap gap-2">
            {[...view.players]
              .sort((a, b) => (view.game === "teenpatti" ? b.chips - a.chips : b.score - a.score))
              .map((p) => (
                <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                  {p.name}: <b>{view.game === "teenpatti" ? `₹${p.chips}` : p.score}</b>
                </span>
              ))}
          </div>
          <ul className="space-y-1.5 text-sm text-white/80">
            {view.log.map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ul>
          <BuyMeCoffee compact className="mt-6 w-full" />
        </div>
      )}
    </Sheet>
  );
}

export function LeaveSheet({
  view,
  inRound,
  onStay,
  onLeave,
}: {
  view: RoomView;
  inRound: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const isHost = view.hostId === view.me;
  const nextHost = view.players.find((p) => p.id !== view.me && !p.bot);
  const consequence = !inRound
    ? "You can rejoin later with the invite link as a new player."
    : view.game === "teenpatti"
      ? "You'll pack this hand and lose what you've bet."
      : "You'll drop out of this round and your cards go back into the game.";
  return (
    <Sheet onClose={onStay}>
      <div className="px-5 pt-4 pb-2 text-center">
        <div className="text-4xl mb-2">🚪</div>
        <h2 className="text-xl font-black">Leave the table?</h2>
        <p className="mt-2 text-sm text-white/70">{consequence}</p>
        {isHost && (
          <p className="mt-1 text-sm text-white/70">
            {nextHost ? `${nextHost.name} will become the host.` : "The table will close since no other humans are here."}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onStay} className="min-h-12 rounded-2xl bg-white/10 font-bold active:scale-95">
            Stay
          </button>
          <button onClick={onLeave} className="min-h-12 rounded-2xl bg-red-600 font-bold active:scale-95">
            Leave table
          </button>
        </div>
      </div>
    </Sheet>
  );
}
