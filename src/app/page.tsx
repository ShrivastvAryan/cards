"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BuyMeCoffee } from "@/components/BuyMeCoffee";
import { Logo } from "@/components/Logo";
import { GAMES, type GameInfo } from "@/lib/catalog";
import { api, loadName, saveCreds, saveName } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<GameInfo | null>(null);

  useEffect(() => {
    // Runs on first load and again whenever Next.js re-shows this cached page
    // (e.g. after leaving a table), so a stale busy state never sticks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage
    setName(loadName());
    setBusy(false);
    setError("");
    setOpen(null);
  }, []);

  async function create(game: GameInfo, bots: number, options: Record<string, unknown>) {
    setError("");
    if (!name.trim()) {
      setOpen(null);
      setError("Enter your guest name first");
      document.getElementById("guest-name")?.focus();
      return;
    }
    setBusy(true);
    try {
      saveName(name.trim());
      const r = await api<{ roomId: string; playerId: string; token: string }>("/api/rooms", {
        name,
        bots,
        game: game.id,
        options,
      });
      saveCreds(r.roomId, { playerId: r.playerId, token: r.token });
      router.push(`/room/${r.roomId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join() {
    const c = code.trim().toUpperCase().replace(/.*\/ROOM\//, "");
    if (!c) return setError("Enter a table code or paste the invite link");
    if (name.trim()) saveName(name.trim());
    router.push(`/room/${c}`);
  }

  return (
    <main className="flex-1 w-full px-4 pt-[max(env(safe-area-inset-top),20px)] pb-10">
      <header className="flex flex-col items-center text-center mb-6">
        <Logo size="lg" />
        <p className="text-emerald-200/70 mt-2 text-sm">Card games with friends. No sign-up, just share a link.</p>
      </header>

      <label className="block mb-5">
        <span className="text-xs uppercase tracking-wider text-emerald-200/70">Your guest name</span>
        <input
          id="guest-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          placeholder="e.g. Raju"
          autoComplete="nickname"
          enterKeyHint="done"
          className="mt-1 w-full rounded-2xl bg-white/5 ring-1 ring-white/15 px-4 py-3.5 text-lg outline-none focus:ring-amber-400"
        />
      </label>

      {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}

      <h2 className="text-xs uppercase tracking-wider text-white/50 mb-2">Pick a game</h2>
      <div className="space-y-3">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setOpen(g)}
            className={`w-full text-left rounded-3xl bg-gradient-to-br ${g.accent} p-4 flex items-center gap-4 shadow-xl active:scale-[.98] transition`}
          >
            <span className="w-14 h-14 shrink-0 rounded-2xl bg-black/25 flex items-center justify-center text-3xl">
              {g.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-black">{g.title}</span>
              <span className="block text-sm text-white/85 leading-snug">{g.tagline}</span>
              <span className="block text-[11px] text-white/70 mt-0.5">{g.players} · vs friends or computer</span>
            </span>
            <span className="text-2xl text-white/80">›</span>
          </button>
        ))}
      </div>

      <h2 className="text-xs uppercase tracking-wider text-white/50 mt-8 mb-2">Got an invite?</h2>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Table code or link"
          autoCapitalize="characters"
          enterKeyHint="go"
          className="min-w-0 flex-1 rounded-2xl bg-white/5 ring-1 ring-white/15 px-4 py-3.5 uppercase outline-none focus:ring-amber-400"
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <button onClick={join} className="rounded-2xl bg-emerald-600 font-bold px-6 active:scale-95 transition">
          Join
        </button>
      </div>

      <div className="mt-10 flex flex-col items-center gap-2 text-center">
        <BuyMeCoffee />
        <p className="text-xs text-white/40">Enjoying the games? Support their development.</p>
      </div>

      {open && <GameSheet game={open} busy={busy} onClose={() => setOpen(null)} onCreate={create} />}
    </main>
  );
}

function GameSheet({
  game,
  busy,
  onClose,
  onCreate,
}: {
  game: GameInfo;
  busy: boolean;
  onClose: () => void;
  onCreate: (g: GameInfo, bots: number, options: Record<string, unknown>) => void;
}) {
  const [bots, setBots] = useState(Math.min(3, game.maxBots));
  const [joker, setJoker] = useState(false);
  const options = game.id === "teenpatti" ? { joker } : {};

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="pop w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-zinc-900 ring-1 ring-white/10 p-5 pb-[max(env(safe-area-inset-bottom),20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${game.accent} flex items-center justify-center text-2xl`}>
            {game.emoji}
          </span>
          <div className="flex-1">
            <h3 className="text-2xl font-black leading-tight">{game.title}</h3>
            <p className="text-xs text-white/60">{game.players}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10" aria-label="Close">
            ✕
          </button>
        </div>

        {game.id === "teenpatti" && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wider text-white/50 mb-2">Mode</p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/30 p-1">
              {[
                { v: false, label: "Classic", sub: "Standard rules" },
                { v: true, label: "🃏 Joker", sub: "A random rank is wild" },
              ].map((m) => (
                <button
                  key={m.label}
                  onClick={() => setJoker(m.v)}
                  className={`rounded-xl py-2.5 transition ${joker === m.v ? "bg-amber-400 text-zinc-900" : "text-white/70"}`}
                >
                  <span className="block font-bold">{m.label}</span>
                  <span className="block text-[11px] opacity-80">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => onCreate(game, 0, options)}
          disabled={busy}
          className="w-full min-h-14 rounded-2xl bg-amber-400 text-zinc-900 font-bold text-lg active:scale-[.98] transition disabled:opacity-60"
        >
          {busy ? "Creating…" : "👥 Play with friends"}
        </button>

        <div className="mt-3 rounded-2xl bg-black/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-white/80">🤖 Computer players</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBots((b) => Math.max(1, b - 1))}
                className="w-10 h-10 rounded-xl bg-white/10 text-xl font-bold active:scale-95"
                aria-label="Fewer computer players"
              >
                −
              </button>
              <span className="w-6 text-center text-lg font-black">{bots}</span>
              <button
                onClick={() => setBots((b) => Math.min(game.maxBots, b + 1))}
                className="w-10 h-10 rounded-xl bg-white/10 text-xl font-bold active:scale-95"
                aria-label="More computer players"
              >
                +
              </button>
            </div>
          </div>
          <button
            onClick={() => onCreate(game, bots, options)}
            disabled={busy}
            className="w-full min-h-12 rounded-2xl bg-violet-600 font-bold active:scale-[.98] transition disabled:opacity-60"
          >
            {busy ? "Creating…" : "Play vs computer"}
          </button>
          <p className="text-[11px] text-white/40 text-center">Friends can still join with your link.</p>
        </div>

        <details className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-white/75">
          <summary className="cursor-pointer font-semibold text-white">How to play</summary>
          <ul className="mt-3 space-y-1.5 list-disc pl-5">
            {game.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
