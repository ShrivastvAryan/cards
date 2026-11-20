import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoMark } from "@/components/Logo";
import RoomClient from "./RoomClient";

export const metadata: Metadata = {
  title: "Join the table",
  description: "You're invited to a Teen Patti table. Pick a guest name and take a seat.",
};

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col gap-4 items-center justify-center text-emerald-200/70">
          <LogoMark className="w-16 h-16 animate-pulse" />
          Loading table…
        </div>
      }
    >
      <RoomClient />
    </Suspense>
  );
}
