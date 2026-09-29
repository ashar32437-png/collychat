import { hashPassword, verifyPassword } from "./auth";
import { store } from "./store";

// The owner account. It exists on every fresh install (and gets repaired if
// someone renamed it), so there is always one admin who can approve people.
export const ADMIN_USERNAME = "adosva";
export const ADMIN_PASSWORD = "qwasqwas";
export const ADMIN_DISPLAY_NAME = "adosva";

let bootstrapped: Promise<void> | null = null;

export function ensureBootstrap(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = seedAdmin().catch((err) => {
      // Never wedge the auth routes on a seeding failure — the real error will
      // surface again on the next store call if the database is unreachable.
      console.error("admin bootstrap failed", err);
    });
  }
  return bootstrapped;
}

async function seedAdmin(): Promise<void> {
  const existing = await store.findCredentials(ADMIN_USERNAME);
  if (!existing) {
    await store.createUser({
      username: ADMIN_USERNAME,
      displayName: ADMIN_DISPLAY_NAME,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      isAdmin: true,
      approved: true,
    });
    return;
  }

  if (!(await verifyPassword(ADMIN_PASSWORD, existing.passwordHash))) {
    await store.setPassword(existing.id, await hashPassword(ADMIN_PASSWORD));
  }
  if (!existing.isAdmin || !existing.approved) {
    await store.setUserFlags(existing.id, { isAdmin: true, approved: true });
  }
}
