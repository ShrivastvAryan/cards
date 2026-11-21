import { body, handle } from "@/lib/api";
import { createRoom } from "@/lib/rooms";

export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => createRoom({ name: b.name, bots: b.bots, game: b.game, options: b.options }));
}
