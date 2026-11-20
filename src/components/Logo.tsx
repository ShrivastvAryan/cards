/** Teen Patti mark: renders the same badge as /logo.svg. */
export function LogoMark({ className = "w-10 h-10" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimization needed
  return <img src="/logo.svg" alt="" aria-hidden className={`${className} drop-shadow-lg select-none`} draggable={false} />;
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const mark = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-24 h-24 sm:w-28 sm:h-28" }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-4xl sm:text-5xl" }[size];
  const vertical = size === "lg";
  return (
    <span className={`inline-flex items-center ${vertical ? "flex-col gap-3" : "gap-2"}`}>
      <LogoMark className={mark} />
      <span
        className={`${text} font-black tracking-tight bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent`}
      >
        Teen Patti
      </span>
    </span>
  );
}
