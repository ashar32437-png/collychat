# 💬 Chatter

A tiny chat app for a small circle (≤ 30 people). DMs and group chats live in one list, and
the left rail holds the tools: a hub of your everyday links, a calculator, a stopwatch/timer,
sticky notes and Google.

Built with **Next.js 15 + React 19 + Tailwind CSS 4 + Postgres**, deploys to **Vercel**.

## What's in it

**Chat**

- **One shared room** — `#general` is the "everyone" room. No servers, no channels to manage,
  no owners: anybody approved can talk there.
- **DMs and group chats in a single list** — one bar, sorted by who you talked to last.
  Everyone online shows up in the list, and a chat you have used before stays there even after
  that person goes offline.
- **Accounts with a username + password** — usernames are 3–20 characters, passwords at least
  5. Log out, come back, and every conversation is exactly where you left it.
- **Approval** — new accounts can sign up, but they see a "waiting for approval" screen until
  an admin lets them in.
- **Profiles** — change your display name, upload a profile picture, and switch between
  **Active** and **DND** whenever you like. Status shows up as a green or amber dot for
  everyone else.
- **Composer `+` menu** — emoji, file uploads (≤ 5 MB, pictures resized in the browser
  before they are sent) and a GIPHY GIF picker with trending, search and one-click send.

**Tools** (the icons under Messages on the left rail)

- **Hub 🔗** — one click to OneNote, Outlook, Teams, Student Hub, LEARN, LEaP, Units, Google,
  Neal.fun and Openguessr. Edit the list in `src/components/tools/LinksTool.tsx`.
- **Calculator** — a real evaluator: parentheses, powers, percent, unary minus, scientific
  notation, functions (`sqrt`, `ln`, `log`, `sin`, `cos`, `tan`, `abs`, `exp`, `round`,
  `floor`, `ceil`), live result preview, keyboard input and clickable history.
- **Timer & stopwatch** — lap times, a countdown with an audible alert, +1/+5 min top-ups.
  Tools stay mounted, so a running timer keeps ticking while you chat.
- **Sticky notes** — drag notes around the board, click one and the screen dims and blurs
  behind a big editor. Notes take text and images; **images always render on a layer above
  the text** and can be dragged and resized inside the note. Saved in your browser.
- **AI** — Google embedded for real (`google.com/webhp?igu=1`, complete with Google's own
  AI Mode chip in the search box), plus a separate Gemini tab. Gemini refuses to be framed, so
  that tab shows a card with a one-click "open in a real tab" fallback.
- **Admin** — only admins see this icon. It lists every account, newest waiters first, with an
  Approve/Revoke button.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign up. Without `DATABASE_URL` the app runs in **demo mode**:
accounts, messages and uploads live in memory and reset when the server restarts.

The owner account is created automatically on first boot:

```
username: adosva
password: qwasqwas
```

