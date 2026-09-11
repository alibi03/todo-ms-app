import type User from "../../models/domain/User";
import type UserCredentials from "../../models/domain/UserCredentials";
import type { CreateUserModel } from "../../models/domain/CreateUserModel";

interface IUserRepository {
  create(user: CreateUserModel): Promise<User>;
  findByEmail(email: string): Promise<UserCredentials | null>;
  findById(id: number): Promise<User | null>;
}

export type { IUserRepository };
