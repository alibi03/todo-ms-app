import type User from "../models/domain/User";
import type UserCredentials from "../models/domain/UserCredentials";
import type { CreateUserModel } from "../models/repositories/UserModels";

interface UserWriter {
  create(user: CreateUserModel): Promise<User>;
}

interface UserReader {
  findByEmail(email: string): Promise<UserCredentials | null>;
  findById(id: number): Promise<User | null>;
}

export { type UserReader, type UserWriter };
