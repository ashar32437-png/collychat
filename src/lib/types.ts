// Shared types + constants. Safe to import from client components
// (nothing here touches the database or Node APIs at runtime).

export const SESSION_COOKIE = "chatter_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const ACTIVE_WINDOW_MS = 60 * 1000; // "active now" = seen in the last 60s
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENT_BYTES = 5_000_000; // 5 MB
export const MAX_AVATAR_BYTES = 5_000_000; // 5 MB
export const MAX_GROUP_MEMBERS = 12;

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 5;

export type PresenceStatus = "active" | "dnd";

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  active: "Active",
  dnd: "Do not disturb",
};

export type User = {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: PresenceStatus;
  isAdmin: boolean;
  approved: boolean;
  /** silenced until this moment; null when they may speak freely */
  mutedUntil?: string | null;
  /** locked out until this moment; null when they may sign in */
  bannedUntil?: string | null;
  lastSeenAt?: string | null;
  /** true when the person has been seen inside the presence window */
  active?: boolean;
};

const stillInFuture = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at > Date.now();
};

/** Feature routes ask this before letting anyone write or sign in. */
export const isMuted = (user: User | null | undefined): boolean =>
  stillInFuture(user?.mutedUntil);

export const isBanned = (user: User | null | undefined): boolean =>
  stillInFuture(user?.bannedUntil);

export const MUTE_OPTIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "8 hours", minutes: 480 },
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10_080 },
] as const;

export type Credentials = User & { passwordHash: string };

export type ConversationKind = "channel" | "dm" | "group";

export type Conversation = {
  id: number;
  kind: ConversationKind;
  name: string;
  slug: string | null;
};

export type ConversationInfo = Conversation & { members: User[] };

export type GroupItem = {
  id: number;
  name: string;
  lastMessageAt: string | null;
  memberCount: number;
};

export type Attachment = {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  isImage: boolean;
  remoteUrl: string | null;
};

export type Message = {
  id: number;
  conversationId: number;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  attachment: Attachment | null;
  createdAt: string;
  /**
   * The browser's own id for a message it sent. It travels with the message so
   * the optimistic copy on screen can be matched to the stored one exactly,
   * instead of being guessed at from its wording.
   */
  clientId?: string | null;
};

/**
 * A message shown the instant you press Enter, before the server has it.
 *
 * `pending` is what marks it out — not `clientId`, because a stored message
 * carries its client id too (that is how the two get matched up), and stored
 * messages are not being sent anywhere.
 */
export type OutboxMessage = Message & {
  pending: true;
  clientId: string;
  failed?: boolean;
};

export type DmItem = {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  status: PresenceStatus;
  active: boolean;
  conversationId: number | null;
  lastMessageAt: string | null;
};

export type SyncResponse = {
  me: User;
  /** set only while an admin is previewing another account (read-only) */
  viewAs: User | null;
  active: User[];
  dms: DmItem[];
  groups: GroupItem[];
  channels: Conversation[];
  conversation: ConversationInfo | null;
  messages: Message[] | null;
};

export const isImageType = (contentType: string) =>
  /^image\/(png|jpe?g|gif|webp|avif)$/i.test(contentType);

// Remote files are served straight from storage (one CDN hit, cached for a
// year); everything else is proxied through the app by id.
export const attachmentUrl = (remoteUrl: string | null, id: number) =>
  remoteUrl ?? "/api/attachments/" + id;

export type NewUser = {
  username: string;
  displayName: string;
  passwordHash: string;
  isAdmin?: boolean;
  approved?: boolean;
};

export type ProfilePatch = {
  displayName?: string;
  status?: PresenceStatus;
  avatarAttachmentId?: number | null;
};

export interface StoreApi {
  // users + presence
  createUser(input: NewUser): Promise<User>;
  findCredentials(username: string): Promise<Credentials | null>;
  getUser(id: number): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUser(id: number, patch: ProfilePatch): Promise<User | null>;
  setUserFlags(
    id: number,
    flags: {
      isAdmin?: boolean;
      approved?: boolean;
      /** ISO timestamp, or null to lift the silence / the lockout */
      mutedUntil?: string | null;
      bannedUntil?: string | null;
    }
  ): Promise<User | null>;
  setPassword(id: number, passwordHash: string): Promise<void>;
  touchPresence(userId: number): Promise<void>;
  listActiveUsers(sinceIso: string, excludeUserId: number): Promise<User[]>;

  // sessions
  createSession(tokenHash: string, userId: number, expiresAtIso: string): Promise<void>;
  getSessionUser(tokenHash: string): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;

  // conversations
  listChannels(): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | null>;
  isMember(conversationId: number, userId: number): Promise<boolean>;
  listMembers(conversationId: number): Promise<User[]>;
  listMyConversations(userId: number, kind: "dm" | "group"): Promise<Conversation[]>;
  findDm(userA: number, userB: number): Promise<Conversation | null>;
  createDm(userA: number, userB: number): Promise<Conversation>;
  createGroup(name: string, memberIds: number[], createdBy: number): Promise<Conversation>;
  lastMessageTimes(conversationIds: number[]): Promise<Map<number, string>>;

  // messages
  listMessages(conversationId: number, afterId: number, limit: number): Promise<Message[]>;
  /**
   * `clientId` makes the write idempotent: sending the same one twice — a
   * retry, or a reply whose response was lost — returns the message that is
   * already stored instead of posting a second copy.
   */
  createMessage(
    conversationId: number,
    authorId: number,
    body: string,
    attachmentId: number | null,
    clientId?: string | null
  ): Promise<Message>;

  // attachments
  createAttachment(
    uploaderId: number,
    filename: string,
    contentType: string,
    sizeBytes: number,
    data: Buffer | null,
    remoteUrl: string | null
  ): Promise<Attachment>;
  /** The row for one attachment; `data` is null when only a remote URL exists. */
  getAttachment(
    id: number
  ): Promise<{
    filename: string;
    contentType: string;
    sizeBytes: number;
    data: Buffer | null;
    remoteUrl: string | null;
  } | null>;
  deleteAttachment(id: number): Promise<void>;
}
