import type { AuthenticatedUser } from "../../models/domain/AuthenticatedUser";

interface IUserServiceClient {
  getCurrentUser(token: string): Promise<AuthenticatedUser>;
  getUserById(token: string, userId: number): Promise<AuthenticatedUser | null>;
}

export type { IUserServiceClient };
