import postgres from "postgres";

/**
 * Read the connection string the way people actually paste it.
 *
 * Supabase's connect snippet is a whole .env line — `DATABASE_URL="postgresql://…"`
 * — and pasting that into a dashboard's *value* box is an easy mistake, since the
 * value box only wants the part after the `=`. Quotes have the same effect: they
 * make postgres.js throw, and because Next imports this module while collecting
 * page data, the build then dies naming an unrelated route.
 */
function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  const cleaned = raw
    .replace(/^export\s+/i, "")
    .replace(/^DATABASE_URL\s*=\s*/i, "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();

  if (!/^postgres(ql)?:\/\//i.test(cleaned)) {
    throw new Error(
      "DATABASE_URL is not a valid Postgres connection string — it should start with " +
        "postgresql://. Give the value on its own, without the DATABASE_URL= prefix or " +
        "surrounding quotes."
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

/**
 * Nothing below the database may hang forever.
 *
 * Serverless hosts suspend instances while their TCP sockets stay open, and a
 * connection pooler will drop a client it considers idle and forget about it.
 * Either way postgres.js can hold a socket that will never answer, and by
 * default it waits on it indefinitely — the request never completes and the
 * browser sits on "Loading…" until someone reloads. Every query therefore runs
 * under a deadline of our own, and connections are retired after a minute so a
 * stale socket cannot be handed out for long.
 *
 * The deadline has to be client-side: Supabase's pooler silently ignores
 * connection-string parameters like statement_timeout, so asking the server to
 * enforce one does nothing.
 */
const QUERY_TIMEOUT_MS = 8000;

const POOL_OPTIONS = {
  // One long-lived connection per serverless instance.
  //
  // Opening a connection through the pooler takes roughly a second from Vercel
  // and occasionally far longer, so every connection we open is a chance to
  // stall. Meanwhile a connection that sits idle for ten seconds gets retired,
  // so a handful of them turn into a steady stream of fresh — slow — ones. One
  // connection, kept warm by the heartbeat, is both quicker and calmer, and
  // postgres.js pipelines the queries of a single request onto it anyway.
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 300,
  keep_alive: 30,
  prepare: false, // required by pooled providers (Neon, Supabase pooler)
  ...sslOptions,
};

function openPool(): postgres.Sql | null {
  return url ? postgres(url, POOL_OPTIONS) : null;
}

let pool = openPool();

/**
 * The pool is replaceable on purpose.
 *
 * postgres.js cannot cancel a single query, so a connection that outstays its
 * deadline stays checked out for the life of the process. Once a few of those
 * pile up, every later request queues behind a slot that will never free, and
 * the app stops answering for good — which is how the site ended up stuck on
 * "Loading" with a reload as the only way out. Dropping the pool costs one
 * reconnect (~250ms) and always recovers.
 */
function recycle(dead: postgres.Sql): void {
  if (pool !== dead) return; // another timeout already swapped it out
  pool = openPool();
  void dead.end({ timeout: 2 }).catch(() => {});
}

class QueryTimeoutError extends Error {
  constructor(label: string) {
    super("Database did not answer within " + QUERY_TIMEOUT_MS + "ms: " + label.slice(0, 80));
    this.name = "QueryTimeoutError";
  }
}

function withDeadline<T>(work: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new QueryTimeoutError(label)), QUERY_TIMEOUT_MS);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Every query goes through here so the Postgres backend reads like plain SQL.
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const active = pool;
  if (!active) throw new Error("DATABASE_URL is not set");
  try {
    const rows = (await withDeadline(
      active.unsafe(text, params as never),
      text
    )) as unknown as T[];
    return rows ?? [];
  } catch (error) {
    // The query we walked away from holds its connection open forever.
    if (error instanceof QueryTimeoutError) recycle(active);
    throw error;
  }
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
  "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
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

// Bump this whenever SCHEMA or MIGRATIONS changes, so existing databases run the
// new statements once and then stop paying for them.
const SCHEMA_VERSION = "1";

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

async function storedSchemaVersion(): Promise<string | null> {
  try {
    const rows = await query<{ value: string }>(
      "SELECT value FROM app_meta WHERE key = 'schema_version'"
    );
    return rows[0]?.value ?? null;
  } catch {
    // No app_meta table yet — this database has never been set up.
    return null;
  }
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

  // The cheap path. A warm database answers with one small SELECT instead of
  // running fifteen lock-taking DDL statements on every cold start — which is
  // both slow and a chance to be frozen half way through.
  if ((await storedSchemaVersion()) === SCHEMA_VERSION) return;

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

  await query(
    "INSERT INTO app_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [SCHEMA_VERSION]
  );
}
