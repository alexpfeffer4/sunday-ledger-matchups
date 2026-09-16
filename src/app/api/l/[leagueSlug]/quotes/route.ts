import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { storedQuoteUpdatesSchema } from "@/application/providers/stored-quote-updates";
export async function GET(
  request: Request,
  context: { params: Promise<{ leagueSlug: string }> },
) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const { leagueSlug } = await context.params;
  const input = z
    .object({
      leagueSlug: z
        .string()
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      weekId: z.uuid(),
    })
    .safeParse({
      leagueSlug,
      weekId: new URL(request.url).searchParams.get("weekId"),
    });
  if (!input.success)
    return Response.json({ error: "Invalid board." }, { status: 400, headers });
  try {
    const user = await createSupabaseServerClient();
    const result = await user.schema("api").rpc("get_stored_quote_updates", {
      p_league_slug: input.data.leagueSlug,
      p_week_id: input.data.weekId,
    });
    if (result.error)
      return Response.json(
        { error: "Quotes unavailable." },
        { status: result.error.code === "42501" ? 403 : 503, headers },
      );
    return Response.json(storedQuoteUpdatesSchema.parse(result.data), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "Quotes unavailable." },
      { status: 503, headers },
    );
  }
}
