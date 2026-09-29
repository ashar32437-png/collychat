import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminRequired } from "@/lib/guard";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_MINUTES = 60 * 24 * 365; // a year is effectively permanent

/** Turns a "how long" in minutes into an ISO moment, or null to lift it. */
function untilFrom(minutes: unknown): string | null | undefined {
  if (minutes === null) return null;
  if (minutes === undefined) return undefined;
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return new Date(Date.now() + Math.min(value, MAX_MINUTES) * 60_000).toISOString();
}

// Everyone, so an admin can see who is waiting to be let in.
export async function GET() {
  const me = await currentUser();
  const blocked = adminRequired(me);
  if (blocked) return blocked;

  try {
    const users = await store.listUsers();
    return NextResponse.json({
      users,
      pending: users.filter((user) => !user.approved).length,
    });
  } catch (err) {
    console.error("admin list failed", err);
    return NextResponse.json({ error: "Could not load accounts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const me = await currentUser();
  const blocked = adminRequired(me);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const userId = Number(body?.userId);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "Send a userId" }, { status: 400 });
  }
  if (userId === me?.id) {
    // Moderation is a two-way door only if someone else can undo it.
    return NextResponse.json({ error: "You can't moderate your own account" }, { status: 400 });
  }

  const approved = typeof body?.approved === "boolean" ? body.approved : undefined;
  const mutedUntil = untilFrom(body?.muteMinutes);
  const bannedUntil = untilFrom(body?.banMinutes);

  if (approved === undefined && mutedUntil === undefined && bannedUntil === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const user = await store.setUserFlags(userId, { approved, mutedUntil, bannedUntil });
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("admin update failed", err);
    return NextResponse.json({ error: "Could not update that account" }, { status: 500 });
  }
}
