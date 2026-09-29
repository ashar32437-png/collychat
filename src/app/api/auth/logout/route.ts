import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookie, sha256 } from "@/lib/auth";
import { store } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await store.deleteSession(sha256(token));
    } catch (err) {
      console.error("logout failed", err);
    }
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
