import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from "next-auth/adapters";

import { createId, database, now } from "@/lib/database";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  email_verified: string | null;
  image: string | null;
};

type SessionRow = {
  session_token: string;
  user_id: string;
  expires: string;
};

function nullable(value: string | number | null | undefined) {
  return value === undefined ? null : value;
}

function toUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified ? new Date(row.email_verified) : null,
    image: row.image
  };
}

function toSession(row: SessionRow): AdapterSession {
  return {
    sessionToken: row.session_token,
    userId: row.user_id,
    expires: new Date(row.expires)
  };
}

function findUser(sql: string, ...params: Array<string>) {
  const row = database.prepare(sql).get(...params) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export const sqliteAdapter: Adapter = {
  createUser(user: Omit<AdapterUser, "id">) {
    const id = createId();
    const timestamp = now();
    database
      .prepare(`
        INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        nullable(user.name),
        user.email,
        user.emailVerified?.toISOString() ?? null,
        nullable(user.image),
        timestamp,
        timestamp
      );

    return toUser({
      id,
      name: user.name ?? null,
      email: user.email,
      email_verified: user.emailVerified?.toISOString() ?? null,
      image: user.image ?? null
    });
  },
  getUser(id) {
    return findUser(
      "SELECT id, name, email, email_verified, image FROM users WHERE id = ?",
      id
    );
  },
  getUserByEmail(email) {
    return findUser(
      "SELECT id, name, email, email_verified, image FROM users WHERE email = ?",
      email
    );
  },
  getUserByAccount({ provider, providerAccountId }) {
    return findUser(
      `SELECT u.id, u.name, u.email, u.email_verified, u.image
       FROM users u
       INNER JOIN accounts a ON a.user_id = u.id
       WHERE a.provider = ? AND a.provider_account_id = ?`,
      provider,
      providerAccountId
    );
  },
  updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
    const record = findUser(
      "SELECT id, name, email, email_verified, image FROM users WHERE id = ?",
      user.id
    );

    if (!record) {
      throw new Error("User not found");
    }

    const updated = { ...record, ...user };
    database
      .prepare(`
        UPDATE users
        SET name = ?, email = ?, email_verified = ?, image = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        nullable(updated.name),
        updated.email,
        updated.emailVerified?.toISOString() ?? null,
        nullable(updated.image),
        now(),
        user.id
      );

    return updated;
  },
  deleteUser(userId) {
    const user = findUser(
      "SELECT id, name, email, email_verified, image FROM users WHERE id = ?",
      userId
    );
    database.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return user;
  },
  linkAccount(account: AdapterAccount) {
    database
      .prepare(`
        INSERT INTO accounts (
          id, user_id, type, provider, provider_account_id, refresh_token,
          access_token, expires_at, token_type, scope, id_token, session_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        createId(),
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        nullable(account.refresh_token),
        nullable(account.access_token),
        nullable(account.expires_at),
        nullable(account.token_type),
        nullable(account.scope),
        nullable(account.id_token),
        nullable(account.session_state)
      );

    return account;
  },
  unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
    database
      .prepare("DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?")
      .run(provider, providerAccountId);
  },
  createSession(session) {
    database
      .prepare("INSERT INTO sessions (id, session_token, user_id, expires) VALUES (?, ?, ?, ?)")
      .run(createId(), session.sessionToken, session.userId, session.expires.toISOString());
    return session;
  },
  getSessionAndUser(sessionToken) {
    const session = database
      .prepare("SELECT session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(sessionToken) as SessionRow | undefined;

    if (!session) {
      return null;
    }

    const user = findUser(
      "SELECT id, name, email, email_verified, image FROM users WHERE id = ?",
      session.user_id
    );

    return user ? { session: toSession(session), user } : null;
  },
  updateSession(session) {
    const existing = database
      .prepare("SELECT session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(session.sessionToken) as SessionRow | undefined;

    if (!existing) {
      return null;
    }

    const updated = {
      sessionToken: session.sessionToken,
      userId: session.userId ?? existing.user_id,
      expires: session.expires ?? new Date(existing.expires)
    };

    database
      .prepare("UPDATE sessions SET user_id = ?, expires = ? WHERE session_token = ?")
      .run(updated.userId, updated.expires.toISOString(), updated.sessionToken);
    return updated;
  },
  deleteSession(sessionToken) {
    const existing = database
      .prepare("SELECT session_token, user_id, expires FROM sessions WHERE session_token = ?")
      .get(sessionToken) as SessionRow | undefined;

    database.prepare("DELETE FROM sessions WHERE session_token = ?").run(sessionToken);
    return existing ? toSession(existing) : null;
  },
  createVerificationToken(token) {
    database
      .prepare("INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)")
      .run(token.identifier, token.token, token.expires.toISOString());
    return token;
  },
  useVerificationToken({ identifier, token }) {
    const row = database
      .prepare("SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ?")
      .get(identifier, token) as { identifier: string; token: string; expires: string } | undefined;

    if (!row) {
      return null;
    }

    database
      .prepare("DELETE FROM verification_tokens WHERE identifier = ? AND token = ?")
      .run(identifier, token);

    return {
      identifier: row.identifier,
      token: row.token,
      expires: new Date(row.expires)
    } satisfies VerificationToken;
  }
};
