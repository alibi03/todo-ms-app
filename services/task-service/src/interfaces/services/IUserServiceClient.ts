import type AuthenticatedUser from "../../models/domain/AuthenticatedUser";

interface IUserServiceClient {
  getCurrentUser(token: string): Promise<AuthenticatedUser>;
}

export type { IUserServiceClient };
