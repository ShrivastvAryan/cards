import { body, handle } from "@/lib/api";
import type { Action } from "@/lib/core";
import { act, auth, getRoom, viewFor } from "@/lib/rooms";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body(req);
  return handle(() => {
    const room = getRoom(id);
    const player = auth(room, b.pid, b.token);
    act(room, player, (b.action ?? {}) as Action);
    const still = room.players.find((p) => p.id === player.id) ?? null;
    return viewFor(room, still);
  });
}
