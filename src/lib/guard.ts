import { NextResponse } from "next/server";
import type { User } from "./types";

// Shared gates so every feature route answers the same way. Returns a
// response to send back, or null when the caller may continue.
export function signInRequired(me: User | null): NextResponse | null {
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
