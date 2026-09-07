import { DatabaseError } from "pg";

import type UserDatabase from "./database";
import HttpError from "./errors";

type PublicUser = {
  id: number;
  username: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
};

type NewUser = {
  username: string;
  email: string;
  passwordHash: string;
};

type UserWriter = {
  create(user: NewUser): Promise<PublicUser>;
};

type UserRow = Omit<PublicUser, "created_at"> & { created_at: Date };

type LoginUser = Pick<PublicUser, "id" | "role"> & { passwordHash: string };

type UserReader = {
  findByEmail(email: string): Promise<LoginUser | null>;
  findById(id: number): Promise<PublicUser | null>;
};

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    created_at: row.created_at.toISOString(),
  };
}

class UserRepository implements UserWriter, UserReader {
  constructor(private readonly database: Pick<UserDatabase, "query">) {}

  async findByEmail(email: string): Promise<LoginUser | null> {
    const result = await this.database.query<{
      id: number;
      role: PublicUser["role"];
      password_hash: string;
    }>(
      "SELECT id, role, password_hash FROM users WHERE email = $1",
      [email]
    );
    const row = result.rows[0];
    return row ? { id: row.id, role: row.role, passwordHash: row.password_hash } : null;
  }

  async findById(id: number): Promise<PublicUser | null> {
    const result = await this.database.query<UserRow>(
      "SELECT id, username, email, role, created_at FROM users WHERE id = $1",
      [id]
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : null;
  }

  async create(user: NewUser): Promise<PublicUser> {
    try {
      const result = await this.database.query<UserRow>(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, role, created_at`,
        [user.username, user.email, user.passwordHash]
      );
      const row = result.rows[0];

      if (!row) {
        throw new Error("Created user could not be loaded.");
      }

      return toPublicUser(row);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "23505") {
        throw new HttpError(409, "Username or email already exists.");
      }

      throw error;
    }
  }
}

export { type LoginUser, type NewUser, type PublicUser, type UserReader, type UserWriter };
export default UserRepository;
