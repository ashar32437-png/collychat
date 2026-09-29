# 🚀 From code to your own domain — complete checklist

Everything between "the app is built" and "your friends are chatting at
`https://chat.yourdomain.com`". Steps marked *(optional)* can be skipped.

---

## 1. Put the code on GitHub

Vercel deploys from a Git repo and redeploys automatically on every push.

```bash
git init
git add -A
git commit -m "Initial Chatter app"
```

Then on **github.com → New repository** (name it e.g. `chatter`, private is fine):

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/chatter.git
git push -u origin main
```

## 2. Create a free Postgres database

Accounts, messages and DMs all live here. Either provider is fine:

- **Supabase** — simplest if you are following step 4 anyway, because the database and the image
  storage come from the same project. **Connect** button → **Transaction pooler** (port 6543).
  Detailed, click-by-click instructions are in step 4. The rest of this section still applies.
- **Neon** — a database only, and the walkthrough below.

Whichever you pick, uploaded pictures do **not** count against the database once Supabase Storage
is on (step 4) — they are stored as files and only their URLs are in Postgres.

1. Sign up at **neon.tech** (GitHub login works).
2. Create a project (e.g. `chatter`), region close to your users.
3. Open **Dashboard → Connection Details** and:
   - enable **Pooled connection** (important for serverless),
   - copy the connection string, which looks like:
     ```
     postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
     ```
4. Keep it for step 3. Tables are created and seeded automatically on first request —
   there is no migration to run.

## 3. Deploy to Vercel

1. **vercel.com → Add New… → Project**, import your `chatter` repo.
2. Vercel auto-detects Next.js — leave the build settings alone.
3. Open **Environment Variables** and add:
   - `DATABASE_URL` = the Neon **pooled** string from step 2 (Production + Preview + Development)
   - `GIPHY_API_KEY` = *(optional, see step 4)*
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` = *(optional, see step 4)*
4. **Deploy**. A minute later you have `https://chatter-<random>.vercel.app`.
5. Open it and log in as the built-in owner — **adosva / qwasqwas** — then change that
   password before anyone else signs up (see step 8).
6. Sign up a second account in another browser to test the approval flow, approve it from
   the **Admin** tool in the rail, post a message, then **hard-refresh**
   (Ctrl/Cmd+Shift+R). If your account and messages come back, the database is wired up. 🎉

> Without `DATABASE_URL` the site still works, but in demo mode: accounts, messages and
> uploads live in server memory and vanish on every redeploy or cold start.

## 4. Supabase (database + images) and GIPHY

### GIFs — GIPHY

The GIF picker needs a free key:

1. Sign in at **developers.giphy.com/dashboard** and create an app (choose **API**, not SDK).
2. Copy the **API key**.
3. Vercel → **Settings → Environment Variables** → add `GIPHY_API_KEY` → **Redeploy**.

Until you do this, the GIF panel shows setup instructions instead of results, and the rest
of the app is unaffected. The key stays server-side; the browser only talks to `/api/giphy`.

### The database — where accounts and messages actually live

**This is the part that makes your accounts and messages stop vanishing.** Without it the app
runs in demo mode: everything lives in the server's memory and is wiped on every restart or
redeploy. Supabase gives you a Postgres database on the same free project as the storage, so it
is one signup and two values.

1. In the Supabase dashboard, click the **Connect** button near the top of the page.
2. Choose **Transaction pooler** on port `6543` (it is the right one for a serverless host, and
   this app already sets `prepare: false` for it).
3. Copy the URI. It looks like:

   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the database password you chose when creating the project.
   Forgotten it? **Project Settings → Database → Reset database password** — update `.env.local`
   afterwards, since the old one stops working.
5. Paste the finished string as `DATABASE_URL` (locally in `.env.local`, and on Vercel).

Tables are created on first request — you do not need the SQL editor, migrations or seed data.

