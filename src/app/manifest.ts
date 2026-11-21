import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taash — Card games with friends",
    short_name: "Taash",
    description: "Teen Patti, Bluff and Color Rush with friends or the computer. No sign-up.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1210",
    theme_color: "#0b1210",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
