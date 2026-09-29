import { NextResponse } from "next/server";
import {
  hashPassword,
  newSessionToken,
  normalizeUsername,
  sessionExpiryIso,
  setSessionCookie,
  validatePassword,
  validateUsername,
} from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureBootstrap();

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const nameError = validateUsername(username);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  try {
    if (await store.findCredentials(username)) {
      return NextResponse.json(
        { error: "That username is taken — try logging in instead" },
        { status: 409 }
      );
    }

    // New accounts start locked until an admin approves them.
    const user = await store.createUser({
      username,
      displayName: username,
      passwordHash: await hashPassword(password),
      approved: false,
    });

    const { token, tokenHash } = newSessionToken();
    await store.createSession(tokenHash, user.id, sessionExpiryIso());
    await setSessionCookie(token);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("register failed", err);
    return NextResponse.json({ error: "Could not create your account" }, { status: 500 });
  }
}
