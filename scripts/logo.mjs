// Generates every logo/icon asset from one SVG definition.
// Run: node scripts/logo.mjs
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const cards = `
  <defs>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#9f1239"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity=".45"/>
    </filter>
  </defs>
  <g filter="url(#sh)">
    <g transform="rotate(-20 256 430)">
      <rect x="181" y="140" width="150" height="214" rx="20" fill="url(#back)" stroke="#fff" stroke-width="9"/>
      <rect x="201" y="160" width="110" height="174" rx="10" fill="none" stroke="#fda4af" stroke-width="4" opacity=".7"/>
    </g>
    <g transform="rotate(20 256 430)">
      <rect x="181" y="140" width="150" height="214" rx="20" fill="url(#back)" stroke="#fff" stroke-width="9"/>
      <rect x="201" y="160" width="110" height="174" rx="10" fill="none" stroke="#fda4af" stroke-width="4" opacity=".7"/>
    </g>
    <rect x="181" y="128" width="150" height="214" rx="20" fill="#fff"/>
    <!-- crown -->
    <path d="M208 270 L208 206 L234 236 L256 192 L278 236 L304 206 L304 270 Z"
          fill="url(#gold)" stroke="#b45309" stroke-width="6" stroke-linejoin="round"/>
    <rect x="204" y="270" width="104" height="18" rx="6" fill="#dc2626" stroke="#991b1b" stroke-width="4"/>
    <circle cx="256" cy="190" r="9" fill="#dc2626"/>
    <circle cx="208" cy="204" r="7" fill="#dc2626"/>
    <circle cx="304" cy="204" r="7" fill="#dc2626"/>
  </g>`;

const felt = `
  <radialGradient id="felt" cx="50%" cy="42%" r="70%">
    <stop offset="0" stop-color="#22915a"/><stop offset=".6" stop-color="#156a40"/><stop offset="1" stop-color="#0c3a24"/>
  </radialGradient>`;

// Badge with rounded corners + gold rim (favicon, in-app logo).
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${felt}</defs>
  <rect x="12" y="12" width="488" height="488" rx="112" fill="url(#felt)" stroke="#fbbf24" stroke-width="20"/>
  <rect x="38" y="38" width="436" height="436" rx="90" fill="none" stroke="#fbbf24" stroke-width="3" opacity=".45"/>
  <g transform="translate(0 18)">${cards}</g>
</svg>`;

// Full-bleed square (Apple touch icon, Android maskable): OS applies its own mask.
const square = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${felt}</defs>
  <rect width="512" height="512" fill="url(#felt)"/>
  <g transform="translate(256 274) scale(${scale}) translate(-256 -256)">${cards}</g>
</svg>`;

// Social share preview (WhatsApp, iMessage, etc.)
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>${felt.replace('id="felt"', 'id="ogfelt"')}
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b1210"/>
  <ellipse cx="600" cy="315" rx="640" ry="380" fill="url(#ogfelt)" opacity=".55"/>
  <g transform="translate(90 125) scale(0.74)">${badge.replace(/<\/?svg[^>]*>/g, "")}</g>
  <text x="530" y="295" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="128" fill="url(#t)">Taash</text>
  <text x="535" y="375" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" fill="#d1fae5" opacity=".85">Card games with friends</text>
  <text x="535" y="430" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#a7f3d0" opacity=".6">Teen Patti · Bluff · Color Rush</text>
</svg>`;

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/logo.svg", badge);
writeFileSync("src/app/icon.svg", badge);
const png = (svg, size, out) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(out);
await png(badge, 192, "public/icons/icon-192.png");
await png(badge, 512, "public/icons/icon-512.png");
await png(square(0.78), 512, "public/icons/maskable-512.png");
await png(square(0.9), 180, "src/app/apple-icon.png");
await sharp(Buffer.from(og), { density: 144 }).resize(1200, 630).png().toFile("src/app/opengraph-image.png");
console.log("logo assets written");
