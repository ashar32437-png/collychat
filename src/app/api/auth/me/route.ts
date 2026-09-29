import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { isDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBootstrap();
    const user = await currentUser();
    return NextResponse.json({ user, demo: isDemoMode() });
  } catch (err) {
    console.error("me failed", err);
    return NextResponse.json({ user: null, demo: isDemoMode() });
  }
}