> **Ignore Supabase's “Install ORM” / Prisma instructions.** Those appear in the dashboard's
> connect dialog, but this app does not use an ORM — it talks to Postgres directly with
> `postgres.js` (see `src/lib/db.ts`). Installing Prisma would add a dependency, a
> `prisma/schema.prisma` and a `DIRECT_URL` that nothing reads. The only thing needed from that
> dialog is the connection string itself. TLS is handled for you: `db.ts` requires SSL unless the
> URL says otherwise, and the connection uses the transaction pooler's `prepare: false` mode.

> The connection string contains your database password. `.env.local` is git-ignored (`\.env*`),
> so it never reaches GitHub — keep it that way and only ever put these values in Vercel's
> environment-variable UI.

### Pictures — Supabase Storage

With `SUPABASE_URL` set, every uploaded picture is stored in object storage and Postgres only
keeps the object URL — which is what stops the database filling up. Images are also resized in
the browser before they are sent (capped at 1600 px, converted to WebP), so a 6 MB phone photo
usually arrives as a few hundred KB.

#### Where to find the two values (the confusing part)

There is nothing to install and nothing to click on the API-keys page. You need exactly two
strings, and they live in two different places.

**1. `SUPABASE_URL` — the project URL.** The easiest way, no menu hunting: look at your browser's
address bar while the Supabase dashboard is open. It reads

```
supabase.com/dashboard/project/abcdefghijklmnop
                        └──────┬───────┘
                          this is the project ref
```

Your project URL is just that ref in front of `.supabase.co`:

```
https://abcdefghijklmnop.supabase.co
```

*(Menu route if you prefer: the gear icon at the bottom of the left sidebar → **Data API** → the
**Project URL** field. Older dashboards call it **Project Settings → API**.)*

**2. `SUPABASE_SERVICE_KEY` — the secret key.** You already have this one: on
**Project Settings → API Keys**, under **Secret keys**, copy the `sb_secret_…` value. Use the copy
button, not the masked dots.

> **You never need the “Publishable key.”** That one is for apps that talk to Supabase from the
> browser. This app never does — the browser only talks to our own `/api` routes, and those hold
> the secret on the server. Ignore the publishable key completely.

3. Vercel → **Settings → Environment Variables** → add:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_SERVICE_KEY` = the secret key
   - `SUPABASE_BUCKET` = `chat-uploads` *(optional, this is the default)*
4. **Redeploy.** The bucket is created, public, automatically on the first upload — no SQL,
   no dashboard work. If you would rather make it yourself: **Storage → New bucket**, name it
   `chat-uploads` (or whatever `SUPABASE_BUCKET` says) and tick **Public bucket**.

> Leave `SUPABASE_URL` empty and the app falls back to storing file bytes in Postgres, which
> works but eats the database — that is the mode the app used before storage was wired up.

Public buckets mean anyone with an object URL can view that picture, so object names are
random (`avatars/<user>-<uuid>.webp`). If you would rather keep the bucket private, that is a
code change in `src/lib/storage.ts` — signed URLs instead of permanent public ones.

## 5. Buy the domain on Dynadot

1. **dynadot.com** → search for your name (`.com` is ~$11/yr).
2. Create an account and check out. WHOIS privacy is free — keep it on.
3. *(Recommended)* enable **auto-renew** so the domain doesn't lapse next year.

## 6. Connect the domain to Vercel

**In Vercel** (Project → Settings → Domains):
1. Add `yourdomain.com`, then add `www.yourdomain.com` and let Vercel redirect one to the other.
2. Vercel shows the DNS records it needs — usually:
   - `A` record, name `@`, value `76.76.21.21`
   - `CNAME`, name `www`, value `cname.vercel-dns.com`
   *(Always copy what Vercel currently displays — values can change.)*

**In Dynadot** (My Account → Domains → **Manage** → **DNS settings**):
1. Choose **Dynadot DNS**, not parked.
2. Add the `A` and `CNAME` records above; delete any pre-filled parking records.
3. Save, then wait for Vercel to flip the domain to ✅ (minutes to a few hours).
   HTTPS is issued automatically — nothing to buy.

Simplest alternative: set Dynadot **Nameservers** to `ns1.vercel-dns.com` /
`ns2.vercel-dns.com` and let Vercel manage all records.

## 7. Final checks

- [ ] `https://yourdomain.com` loads with a padlock
- [ ] `www` redirects to the apex (or vice-versa)
- [ ] Signing up shows **Waiting for approval**, and the account can't sync until approved
- [ ] The admin sees the **Admin** icon in the rail; a normal account does not
- [ ] Approve that account → it drops straight into the app on its own within ~5 s
- [ ] Send a DM, refresh, log out and back in with the username + password → the DM is still there
- [ ] Create a group chat with both accounts → both see it in the same list
- [ ] Change a display name, upload a profile picture, switch to **DND** → the other account
      shows the amber dot within ~5 s
