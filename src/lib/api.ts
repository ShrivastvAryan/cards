import { GameError } from "./game";

export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return {};
  }
}
