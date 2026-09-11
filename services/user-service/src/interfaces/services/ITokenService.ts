import type AuthenticatedUser from "../../models/domain/AuthenticatedUser";

interface ITokenService {
  create(user: AuthenticatedUser): string;
  verify(token: string): AuthenticatedUser;
}

export type { ITokenService };
