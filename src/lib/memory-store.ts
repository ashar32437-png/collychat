import { DEFAULT_CHANNELS } from "./db";
import { SESSION_TTL_MS, attachmentUrl, isImageType } from "./types";
import type {
  Attachment,
  Conversation,
  Credentials,
  Message,
  PresenceStatus,
  StoreApi,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// Demo mode (no DATABASE_URL): everything lives in this process's memory.
// Accounts, messages and uploads reset when the server restarts.
// ---------------------------------------------------------------------------

type MemUser = {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarAttachmentId: number | null;
  status: PresenceStatus;
  isAdmin: boolean;
  approved: boolean;
  mutedUntil: string | null;
  bannedUntil: string | null;
  lastSeenAt: number | null;
};

type MemConversation = {
  id: number;
  kind: "channel" | "dm" | "group";
  name: string;
  slug: string | null;
  dmKey: string | null;
};

type MemMessage = {
  id: number;
  conversationId: number;
  authorId: number;
  body: string;
  attachmentId: number | null;
  clientId: string | null;
  createdAt: string;
};

type MemAttachment = {
  id: number;
  uploaderId: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: Buffer | null;
  remoteUrl: string | null;
};

const state = {
  users: [] as MemUser[],
  sessions: new Map<string, { userId: number; expiresAt: number }>(),
  conversations: [] as MemConversation[],
  members: [] as { conversationId: number; userId: number }[],
  messages: [] as MemMessage[],
  attachments: [] as MemAttachment[],
  ids: { user: 1, conversation: 1, message: 1, attachment: 1 },
};

DEFAULT_CHANNELS.forEach((name, index) => {
  state.conversations.push({
    id: index + 1,
    kind: "channel",
    name,
    slug: name,
    dmKey: null,
  });
});
state.ids.conversation = DEFAULT_CHANNELS.length + 1;

const avatarUrlFor = (attachmentId: number | null) =>
  attachmentId == null ? null : attachmentUrl(null, attachmentId);

const toUser = (user: MemUser): User => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: avatarUrlFor(user.avatarAttachmentId),
  status: user.status,
  isAdmin: user.isAdmin,
  approved: user.approved,
  mutedUntil: user.mutedUntil,
  bannedUntil: user.bannedUntil,
  lastSeenAt: user.lastSeenAt ? new Date(user.lastSeenAt).toISOString() : null,
});

const toConversation = (conversation: MemConversation): Conversation => ({
  id: conversation.id,
  kind: conversation.kind,
  name: conversation.name,
  slug: conversation.slug,
});

const dmKeyFor = (a: number, b: number) => Math.min(a, b) + ":" + Math.max(a, b);

const toAttachment = (attachment: MemAttachment): Attachment => ({
  id: attachment.id,
  filename: attachment.filename,
  contentType: attachment.contentType,
  sizeBytes: attachment.sizeBytes,
  url: attachmentUrl(attachment.remoteUrl, attachment.id),
  isImage: isImageType(attachment.contentType),
  remoteUrl: attachment.remoteUrl,
});

function toMessage(message: MemMessage): Message {
  const author = state.users.find((user) => user.id === message.authorId);
  const attachment =
    message.attachmentId == null
      ? null
      : state.attachments.find((item) => item.id === message.attachmentId) ?? null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    clientId: message.clientId,
    authorId: message.authorId,
    authorName: author?.displayName ?? "Deleted user",
    authorAvatarUrl: author ? avatarUrlFor(author.avatarAttachmentId) : null,
    body: message.body,
    attachment: attachment ? toAttachment(attachment) : null,
    createdAt: message.createdAt,
  };
}

