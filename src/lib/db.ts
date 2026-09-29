import postgres from "postgres";

/**
 * Read the connection string defensively. Dashboards hand values over wrapped in
 * quotes — Supabase's own connect snippet shows `DATABASE_URL="postgresql://…"`
 * — and a stray quote makes postgres.js throw, which fails the whole build with a
 * message about whichever route it happened to load first.
 */
function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  const cleaned = raw.replace(/^["']+|["']+$/g, "").trim();
  if (!/^postgres(ql)?:\/\//i.test(cleaned)) {
    throw new Error(
      "DATABASE_URL is not a valid Postgres connection string — it should start with " +
        "postgresql://. Remove any surrounding quotes, spaces or line breaks from the value."
    );
  }
  return cleaned;
}

const url = connectionString();

export const hasDb = Boolean(url);

// Hosted Postgres (Supabase, Neon, …) refuses plaintext connections, and
// postgres.js defaults to ssl:false — so require TLS unless the connection
// string already has its own opinion (e.g. Neon's `?sslmode=require`).
// Add `?sslmode=disable` to the URL for a local database that has no TLS.
const sslOptions: { ssl?: "require" } = url && !/sslmode=/.test(url) ? { ssl: "require" } : {};

export const sql = url
  ? postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // required by pooled providers (Neon, Supabase pooler)
      ...sslOptions,
    })
  : (null as unknown as postgres.Sql);

// Every query goes through here so the Postgres backend reads like plain SQL.
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!sql) throw new Error("DATABASE_URL is not set");
  const rows = (await sql.unsafe(text, params as never)) as unknown as T[];
  return rows ?? [];
}

// One shared room: the "everyone" chat. Add more here if you want extra rooms.
export const DEFAULT_CHANNELS = ["general"];

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, avatar_attachment_id INTEGER, status TEXT NOT NULL DEFAULT 'active', is_admin BOOLEAN NOT NULL DEFAULT false, approved BOOLEAN NOT NULL DEFAULT false, last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS conversations (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, slug TEXT, dm_key TEXT UNIQUE, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS conversation_members (conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (conversation_id, user_id))",
  "CREATE TABLE IF NOT EXISTS attachments (id SERIAL PRIMARY KEY, uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, data BYTEA, remote_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, author_id INTEGER REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL DEFAULT '', attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, id)",
  "CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members (user_id)",
  "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)",
  "CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users (last_seen_at)",
];

// Columns added after the first release. `approved` is the interesting one: it
// is added with DEFAULT true so everyone who signed up before approval existed
// keeps access, and only then does the default flip so new accounts start
// pending.
const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT true",
  "ALTER TABLE users ALTER COLUMN approved SET DEFAULT false",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_attachment_id INTEGER",
];

let schemaPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = runSchema().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [table, column]
  );
  return Boolean(rows[0]?.n);
}

async function runSchema(): Promise<void> {
  if (!hasDb) return;

  // The first beta used messages.channel_id. If that table is still around,
  // park it under a new name instead of destroying the rows.
  const table = await query<{ reg: string | null }>(
    "SELECT to_regclass('public.messages')::text AS reg"
  );
  if (table[0]?.reg) {
    if (!(await columnExists("messages", "conversation_id"))) {
      await query("ALTER TABLE messages RENAME TO messages_legacy_v1");
    }
  }

  // Accounts used to log in with a 4-digit PIN; they use passwords now.
  if ((await columnExists("users", "pin_hash")) && !(await columnExists("users", "password_hash"))) {
    await query("ALTER TABLE users RENAME COLUMN pin_hash TO password_hash");
  }

  for (const statement of SCHEMA) await query(statement);
  for (const statement of MIGRATIONS) await query(statement);

  for (const name of DEFAULT_CHANNELS) {
    await query(
      "INSERT INTO conversations (kind, name, slug) SELECT 'channel', $1, $1 WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE kind = 'channel' AND slug = $1)",
      [name]
    );
  }
}
