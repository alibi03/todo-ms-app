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

class UserRepository implements UserWriter {
  constructor(private readonly database: Pick<UserDatabase, "query">) {}

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

      return {
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role,
        created_at: row.created_at.toISOString(),
      };
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "23505") {
        throw new HttpError(409, "Username or email already exists.");
      }

      throw error;
    }
  }
}

export { type NewUser, type PublicUser, type UserWriter };
export default UserRepository;
