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
import { isBanned } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
    // Inside the try so an unreachable database comes back as our own error
    // message rather than a bare 500 the browser can only render as a blank page.
    await ensureBootstrap();
    const credentials = await store.findCredentials(username);
    const valid = credentials ? await verifyPassword(password, credentials.passwordHash) : false;
    if (!credentials || !valid) {
      recordFailure(username);
      return NextResponse.json({ error: "That username and password don't match" }, { status: 401 });
    }
    if (isBanned(credentials)) {
      // Say so plainly rather than letting them in and cutting them off on the
      // next request, which looks like the app being broken.
      return NextResponse.json(
        {
          error:
            "This account is suspended until " +
            new Date(credentials.bannedUntil as string).toLocaleString(),
          bannedUntil: credentials.bannedUntil,
        },
        { status: 403 }
      );
    }
    clearFailures(username);
    const { token, tokenHash } = newSessionToken();
    await store.createSession(tokenHash, credentials.id, sessionExpiryIso());
    await setSessionCookie(token);
    await store.touchPresence(credentials.id);
    const { passwordHash: _ignored, ...user } = credentials;
    return NextResponse.json({ user: { ...user, active: true } });
  } catch (err) {
    // This is nearly always a database problem (bad credentials, unreachable
    // host) rather than anything the person typing can fix.
    console.error("login failed", err);
    return NextResponse.json({ error: "Could not sign you in" }, { status: 500 });
  }
}
