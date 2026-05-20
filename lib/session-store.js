/**
 * Server-side in-memory session store.
 * Acumatica cookies have Path=/ERP/ so the browser never sends them to /api/*.
 * We store the real cookies here keyed by a UUID. The browser only holds the UUID.
 */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Survive HMR in dev by attaching to globalThis
const store = globalThis.__acu_session_store__ ?? (globalThis.__acu_session_store__ = new Map());

export function setSession(sessionId, cookies) {
    store.set(sessionId, { cookies, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function getSession(sessionId) {
    if (!sessionId) return null;
    const entry = store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(sessionId); return null; }
    return entry.cookies.map(c => c.split(";")[0]).join("; ");
}

export function deleteSession(sessionId) {
    store.delete(sessionId);
}
