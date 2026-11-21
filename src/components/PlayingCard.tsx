import { rankLabel, SUIT_SYMBOL, type Card } from "@/lib/cards";

const SIZES = {
  sm: "w-8 h-11 text-[11px] rounded-md",
  md: "w-12 h-[4.25rem] text-sm rounded-lg",
  lg: "w-16 h-[5.75rem] sm:w-20 sm:h-28 text-lg sm:text-xl rounded-xl",
};

export function PlayingCard({
  card,
  size = "md",
  delay = 0,
  dim = false,
  wild = false,
}: {
  card: Card | null;
  size?: keyof typeof SIZES;
  delay?: number;
  dim?: boolean;
  wild?: boolean;
}) {
  const style = { animationDelay: `${delay}ms` };
  if (!card) {
    return <div className={`deal card-back shrink-0 ${SIZES[size]} ${dim ? "opacity-40" : ""}`} style={style} />;
  }
  if (card.r === 0) {
    return (
      <div
        style={style}
        className={`deal relative shrink-0 select-none shadow-md flex flex-col items-center justify-center bg-gradient-to-br from-fuchsia-100 via-white to-amber-100 ring-2 ring-fuchsia-500 text-fuchsia-700 font-black leading-none ${SIZES[size]} ${dim ? "opacity-40" : ""}`}
      >
        <span className="text-[1.7em]">🃏</span>
        <span className="text-[.6em] tracking-widest mt-0.5">JOKER</span>
      </div>
    );
  }
  const red = card.s === "H" || card.s === "D";
  return (
    <div
      style={style}
      className={`deal relative shrink-0 bg-white shadow-md flex flex-col justify-between p-1 font-bold leading-none select-none ${SIZES[size]} ${
        wild ? "ring-4 ring-fuchsia-500" : ""
      } ${
        red ? "text-red-600" : "text-zinc-900"
      } ${dim ? "opacity-40" : ""}`}
    >
      <span>{rankLabel(card.r)}</span>
      <span className="self-center text-[1.6em]">{SUIT_SYMBOL[card.s]}</span>
      <span className="self-end rotate-180">{rankLabel(card.r)}</span>
      {wild && (
        <span className="absolute -top-2 -right-2 rounded-full bg-fuchsia-600 text-white text-[9px] px-1.5 py-0.5 font-black">
          WILD
        </span>
      )}
    </div>
  );
}
