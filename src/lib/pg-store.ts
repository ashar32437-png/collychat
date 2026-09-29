import { ensureSchema, query } from "./db";
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

type UserRow = {
  id: number;
  username: string;
  displayName: string;
  avatarAttachmentId: number | null;
  status: string;
  isAdmin: boolean;
  approved: boolean;
  mutedUntil?: string | null;
  bannedUntil?: string | null;
  lastSeenAt?: string | null;
};

type ConversationRow = {
  id: number;
  kind: "channel" | "dm" | "group";
  name: string;
  slug: string | null;
};

type MessageRow = {
  id: number;
  conversationId: number;
  clientId?: string | null;
  authorId: number | null;
  authorName: string | null;
  authorAvatarAttachmentId: number | null;
  body: string;
  createdAt: string;
  attachmentId: number | null;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  remoteUrl: string | null;
};

const STAMP = "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'";

// Timestamps go back to the browser as strings in the same shape messages use,
// so the client can compare them without knowing about Date objects.
function stampColumns(column: string): string {
  return (
    "to_char(" +
    column +
    " AT TIME ZONE 'UTC', " +
    STAMP +
    ")"
  );
}

function userColumns(alias = ""): string {
  const p = alias ? alias + "." : "";
  return (
    p +
    "id, " +
    p +
    "username, " +
    p +
    'display_name AS "displayName", ' +
    p +
    'avatar_attachment_id AS "avatarAttachmentId", ' +
    p +
    "status, " +
    p +
    'is_admin AS "isAdmin", ' +
    p +
    "approved, " +
    stampColumns(p + "muted_until") +
    ' AS "mutedUntil", ' +
    stampColumns(p + "banned_until") +
    ' AS "bannedUntil"'
  );
}

const MESSAGE_SELECT =
  "SELECT m.id, m.conversation_id AS \"conversationId\", m.client_id AS \"clientId\", " +
  "m.author_id AS \"authorId\", " +
  "COALESCE(u.display_name, 'Deleted user') AS \"authorName\", " +
  "u.avatar_attachment_id AS \"authorAvatarAttachmentId\", m.body, " +
  "to_char(m.created_at AT TIME ZONE 'UTC', " +
  STAMP +
  ") AS \"createdAt\", " +
  "a.id AS \"attachmentId\", a.filename, a.content_type AS \"contentType\", " +
  "a.size_bytes AS \"sizeBytes\", a.remote_url AS \"remoteUrl\" " +
  "FROM messages m LEFT JOIN users u ON u.id = m.author_id " +
  "LEFT JOIN attachments a ON a.id = m.attachment_id ";

const toStatus = (value: string): PresenceStatus => (value === "dnd" ? "dnd" : "active");

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarAttachmentId ? attachmentUrl(null, row.avatarAttachmentId) : null,
    status: toStatus(row.status),
    isAdmin: row.isAdmin,
    approved: row.approved,
    mutedUntil: row.mutedUntil ?? null,
    bannedUntil: row.bannedUntil ?? null,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    clientId: row.clientId ?? null,
    authorId: row.authorId ?? 0,
    authorName: row.authorName ?? "Deleted user",
    authorAvatarUrl: row.authorAvatarAttachmentId
      ? attachmentUrl(null, row.authorAvatarAttachmentId)
      : null,
    body: row.body,
    attachment:
      row.attachmentId == null
        ? null
        : {
            id: row.attachmentId,
            filename: row.filename ?? "file",
            contentType: row.contentType ?? "application/octet-stream",
            sizeBytes: row.sizeBytes ?? 0,
            url: attachmentUrl(row.remoteUrl ?? null, row.attachmentId),
            isImage: isImageType(row.contentType ?? ""),
            remoteUrl: row.remoteUrl ?? null,
          },
    createdAt: row.createdAt,
  };
}