export const memoryStore: StoreApi = {
  async createUser(input) {
    const user: MemUser = {
      id: state.ids.user++,
      username: input.username,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      avatarAttachmentId: null,
      status: "active",
      isAdmin: Boolean(input.isAdmin),
      approved: Boolean(input.approved),
      mutedUntil: null,
      bannedUntil: null,
      lastSeenAt: Date.now(),
    };
    state.users.push(user);
    return toUser(user);
  },

  async findCredentials(username) {
    const user = state.users.find((item) => item.username === username);
    if (!user) return null;
    return { ...toUser(user), passwordHash: user.passwordHash } satisfies Credentials;
  },

  async getUser(id) {
    const user = state.users.find((item) => item.id === id);
    return user ? toUser(user) : null;
  },

  async listUsers() {
    return [...state.users]
      .sort((a, b) => {
        if (a.approved !== b.approved) return a.approved ? 1 : -1;
        return a.username.localeCompare(b.username);
      })
      .map(toUser);
  },

  async updateUser(id, patch) {
    const user = state.users.find((item) => item.id === id);
    if (!user) return null;
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.status !== undefined) user.status = patch.status;
    if (patch.avatarAttachmentId !== undefined) {
      user.avatarAttachmentId = patch.avatarAttachmentId;
    }
    return toUser(user);
  },

  async setUserFlags(id, flags) {
    const user = state.users.find((item) => item.id === id);
    if (!user) return null;
    if (flags.isAdmin !== undefined) user.isAdmin = flags.isAdmin;
    if (flags.approved !== undefined) user.approved = flags.approved;
    if (flags.mutedUntil !== undefined) user.mutedUntil = flags.mutedUntil;
    if (flags.bannedUntil !== undefined) user.bannedUntil = flags.bannedUntil;
    return toUser(user);
  },

  async setPassword(id, passwordHash) {
    const user = state.users.find((item) => item.id === id);
    if (user) user.passwordHash = passwordHash;
  },

  async touchPresence(userId) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) return;
    const now = Date.now();
    if (!user.lastSeenAt || now - user.lastSeenAt > 10_000) user.lastSeenAt = now;
  },

  async listActiveUsers(sinceIso, excludeUserId) {
    const since = new Date(sinceIso).getTime();
    return state.users
      .filter(
        (user) => user.id !== excludeUserId && user.lastSeenAt != null && user.lastSeenAt > since
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((user) => ({ ...toUser(user), active: true }));
  },

  async createSession(tokenHash, userId, expiresAtIso) {
    state.sessions.set(tokenHash, {
      userId,
      expiresAt: new Date(expiresAtIso).getTime(),
    });
  },

  async getSessionUser(tokenHash) {
    const session = state.sessions.get(tokenHash);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      state.sessions.delete(tokenHash);
      return null;
    }
    if (session.expiresAt - Date.now() < SESSION_TTL_MS - 5 * 24 * 60 * 60 * 1000) {
      session.expiresAt = Date.now() + SESSION_TTL_MS;
    }
    const user = state.users.find((item) => item.id === session.userId);
    return user ? toUser(user) : null;
  },

  async deleteSession(tokenHash) {
    state.sessions.delete(tokenHash);
  },

  async listChannels() {
    return state.conversations.filter((item) => item.kind === "channel").map(toConversation);
  },

  async getConversation(id) {
    const conversation = state.conversations.find((item) => item.id === id);
    return conversation ? toConversation(conversation) : null;
  },

  async isMember(conversationId, userId) {
    return state.members.some(
      (item) => item.conversationId === conversationId && item.userId === userId
    );
  },

  async listMembers(conversationId) {
    return state.members
      .filter((item) => item.conversationId === conversationId)
      .map((item) => state.users.find((user) => user.id === item.userId))
      .filter((user): user is MemUser => Boolean(user))
      .map(toUser)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async listMyConversations(userId, kind) {
    const ids = state.members
      .filter((item) => item.userId === userId)
      .map((item) => item.conversationId);
    return state.conversations
      .filter((item) => item.kind === kind && ids.includes(item.id))
      .sort((a, b) => b.id - a.id)
      .map(toConversation);
  },

  async findDm(userA, userB) {
    const key = dmKeyFor(userA, userB);
    const conversation = state.conversations.find((item) => item.dmKey === key);
    return conversation ? toConversation(conversation) : null;
  },

  async createDm(userA, userB) {
    const key = dmKeyFor(userA, userB);
    const existing = state.conversations.find((item) => item.dmKey === key);
    const conversation: MemConversation =
      existing ?? {
        id: state.ids.conversation++,
        kind: "dm",
        name: "Direct message",
        slug: null,
        dmKey: key,
      };
    if (!existing) state.conversations.push(conversation);
    for (const userId of [userA, userB]) {
      const already = state.members.some(
        (member) => member.conversationId === conversation.id && member.userId === userId
      );
      if (!already) state.members.push({ conversationId: conversation.id, userId });
    }
    return toConversation(conversation);
  },

  async createGroup(name, memberIds, createdBy) {
    const conversation: MemConversation = {
      id: state.ids.conversation++,
      kind: "group",
      name,
      slug: null,
      dmKey: null,
    };
    state.conversations.push(conversation);
    for (const userId of Array.from(new Set([...memberIds, createdBy]))) {
      state.members.push({ conversationId: conversation.id, userId });
    }
    return toConversation(conversation);
  },

  async lastMessageTimes(conversationIds) {
    const map = new Map<number, string>();
    for (const id of conversationIds) {
      const times = state.messages
        .filter((message) => message.conversationId === id)
        .map((message) => message.createdAt);
      if (times.length) map.set(id, times.sort()[times.length - 1]);
    }
    return map;
  },

  async listMessages(conversationId, afterId, limit) {
    const rows = state.messages
      .filter(
        (message) =>
          message.conversationId === conversationId && (afterId === 0 || message.id > afterId)
      )
      .sort((a, b) => a.id - b.id);
    const slice = afterId === 0 ? rows.slice(-limit) : rows.slice(0, limit);
    return slice.map(toMessage);
  },

  async createMessage(conversationId, authorId, body, attachmentId, clientId = null) {
    if (clientId) {
      const already = state.messages.find((item) => item.clientId === clientId);
      if (already) return toMessage(already);
    }
    const message: MemMessage = {
      id: state.ids.message++,
      conversationId,
      authorId,
      body,
      attachmentId,
      clientId,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    if (state.messages.length > 5000) state.messages.shift();
    return toMessage(message);
  },

  async createAttachment(uploaderId, filename, contentType, sizeBytes, data, remoteUrl) {
    const attachment: MemAttachment = {
      id: state.ids.attachment++,
      uploaderId,
      filename,
      contentType,
      sizeBytes,
      data,
      remoteUrl,
    };
    state.attachments.push(attachment);
    return toAttachment(attachment);
  },

  async getAttachment(id) {
    const attachment = state.attachments.find((item) => item.id === id);
    if (!attachment) return null;
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      data: attachment.data,
      remoteUrl: attachment.remoteUrl,
    };
  },

  async deleteAttachment(id) {
    state.attachments = state.attachments.filter((item) => item.id !== id);
  },
};
