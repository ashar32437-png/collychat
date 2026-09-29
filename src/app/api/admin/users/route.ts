import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminRequired } from "@/lib/guard";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

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
  const approved = body?.approved;

  if (!Number.isInteger(userId) || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Send a userId and approved" }, { status: 400 });
  }
  if (userId === me?.id && !approved) {
    return NextResponse.json({ error: "You can't lock yourself out" }, { status: 400 });
  }

  try {
    const user = await store.setUserFlags(userId, { approved });
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("admin update failed", err);
    return NextResponse.json({ error: "Could not update that account" }, { status: 500 });
  }
}
