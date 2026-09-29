import { NextResponse } from "next/server";
import {
  clearFailures,
  newSessionToken,
  normalizeUsername,
  recordFailure,
  sessionExpiryIso,
  setSessionCookie,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureBootstrap();

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password" }, { status: 400 });
  }

  if (tooManyAttempts(username)) {
    return NextResponse.json(
      { error: "Too many tries. Wait a few minutes and try again." },
      { status: 429 }
    );
  }

  try {
    const credentials = await store.findCredentials(username);
    const valid = credentials ? await verifyPassword(password, credentials.passwordHash) : false;
    if (!credentials || !valid) {
      recordFailure(username);
      return NextResponse.json({ error: "That username and password don't match" }, { status: 401 });
    }
    clearFailures(username);
    const { token, tokenHash } = newSessionToken();
    await store.createSession(tokenHash, credentials.id, sessionExpiryIso());
    await setSessionCookie(token);
    await store.touchPresence(credentials.id);
    const { passwordHash: _ignored, ...user } = credentials;
    return NextResponse.json({ user: { ...user, active: true } });
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Could not sign you in" }, { status: 500 });
  }
}
