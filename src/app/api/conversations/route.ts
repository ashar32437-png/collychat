import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signInRequired } from "@/lib/guard";
import { store } from "@/lib/store";
import { MAX_GROUP_MEMBERS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await currentUser();
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind === "group" ? "group" : "dm";

  try {
    if (kind === "dm") {
      const userId = Number(body?.userId);
      if (!Number.isInteger(userId) || userId === me.id) {
        return NextResponse.json({ error: "Pick someone to message" }, { status: 400 });
      }
      const other = await store.getUser(userId);
      if (!other) return NextResponse.json({ error: "That account is gone" }, { status: 404 });
      const conversation = await store.createDm(me.id, userId);
      return NextResponse.json(
        { ...conversation, members: [me, other] },
        { status: 201 }
      );
    }

    const rawMembers = Array.isArray(body?.memberIds) ? body.memberIds : [];
    const memberIds = Array.from(
      new Set<number>(
        rawMembers
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value !== me.id)
      )
    );
    if (memberIds.length === 0) {
      return NextResponse.json({ error: "Add at least one person" }, { status: 400 });
    }
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      return NextResponse.json(
        { error: "Groups hold up to " + MAX_GROUP_MEMBERS + " people" },
        { status: 400 }
      );
    }
    const rawName = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
    let name = rawName;
    if (!name) {
      const firstNames: string[] = [];
      for (const id of memberIds) {
        const member = await store.getUser(id);
        if (member) firstNames.push(member.displayName.split(" ")[0]);
      }
      name = [me.displayName.split(" ")[0], ...firstNames].join(", ").slice(0, 40);
    }
    const conversation = await store.createGroup(name, memberIds, me.id);
    return NextResponse.json(
      { ...conversation, members: await store.listMembers(conversation.id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("create conversation failed", err);
    return NextResponse.json({ error: "Could not create that conversation" }, { status: 500 });
  }
}
