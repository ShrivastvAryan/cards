import type { Color, CRCard } from "@/lib/games/colorrush";

export const COLOR_BG: Record<Color | "W", string> = {
  R: "from-rose-500 to-red-700",
  Y: "from-amber-300 to-yellow-500",
  G: "from-emerald-400 to-green-700",
  B: "from-sky-400 to-blue-700",
  W: "from-zinc-700 to-zinc-950",
};
export const COLOR_DOT: Record<Color, string> = {
  R: "bg-red-500",
  Y: "bg-yellow-400",
  G: "bg-green-500",
  B: "bg-blue-500",
};

const glyph = (v: CRCard["v"]) =>
  ({ skip: "⊘", rev: "⇄", "+2": "+2", wild: "✦", "+4": "+4" })[v as string] ?? v;

const SIZES = {
  sm: "w-10 h-14 text-[10px]",
  md: "w-16 h-24 text-xs",
  hand: "w-[4.25rem] h-[6.25rem] sm:w-20 sm:h-28 text-sm",
  lg: "w-20 h-28 text-sm",
};
const CENTER = { sm: "text-xl", md: "text-3xl", hand: "text-4xl", lg: "text-5xl" };

export function ColorCard({
  card,
  size = "md",
  dim = false,
  lift = false,
}: {
  card: CRCard | null;
  size?: keyof typeof SIZES;
  dim?: boolean;
  lift?: boolean;
}) {
  if (!card) {
    return (
      <div
        className={`${SIZES[size]} shrink-0 rounded-xl ring-2 ring-white/80 bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center font-black text-white/90 shadow-lg`}
      >
        <span className="rotate-[-20deg] text-[1.1em] tracking-tight">RUSH</span>
      </div>
    );
  }
  const g = glyph(card.v);
  const dark = card.c === "Y";
  return (
    <div
      className={`${SIZES[size]} relative shrink-0 select-none rounded-xl ring-2 ring-white/90 bg-gradient-to-br ${COLOR_BG[card.c]} shadow-lg font-black ${
        dark ? "text-zinc-900" : "text-white"
      } ${dim ? "brightness-[.45]" : ""} ${lift ? "shadow-[0_0_0_3px_#fff,0_10px_24px_rgba(0,0,0,.55)]" : ""} transition`}
    >
      <span className="absolute left-1 top-0.5">{g}</span>
      <span className="absolute right-1 bottom-0.5 rotate-180">{g}</span>
      {card.c === "W" ? (
        <span className="absolute inset-0 m-auto w-[62%] aspect-square rounded-full bg-[conic-gradient(#ef4444_0_25%,#facc15_0_50%,#22c55e_0_75%,#3b82f6_0)] ring-2 ring-white/90 flex items-center justify-center">
          <span className={`${CENTER[size]} text-white drop-shadow-[0_2px_2px_rgba(0,0,0,.6)]`}>
            {card.v === "+4" ? "+4" : ""}
          </span>
        </span>
      ) : (
        <span
          className={`absolute inset-0 flex items-center justify-center ${CENTER[size]} drop-shadow-[0_2px_2px_rgba(0,0,0,.35)]`}
        >
          {g}
        </span>
      )}
    </div>
  );
}
