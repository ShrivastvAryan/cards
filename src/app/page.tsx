"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { api, loadName, saveCreds, saveName } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [bots, setBots] = useState(2);
  const [error, setError] = useState("");

  useEffect(() => {
    // Runs on first load and again whenever Next.js re-shows this cached page
    // (e.g. after leaving a table), so a stale "Creating…" state never sticks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage
    setName(loadName());
    setBusy(false);
    setError("");
  }, []);

  async function create(withBots = 0) {
    setError("");
    if (!name.trim()) return setError("Enter a guest name first");
    setBusy(true);
    try {
      saveName(name.trim());
      const r = await api<{ roomId: string; playerId: string; token: string }>("/api/rooms", { name, bots: withBots });
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
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1>
            <Logo size="lg" />
          </h1>
          <p className="text-emerald-200/70 mt-2 text-sm">
            No sign-up. Pick a guest name, share the link, play with friends.
          </p>
        </div>

        <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-5 backdrop-blur">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-emerald-200/70">Guest name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="e.g. Raju"
              className="mt-1 w-full rounded-xl bg-black/40 ring-1 ring-white/15 px-4 py-3 text-lg outline-none focus:ring-amber-400"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </label>

          <button
            onClick={() => create()}
            disabled={busy}
            className="w-full rounded-xl bg-amber-400 text-zinc-900 font-bold py-3.5 text-lg active:scale-[.98] transition disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create a table with friends"}
          </button>

          <div className="rounded-xl bg-black/30 ring-1 ring-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">🤖 Computer players</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setBots(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition ${
                      bots === n ? "bg-violet-500 text-white" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => create(bots)}
              disabled={busy}
              className="w-full rounded-xl bg-violet-600 font-bold py-3 active:scale-[.98] transition disabled:opacity-60"
            >
              Play with computer
            </button>
            <p className="text-[11px] text-white/40 text-center">Friends can still join with your link.</p>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/40">
            <div className="h-px flex-1 bg-white/10" /> or join friends <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Table code / link"
              className="min-w-0 flex-1 rounded-xl bg-black/40 ring-1 ring-white/15 px-4 py-3 uppercase outline-none focus:ring-amber-400"
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button
              onClick={join}
              className="rounded-xl bg-emerald-600 font-semibold px-5 active:scale-[.98] transition"
            >
              Join
            </button>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>

        <details className="mt-6 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/70">
          <summary className="cursor-pointer font-semibold text-white/90">How to play</summary>
          <ul className="mt-3 space-y-1.5 list-disc pl-5">
            <li>Everyone gets 3 cards and puts a ₹10 boot into the pot. Each guest starts with ₹1000 play chips.</li>
            <li><b>Blind</b> players bet the current stake; <b>seen</b> players (after tapping “See cards”) bet double.</li>
            <li><b>Raise</b> doubles the stake. <b>Pack</b> to fold.</li>
            <li><b>Side show</b>: a seen player can ask the previous seen player to compare cards privately; the lower hand packs.</li>
            <li><b>Show</b>: when only 2 players are left, compare cards. Whoever asks for the show loses a tie.</li>
            <li>Ranking: Trail › Pure sequence › Sequence › Color › Pair › High card.</li>
            <li>30 seconds per turn, otherwise you auto-pack. Can&apos;t cover a bet? You go all-in and everyone shows.</li>
            <li>Pot limit is ₹2000: once the pot reaches it, everyone still in shows their cards.</li>
          </ul>
        </details>
      </div>
    </main>
  );
}
