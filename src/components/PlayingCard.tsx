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
}: {
  card: Card | null;
  size?: keyof typeof SIZES;
  delay?: number;
  dim?: boolean;
}) {
  const style = { animationDelay: `${delay}ms` };
  if (!card) {
    return <div className={`deal card-back shrink-0 ${SIZES[size]} ${dim ? "opacity-40" : ""}`} style={style} />;
  }
  const red = card.s === "H" || card.s === "D";
  return (
    <div
      style={style}
      className={`deal shrink-0 bg-white shadow-md flex flex-col justify-between p-1 font-bold leading-none ${SIZES[size]} ${
        red ? "text-red-600" : "text-zinc-900"
      } ${dim ? "opacity-40" : ""}`}
    >
      <span>{rankLabel(card.r)}</span>
      <span className="self-center text-[1.6em]">{SUIT_SYMBOL[card.s]}</span>
      <span className="self-end rotate-180">{rankLabel(card.r)}</span>
    </div>
  );
}
