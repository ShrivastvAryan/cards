import { body, handle } from "@/lib/api";
import { createRoom } from "@/lib/game";

export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => createRoom(b.name, b.bots));
}
