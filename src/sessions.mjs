import { randomUUID } from "node:crypto";

// In-memory session store. Sessions expire after ttlMs and the store has a hard cap.
export class SessionStore {
  constructor({ ttlMs = 4 * 60 * 60 * 1000, maxSessions = 100, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.now = now;
    this.sessions = new Map();
  }

  // Returns the new session, or null if the store is full.
  create(fields) {
    this.#sweep();
    if (this.sessions.size >= this.maxSessions) return null;
    const session = { id: randomUUID(), ...fields, createdAt: this.now() };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (this.now() - session.createdAt > this.ttlMs) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  delete(id) {
    return this.sessions.delete(id);
  }

  #sweep() {
    for (const id of [...this.sessions.keys()]) this.get(id);
  }
}
