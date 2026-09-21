import type { AuthenticatedUser } from "../../models/domain/AuthenticatedUser";

export interface IUserServiceClient {
  getCurrentUser(token: string): Promise<AuthenticatedUser>;
}
