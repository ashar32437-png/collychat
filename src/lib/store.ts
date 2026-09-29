import { hasDb } from "./db";
import { memoryStore } from "./memory-store";
import { pgStore } from "./pg-store";
import type { StoreApi } from "./types";

// One API, two backends: Postgres when DATABASE_URL is set, otherwise the
// in-memory demo store (great for trying things out, resets on restart).
const backend = (): StoreApi => (hasDb ? pgStore : memoryStore);

export const store: StoreApi = {
  createUser: (...a) => backend().createUser(...a),
  findCredentials: (...a) => backend().findCredentials(...a),
  getUser: (...a) => backend().getUser(...a),
  listUsers: (...a) => backend().listUsers(...a),
  updateUser: (...a) => backend().updateUser(...a),
  setUserFlags: (...a) => backend().setUserFlags(...a),
  setPassword: (...a) => backend().setPassword(...a),
  touchPresence: (...a) => backend().touchPresence(...a),
  listActiveUsers: (...a) => backend().listActiveUsers(...a),

  createSession: (...a) => backend().createSession(...a),
  getSessionUser: (...a) => backend().getSessionUser(...a),
  deleteSession: (...a) => backend().deleteSession(...a),

  listChannels: (...a) => backend().listChannels(...a),
  getConversation: (...a) => backend().getConversation(...a),
  isMember: (...a) => backend().isMember(...a),
  listMembers: (...a) => backend().listMembers(...a),
  listMyConversations: (...a) => backend().listMyConversations(...a),
  findDm: (...a) => backend().findDm(...a),
  createDm: (...a) => backend().createDm(...a),
  createGroup: (...a) => backend().createGroup(...a),
  lastMessageTimes: (...a) => backend().lastMessageTimes(...a),

  listMessages: (...a) => backend().listMessages(...a),
  createMessage: (...a) => backend().createMessage(...a),

  createAttachment: (...a) => backend().createAttachment(...a),
  getAttachment: (...a) => backend().getAttachment(...a),
  deleteAttachment: (...a) => backend().deleteAttachment(...a),
};

export const isDemoMode = () => !hasDb;
