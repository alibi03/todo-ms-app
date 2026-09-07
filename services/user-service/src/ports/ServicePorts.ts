import type AuthenticatedUser from "../models/domain/AuthenticatedUser";
import type User from "../models/domain/User";
import type { LoginRequestDto, RegisterRequestDto } from "../models/requests/AuthRequests";
import type { LoginResult } from "../models/results/AuthResults";

interface RegistrationServicePort {
  register(input: RegisterRequestDto): Promise<User>;
}

interface AuthenticationServicePort {
  login(input: LoginRequestDto): Promise<LoginResult>;
  getProfile(userId: number): Promise<User>;
}

interface TokenServicePort {
  create(user: AuthenticatedUser): string;
  verify(token: string): AuthenticatedUser;
}

export { type AuthenticationServicePort, type RegistrationServicePort, type TokenServicePort };