- [ ] Upload an image → it renders inline; upload a PDF → it downloads
- [ ] Post in the shared room → the other account sees it within ~3 s
- [ ] Open the tools: hub links, calculator, timer, sticky notes (images float above the text),
      AI Google/Gemini tab

## 8. Change the admin password

The owner account (`adosva`) is created automatically on first boot. To change its password,
open `src/lib/bootstrap.ts` and edit the constants:

```ts
ADMIN_USERNAME = "adosva";
ADMIN_PASSWORD = "qwasqwas";   // ← change this
```

Commit and push (or set them as Vercel env vars and read them in that file). On the next
boot the owner account is re-synced to whatever those constants say, so this is also how you
recover the admin account if you lose it.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Accounts/messages vanish after a while | `DATABASE_URL` is not set in Vercel (demo mode). Add it, redeploy. |
| DB timeouts in the Vercel logs | You used Neon's **direct** string. Use the pooled (`-pooler`) one. |
| GIF picker shows setup text | `GIPHY_API_KEY` is missing or invalid — see step 4, then redeploy. |
| Every picture is a blue/grey box | `SUPABASE_URL` (and the secret key) are missing, so uploads land in the database and are wiped by redeploys. See step 4. If storage is on, check the bucket is **public**. |
| "That username is taken" when registering | Usernames are unique (case-insensitive). Log in instead, or pick another one. |
| A new account sees "Waiting for approval" | Working as intended — approve it from the **Admin** tool. |
| The Admin icon is missing | That account isn't an admin. Only `ADMIN_USERNAME` gets it (see step 8). |
| Locked out of the owner account | Set `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `src/lib/bootstrap.ts` and redeploy; the next boot re-syncs it. |
| Someone forgot their password | There is no reset flow. They can sign up again with a new username, or you can delete the row from `users` in Neon's SQL editor (their messages stay, shown as "Deleted user"). |
| Upload rejected | Uploads are capped at 5 MB, and Vercel refuses request bodies over 4.5 MB. Pictures are resized in the browser first, so this only bites for very large non-image files. |
| Domain stuck "Pending" | DNS records don't match exactly; re-check name/value in Dynadot and remove parking records. |

## Scaling & costs

| Thing | Cost / limit |
| --- | --- |
| Vercel Hobby | Free (data transfer 100 GB/mo) |
| Neon free tier | Free (0.5 GB storage — uploads count) |
| Domain (Dynadot) | ~$11/yr for `.com` |

The app is sized for **≤ 30 people**: one `/api/sync` poll per person every 2.5 s
(≈ 12 requests/second at 30 users), with presence writes throttled to once per user
per 10 s. That comfortably fits the free tiers.

### If you grow

- **Bigger files**: swap attachments to [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
  (or S3/R2) and keep only the URL in Postgres — the free Postgres tier fills up fast
  with images.
- **Real-time**: replace polling with Server-Sent Events or a hosted websocket service.
- **Stronger auth**: passwords are hashed with scrypt and there is no reset flow, but there is
  also no email verification or 2FA. Magic-link email or OAuth (Clerk, Auth.js) would fix that.
- **Moderation**: admins can approve or revoke accounts, but there is no delete/edit of
  messages and no profanity filter. Approved accounts can post in the shared room and in any
  DM or group they are part of.
- **Profile pictures** live in the same `attachments` table, so they count against your
  Postgres storage just like chat uploads.
- **Extra rooms**: the app ships with one shared room (`general`). Add slugs to
  `DEFAULT_CHANNELS` in `src/lib/db.ts` if you want a few more.
