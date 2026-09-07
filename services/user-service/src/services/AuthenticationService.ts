import bcrypt from "bcrypt";

import { AuthenticationError } from "../errors/ApplicationErrors";
import AuthenticatedUser from "../models/domain/AuthenticatedUser";
import type User from "../models/domain/User";
import type { LoginRequestDto } from "../models/requests/AuthRequests";
import { LoginResult } from "../models/results/AuthResults";
import type { UserReader } from "../ports/RepositoryPorts";
import type { AuthenticationServicePort, TokenServicePort } from "../ports/ServicePorts";

class AuthenticationService implements AuthenticationServicePort {
  constructor(
    private readonly users: UserReader,
    private readonly tokens: Pick<TokenServicePort, "create">,
    private readonly dummyPasswordHash: string
  ) {}

  async login(input: LoginRequestDto): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email);
    // Compare a cost-12 hash even when the email does not exist.
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? this.dummyPasswordHash);

    if (!user || !matches) {
      throw new AuthenticationError("Invalid email or password.");
    }

    return new LoginResult(this.tokens.create(new AuthenticatedUser(user.id, user.role)));
  }

  async getProfile(id: number): Promise<User> {
    const user = await this.users.findById(id);

    if (!user) {
      throw new AuthenticationError("User is no longer available.");
    }

    return user;
  }
}

export default AuthenticationService;
