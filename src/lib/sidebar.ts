import type { DmItem, GroupItem, PresenceStatus } from "./types";

export type SidebarItem =
  | {
      kind: "group";
      id: number;
      name: string;
      lastMessageAt: string | null;
      memberCount: number;
    }
  | {
      kind: "dm";
      id: number | null;
      userId: number;
      name: string;
      avatarUrl: string | null;
      status: PresenceStatus;
      active: boolean;
      lastMessageAt: string | null;
    };

export type DmSidebarItem = Extract<SidebarItem, { kind: "dm" }>;

/** Groups and DMs share one list, newest activity first, active people next. */
export function buildSidebarItems(groups: GroupItem[], dms: DmItem[]): SidebarItem[] {
  const items: SidebarItem[] = [
    ...groups.map((group) => ({
      kind: "group" as const,
      id: group.id,
      name: group.name,
      lastMessageAt: group.lastMessageAt,
      memberCount: group.memberCount,
    })),
    ...dms.map((dm) => ({
      kind: "dm" as const,
      id: dm.conversationId,
      userId: dm.userId,
      name: dm.displayName,
      avatarUrl: dm.avatarUrl,
      status: dm.status,
      active: dm.active,
      lastMessageAt: dm.lastMessageAt,
    })),
  ];

  return items.sort((a, b) => {
    const at = a.lastMessageAt ?? "";
    const bt = b.lastMessageAt ?? "";
    if (at !== bt) return at < bt ? 1 : -1;
    const aActive = a.kind === "dm" && a.active ? 1 : 0;
    const bActive = b.kind === "dm" && b.active ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return a.name.localeCompare(b.name);
  });
}
