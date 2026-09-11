import { DatabaseError } from "pg";

import type UserDatabase from "../database/UserDatabase";
import { ConflictError } from "../errors/ConflictError";
import { PersistenceError } from "../errors/PersistenceError";
import UserMapper from "../mappers/UserMapper";
import { type UserCredentialsRecord } from "../models/database/UserCredentialsRecord";
import { type UserRecord } from "../models/database/UserRecord";
import type User from "../models/domain/User";
import type UserCredentials from "../models/domain/UserCredentials";
import type { CreateUserModel } from "../models/domain/CreateUserModel";
import type { IUserRepository } from "../interfaces/repositories/IUserRepository";

class UserRepository implements IUserRepository {
  constructor(private readonly database: Pick<UserDatabase, "query">) {}

  async findByEmail(email: string): Promise<UserCredentials | null> {
    const result = await this.database.query<UserCredentialsRecord>(
      "SELECT id, role, password_hash FROM users WHERE email = $1",
      [email]
    );
    const row = result.rows[0];
    return row ? UserMapper.credentialsFromDatabase(row) : null;
  }

  async findById(id: number): Promise<User | null> {
    const result = await this.database.query<UserRecord>(
      "SELECT id, username, email, role, created_at FROM users WHERE id = $1",
      [id]
    );
    const row = result.rows[0];
    return row ? UserMapper.fromDatabase(row) : null;
  }

  async create(user: CreateUserModel): Promise<User> {
    try {
      const result = await this.database.query<UserRecord>(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, role, created_at`,
        [user.username, user.email, user.passwordHash]
      );
      const row = result.rows[0];

      if (!row) {
        throw new PersistenceError("Created user could not be loaded.");
      }

      return UserMapper.fromDatabase(row);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "23505") {
        throw new ConflictError("Username or email already exists.");
      }

      throw error;
    }
  }
}

export default UserRepository;
