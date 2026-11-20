import { handle } from "@/lib/api";
import { getRoom, viewFor } from "@/lib/game";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  return handle(() => {
    const room = getRoom(id);
    const pid = url.searchParams.get("pid");
    const token = url.searchParams.get("token");
    const viewer = room.players.find((p) => p.id === pid && p.token === token) ?? null;
    return viewFor(room, viewer);
  });
}
