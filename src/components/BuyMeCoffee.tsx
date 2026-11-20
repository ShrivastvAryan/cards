/**
 * "Buy me a coffee" link. Set NEXT_PUBLIC_BMC_USERNAME (your buymeacoffee.com
 * username) to show it; when unset, nothing renders.
 */
const username = process.env.NEXT_PUBLIC_BMC_USERNAME?.trim().replace(/^@/, "");

export function BuyMeCoffee({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  if (!username) return null;
  const href = `https://buymeacoffee.com/${encodeURIComponent(username)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFDD00] text-zinc-900 font-bold shadow-lg active:scale-95 transition hover:brightness-95 ${
        compact ? "px-3 py-2 text-sm" : "px-5 py-3 text-base"
      } ${className}`}
    >
      <span aria-hidden>☕</span>
      Buy me a coffee
    </a>
  );
}
