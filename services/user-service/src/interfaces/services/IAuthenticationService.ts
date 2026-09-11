import type User from "../../models/domain/User";
import type { LoginRequestDto } from "../../models/dto/requests/LoginRequestDto";
import type { LoginResult } from "../../models/dto/results/LoginResult";

interface IAuthenticationService {
  login(input: LoginRequestDto): Promise<LoginResult>;
  getProfile(userId: number): Promise<User>;
}

export type { IAuthenticationService };