Log in with it to approve everybody else. **Change that password** before you share the app —
see [Security notes](#security-notes-read-this).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | recommended | Postgres connection string — free [Neon](https://neon.tech), or Supabase's **transaction pooler** (port `6543`). Without it, accounts and messages live in memory and reset on restart. |
| `GIPHY_API_KEY` | for GIFs | Free key from [developers.giphy.com](https://developers.giphy.com/dashboard/). Without it, the GIF picker explains how to add one. |
| `SUPABASE_URL` | for images | Supabase project URL (`https://<ref>.supabase.co`). Without it, uploads fall back to storing bytes in Postgres. |
| `SUPABASE_SERVICE_KEY` | for images | Supabase **secret** key — server-side only, never sent to the browser. |
| `SUPABASE_BUCKET` | optional | Bucket name, defaults to `chat-uploads`. |

Use the **pooled** connection string, not the direct one: Neon's host contains `-pooler`, and
Supabase's transaction pooler runs on port `6543`. TLS is turned on automatically for hosts that
need it (`db.ts` requires SSL unless the URL says otherwise); `?sslmode=disable` is only for a
local database without SSL.

There is no ORM: the app talks to Postgres through `postgres.js` (see `src/lib/db.ts`). Supabase's
dashboard offers a Prisma setup guide — ignore it, along with its `?pgbouncer=true` flag, which is
a Prisma-ism the app does not need.

### Keeping uploads small

Storage is the thing that runs out first, so three things keep it in check:

- **Pictures are resized in the browser** before they ever leave the device — longest edge
  1600 px for chat images, 256 px for avatars, encoded as WebP. A 6 MB photo usually arrives
  as a few hundred KB.
- **Hard cap of 5 MB** per upload (checked on the client and again on the server).
- **Nothing is duplicated.** An upload is one object in storage, and Postgres stores only the
  URL. Replacing your profile picture deletes the picture it replaced.

Messages' body text and GIF URLs cost almost nothing — a GIF is stored as its GIPHY address,
not as a file. The two files are `src/lib/image-resize.ts` (browser) and `src/lib/storage.ts`
(Supabase).

## Where things are stored

| Thing | Where |
| --- | --- |
| Accounts, sessions, conversations, messages | Postgres (`DATABASE_URL`) |
| Uploaded files and profile pictures | Supabase Storage (`SUPABASE_URL`), with the URL in the `attachments` table. Without storage configured the bytes fall back into `attachments.data`. |
| GIFs you send | Not stored at all — the message keeps the GIPHY URL |
| Sticky notes | Your browser's localStorage (images are uploaded once, then referenced) |
| Stopwatch/timer state | In memory, per session — a reload resets them |

Tables are created and updated automatically on first request; there are no migrations to run.
Older databases are handled in place: a first-beta `messages.channel_id` table is renamed to
`messages_legacy_v1`, `users.pin_hash` is renamed to `password_hash`, and accounts that existed
before approval did are marked approved.

## API surface

| Route | What it does |
| --- | --- |
| `POST /api/auth/register` | Create an account (starts unapproved) |
| `POST /api/auth/login` / `logout` | Session cookie in / out |
| `GET /api/auth/me` | Who am I (+ whether demo mode is on) |
| `PATCH /api/users/me` | Display name and Active/DND status |
| `POST /api/users/me/avatar` | Upload a profile picture (images only, ≤ 5 MB, resized to 256 px) |
| `POST /api/sync` | One poll: presence + sidebar + messages |
| `POST /api/conversations` | Create a DM or group chat |
| `POST /api/conversations/[id]/messages` | Send text / attachment / GIF |
| `GET`+`POST /api/admin/users` | List accounts and approve or revoke them (admins only) |
| `POST /api/attachments` · `GET /api/attachments/[id]` | Upload and serve files (redirects to object storage when there is one) |
| `GET /api/giphy` | GIF search + trending proxy (keeps the key server-side) |

## Security notes (read this)

- Passwords are stored as **scrypt** hashes, sessions are httpOnly cookies, and logins are
  throttled (10 tries / 10 minutes per username).
- **Change the built-in admin password.** Edit `ADMIN_PASSWORD` in `src/lib/bootstrap.ts`
  (and `ADMIN_USERNAME` if you want) and restart — the owner account is re-synced on boot.
- Anyone who knows a username + password can read that account's messages, and unapproved
  accounts can do nothing except wait.
- DMs and group chats are readable only by their members; the shared room is public to
  everyone on your deployment.
- Uploads are capped at 5 MB and served with `X-Content-Type-Options: nosniff`; only plain
  images render inline, everything else downloads. SVG/HTML are never served inline.
- Nobody can reset a forgotten password yet. The admin panel can only approve or revoke.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for the GitHub → Vercel → Neon → Dynadot checklist.

## Project structure

```
src/
├── app/
│   ├── page.tsx                                  # Renders the app
│   ├── layout.tsx                                # Inter font, metadata
│   ├── globals.css                               # Design tokens + utilities
│   └── api/
│       ├── auth/{register,login,logout,me}       # Username + password accounts, sessions
│       ├── users/me/{route,avatar}               # Profile: name, status, picture
│       ├── admin/users/route.ts                  # Approve / revoke (admins only)
│       ├── sync/route.ts                         # One poll: presence + sidebar + messages
│       ├── conversations/route.ts                # Create DMs and group chats
│       ├── conversations/[id]/messages/route.ts  # Send a message (text/attachment/GIF)
│       ├── attachments/{route,[id]}              # Upload and serve files
│       └── giphy/route.ts                        # GIF search + trending proxy
├── components/
│   ├── App.tsx           # Auth + approval gates, sync loop, layout, tool panes
│   ├── Rail.tsx          # Messages toggle + tool icons + account menu
│   ├── Sidebar.tsx       # The room and the unified DM/group list
│   ├── MessageList.tsx   # Messages, grouping, date separators, attachments
│   ├── Composer.tsx      # Composer with the + menu (emoji, upload, GIF)
│   ├── GroupDialog.tsx   # New DM / group chat
│   ├── ProfileDialog.tsx # Display name, picture, Active/DND
│   ├── AuthPanel.tsx     # The landing page ("Just a messaging app.")
│   ├── PendingPanel.tsx  # "Waiting for approval" screen
│   ├── avatar.tsx        # Avatars, initials, status dots, byte formatting
│   └── tools/
│       ├── LinksTool.tsx  Calculator.tsx  TimerTool.tsx  NotesTool.tsx
│       ├── AiTool.tsx     AdminTool.tsx
│       └── meta.tsx       # Tool labels, order and icons
└── lib/
    ├── db.ts            # Postgres client, query helper, schema + migrations
    ├── pg-store.ts      # SQL implementation of the store API
    ├── memory-store.ts  # In-memory demo backend
    ├── store.ts         # Picks Postgres or memory
    ├── auth.ts          # Password hashing, sessions, validation, throttling
    ├── bootstrap.ts     # Creates/re-syncs the owner account
    ├── guard.ts         # Shared "signed in" / "admin only" gates
    ├── storage.ts       # Supabase Storage over fetch (upload, delete, public URL)
    ├── uploads.ts       # One upload path: storage when configured, bytes otherwise
    ├── image-resize.ts  # Browser-side downscale + WebP re-encode before upload
    ├── calc.ts          # Calculator expression evaluator
    ├── notes.ts         # Sticky note types + localStorage helpers
    ├── sidebar.ts       # Merges DMs and groups into one sorted list
    └── types.ts         # Shared types + constants
```