export const pgStore: StoreApi = {
  // ------------------------------------------------------------- users
  async createUser(input) {
    await ensureSchema();
    const rows = await query<UserRow>(
      "INSERT INTO users (username, display_name, password_hash, is_admin, approved, last_seen_at) " +
        "VALUES ($1, $2, $3, $4, $5, now()) RETURNING " +
        userColumns(),
      [
        input.username,
        input.displayName,
        input.passwordHash,
        Boolean(input.isAdmin),
        Boolean(input.approved),
      ]
    );
    return toUser(rows[0]);
  },

  async findCredentials(username) {
    await ensureSchema();
    const rows = await query<UserRow & { passwordHash: string }>(
      "SELECT " + userColumns() + ", password_hash AS \"passwordHash\" FROM users WHERE username = $1",
      [username]
    );
    const row = rows[0];
    return row ? ({ ...toUser(row), passwordHash: row.passwordHash } satisfies Credentials) : null;
  },

  async getUser(id) {
    await ensureSchema();
    const rows = await query<UserRow>(
      "SELECT " + userColumns() + " FROM users WHERE id = $1",
      [id]
    );
    return rows[0] ? toUser(rows[0]) : null;
  },

  async listUsers() {
    await ensureSchema();
    const rows = await query<UserRow>(
      "SELECT " +
        userColumns() +
        " FROM users ORDER BY approved ASC, is_admin DESC, username ASC"
    );
    return rows.map(toUser);
  },

  async updateUser(id, patch) {
    await ensureSchema();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.displayName !== undefined) {
      params.push(patch.displayName);
      sets.push("display_name = $" + params.length);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push("status = $" + params.length);
    }
    if (patch.avatarAttachmentId !== undefined) {
      params.push(patch.avatarAttachmentId);
      sets.push("avatar_attachment_id = $" + params.length);
    }
    if (sets.length === 0) return pgStore.getUser(id);
    params.push(id);
    await query("UPDATE users SET " + sets.join(", ") + " WHERE id = $" + params.length, params);
    return pgStore.getUser(id);
  },

  async setUserFlags(id, flags) {
    await ensureSchema();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (flags.isAdmin !== undefined) {
      params.push(flags.isAdmin);
      sets.push("is_admin = $" + params.length);
    }
    if (flags.approved !== undefined) {
      params.push(flags.approved);
      sets.push("approved = $" + params.length);
    }
    if (flags.mutedUntil !== undefined) {
      params.push(flags.mutedUntil);
      sets.push("muted_until = $" + params.length + "::timestamptz");
    }
    if (flags.bannedUntil !== undefined) {
      params.push(flags.bannedUntil);
      sets.push("banned_until = $" + params.length + "::timestamptz");
    }
    if (sets.length === 0) return pgStore.getUser(id);
    params.push(id);
    await query("UPDATE users SET " + sets.join(", ") + " WHERE id = $" + params.length, params);
    return pgStore.getUser(id);
  },

  async setPassword(id, passwordHash) {
    await ensureSchema();
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
  },

  async touchPresence(userId) {
    await ensureSchema();
    // Throttled: at most one write per user per 10 seconds.
    await query(
      "UPDATE users SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 seconds')",
      [userId]
    );
  },

  async listActiveUsers(sinceIso, excludeUserId) {
    await ensureSchema();
    const rows = await query<UserRow>(
      "SELECT " +
        userColumns() +
        " FROM users WHERE id <> $1 AND last_seen_at IS NOT NULL AND last_seen_at > $2::timestamptz ORDER BY display_name",
      [excludeUserId, sinceIso]
    );
    return rows.map((row) => ({ ...toUser(row), active: true }));
  },

  // ---------------------------------------------------------- sessions
  async createSession(tokenHash, userId, expiresAtIso) {
    await ensureSchema();
    await query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)",
      [tokenHash, userId, expiresAtIso]
    );
  },

  async getSessionUser(tokenHash) {
    await ensureSchema();
    const rows = await query<UserRow & { expiresAt: string | Date }>(
      "SELECT " +
        userColumns("u") +
        ", s.expires_at AS \"expiresAt\" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1",
      [tokenHash]
    );
    const row = rows[0];
    if (!row) return null;
    const expires = new Date(row.expiresAt).getTime();
    const now = Date.now();
    if (!Number.isFinite(expires) || expires < now) {
      await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
      return null;
    }
    // Slide the expiry forward at most once per few days.
    if (expires - now < SESSION_TTL_MS - 5 * 24 * 60 * 60 * 1000) {
      await query(
        "UPDATE sessions SET expires_at = now() + interval '30 days' WHERE token_hash = $1",
        [tokenHash]
      );
    }
    return toUser(row);
  },

  async deleteSession(tokenHash) {
    await ensureSchema();
    await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  },

  // ----------------------------------------------------- conversations
  async listChannels() {
    await ensureSchema();
    return query<ConversationRow>(
      "SELECT id, kind, name, slug FROM conversations WHERE kind = 'channel' ORDER BY id"
    );
  },

  async getConversation(id) {
    await ensureSchema();
    const rows = await query<ConversationRow>(
      "SELECT id, kind, name, slug FROM conversations WHERE id = $1",
      [id]
    );
    return rows[0] ?? null;
  },

  async isMember(conversationId, userId) {
    await ensureSchema();
    const rows = await query<{ ok: number }>(
      "SELECT 1 AS ok FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId]
    );
    return rows.length > 0;
  },

  async listMembers(conversationId) {
    await ensureSchema();
    const rows = await query<UserRow>(
      "SELECT " +
        userColumns("u") +
        " FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = $1 ORDER BY u.display_name",
      [conversationId]
    );
    return rows.map(toUser);
  },

  async listMyConversations(userId, kind) {
    await ensureSchema();
    return query<Conversation>(
      "SELECT c.id, c.kind, c.name, c.slug FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE m.user_id = $1 AND c.kind = $2 ORDER BY c.id DESC",
      [userId, kind]
    );
  },

  async findDm(userA, userB) {
    await ensureSchema();
    const key = Math.min(userA, userB) + ":" + Math.max(userA, userB);
    const rows = await query<ConversationRow>(
      "SELECT id, kind, name, slug FROM conversations WHERE dm_key = $1",
      [key]
    );
    return rows[0] ?? null;
  },

  async createDm(userA, userB) {
    await ensureSchema();
    const key = Math.min(userA, userB) + ":" + Math.max(userA, userB);
    let conversation = await pgStore.findDm(userA, userB);
    if (!conversation) {
      const inserted = await query<ConversationRow>(
        "INSERT INTO conversations (kind, name, dm_key, created_by) VALUES ('dm', 'Direct message', $1, $2) ON CONFLICT (dm_key) DO NOTHING RETURNING id, kind, name, slug",
        [key, userA]
      );
      conversation = inserted[0] ?? (await pgStore.findDm(userA, userB));
    }
    if (!conversation) throw new Error("Could not open that conversation");
    for (const userId of [userA, userB]) {
      await query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [conversation.id, userId]
      );
    }
    return conversation;
  },

  async createGroup(name, memberIds, createdBy) {
    await ensureSchema();
    const rows = await query<ConversationRow>(
      "INSERT INTO conversations (kind, name, created_by) VALUES ('group', $1, $2) RETURNING id, kind, name, slug",
      [name, createdBy]
    );
    const conversation = rows[0];
    const ids = Array.from(new Set([...memberIds, createdBy]));
    for (const userId of ids) {
      await query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [conversation.id, userId]
      );
    }
    return conversation;
  },

  async lastMessageTimes(conversationIds) {
    const map = new Map<number, string>();
    if (conversationIds.length === 0) return map;
    await ensureSchema();
    const rows = await query<{ conversationId: number; lastAt: string }>(
      "SELECT conversation_id AS \"conversationId\", to_char(max(created_at) AT TIME ZONE 'UTC', " +
        STAMP +
        ") AS \"lastAt\" FROM messages WHERE conversation_id = ANY($1::int[]) GROUP BY conversation_id",
      [conversationIds]
    );
    for (const row of rows) map.set(row.conversationId, row.lastAt);
    return map;
  },

  // ---------------------------------------------------------- messages
  async listMessages(conversationId, afterId, limit) {
    await ensureSchema();
    if (afterId > 0) {
      const rows = await query<MessageRow>(
        MESSAGE_SELECT +
          "WHERE m.conversation_id = $1 AND m.id > $2 ORDER BY m.id ASC LIMIT $3",
        [conversationId, afterId, limit]
      );
      return rows.map(toMessage);
    }
    const rows = await query<MessageRow>(
      "SELECT * FROM (" +
        MESSAGE_SELECT +
        "WHERE m.conversation_id = $1 ORDER BY m.id DESC LIMIT $2) recent ORDER BY id ASC",
      [conversationId, limit]
    );
    return rows.map(toMessage);
  },

  async createMessage(conversationId, authorId, body, attachmentId, clientId = null) {
    await ensureSchema();
    const inserted = await query<{ id: number }>(
      "INSERT INTO messages (conversation_id, author_id, body, attachment_id, client_id) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        // A resend of something already stored inserts nothing and falls through
        // to the lookup below, so a lost response cannot double-post.
        "ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING RETURNING id",
      [conversationId, authorId, body, attachmentId, clientId]
    );
    const id = inserted[0]?.id;
    const rows = id
      ? await query<MessageRow>(MESSAGE_SELECT + "WHERE m.id = $1", [id])
      : await query<MessageRow>(MESSAGE_SELECT + "WHERE m.client_id = $1", [clientId]);
    return toMessage(rows[0]);
  },

  // ------------------------------------------------------- attachments
  async createAttachment(uploaderId, filename, contentType, sizeBytes, data, remoteUrl) {
    await ensureSchema();
    const rows = await query<{ id: number }>(
      "INSERT INTO attachments (uploader_id, filename, content_type, size_bytes, data, remote_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [uploaderId, filename, contentType, sizeBytes, data, remoteUrl]
    );
    const id = rows[0].id;
    return {
      id,
      filename,
      contentType,
      sizeBytes,
      url: attachmentUrl(remoteUrl, id),
      isImage: isImageType(contentType),
      remoteUrl,
    } satisfies Attachment;
  },

  async getAttachment(id) {
    await ensureSchema();
    const rows = await query<{
      filename: string;
      contentType: string;
      sizeBytes: number;
      data: Buffer | null;
      remoteUrl: string | null;
    }>(
      "SELECT filename, content_type AS \"contentType\", size_bytes AS \"sizeBytes\", data, remote_url AS \"remoteUrl\" FROM attachments WHERE id = $1",
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      data: row.data
        ? Buffer.isBuffer(row.data)
          ? row.data
          : Buffer.from(row.data as unknown as ArrayBuffer)
        : null,
      remoteUrl: row.remoteUrl ?? null,
    };
  },

  async deleteAttachment(id) {
    await ensureSchema();
    await query("DELETE FROM attachments WHERE id = $1", [id]);
  },
};
