import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Teen Patti — Play with friends",
    short_name: "Teen Patti",
    description: "Create a table as a guest, share the link, and play Teen Patti with friends or the computer.",
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
