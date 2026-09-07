import bcrypt from "bcrypt";
import isEmail from "validator/lib/isEmail";

import HttpError from "./errors";
import type TokenService from "./token";
import type { PublicUser, UserReader } from "./user-repository";

type LoginInput = { email: string; password: string };

function parseLogin(body: unknown): LoginInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Request data must be an object.");
  }

  const input = body as Record<string, unknown>;

  if (Object.keys(input).some((key) => !["email", "password"].includes(key))) {
    throw new HttpError(400, "Only email and password are allowed.");
  }

  if (typeof input.email !== "string") {
    throw new HttpError(400, "A valid email address is required.");
  }

  const email = input.email.trim().toLowerCase();

  if (email.length > 255 || !isEmail(email)) {
    throw new HttpError(400, "A valid email address of at most 255 characters is required.");
  }

  if (typeof input.password !== "string" || input.password.length === 0) {
    throw new HttpError(400, "Password is required.");
  }

  if (Buffer.byteLength(input.password, "utf8") > 72) {
    throw new HttpError(400, "Password must contain at most 72 UTF-8 bytes.");
  }

  return { email, password: input.password };
}

class AuthenticationService {
  constructor(
    private readonly users: UserReader,
    private readonly tokens: Pick<TokenService, "create">,
    private readonly dummyPasswordHash: string
  ) {}

  async login(body: unknown): Promise<{ token: string }> {
    const input = parseLogin(body);
    const user = await this.users.findByEmail(input.email);
    // Compare a cost-12 hash even when the email does not exist.
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? this.dummyPasswordHash);

    if (!user || !matches) {
      throw new HttpError(401, "Invalid email or password.");
    }

    return { token: this.tokens.create({ id: user.id, role: user.role }) };
  }

  async getProfile(userId: number): Promise<PublicUser> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new HttpError(401, "User is no longer available.");
    }

    return user;
  }
}

export { parseLogin };
export default AuthenticationService;
