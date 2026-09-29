import { NextResponse } from "next/server";
import { isBanned } from "./types";
import type { User } from "./types";

// Shared gates so every feature route answers the same way. Returns a
// response to send back, or null when the caller may continue.

/** A suspended account keeps its data but loses every route. */
function suspension(me: User): NextResponse {
  return NextResponse.json(
    {
      error:
        "Your account is suspended until " +
        new Date(me.bannedUntil as string).toLocaleString(),
      bannedUntil: me.bannedUntil ?? null,
    },
    { status: 403 }
  );
}

export function signInRequired(me: User | null): NextResponse | null {
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (isBanned(me)) return suspension(me);
  if (!me.approved) {
    return NextResponse.json({ error: "Your account is waiting for approval." }, { status: 403 });
  }
  return null;
}

export function adminRequired(me: User | null): NextResponse | null {
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  if (!me?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return null;
}
