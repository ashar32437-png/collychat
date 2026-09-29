import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { hasDb, query } from "@/lib/db";
import { ensureBootstrap } from "@/lib/bootstrap";
import { isDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

// `dbError` is the important half of this response. When the database is
// unreachable this route used to look identical to "nobody is signed in", so a
// misconfigured connection string surfaced as "logging in doesn't work" instead
// of as an error anybody could act on.
export async function GET() {
  let user = null;
  let dbError = false;

  try {
    await ensureBootstrap();
    user = await currentUser();

    // Nobody signed in. Before saying so, make the database answer a trivial
    // question: ensureBootstrap swallows its own failures on purpose, so this is
    // the one place a wrong connection string becomes visible to the browser.
    if (!user && hasDb) await query("select 1");
  } catch (err) {
    console.error("me failed", err);
    dbError = true;
  }

  return NextResponse.json({ user, demo: isDemoMode(), dbError });
}
