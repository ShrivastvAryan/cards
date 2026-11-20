import { body, handle } from "@/lib/api";
import { getRoom, joinRoom } from "@/lib/game";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await body(req);
  return handle(() => joinRoom(getRoom(id), b.name));
}
