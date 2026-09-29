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
  lastSeenAt?: string | null;
  /** true when the person has been seen inside the presence window */
  active?: boolean;
};

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
  setUserFlags(id: number, flags: { isAdmin?: boolean; approved?: boolean }): Promise<User | null>;
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
  createMessage(
    conversationId: number,
    authorId: number,
    body: string,
    attachmentId: number | null
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
