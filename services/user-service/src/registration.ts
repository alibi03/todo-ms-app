import bcrypt from "bcrypt";
import isEmail from "validator/lib/isEmail";

import HttpError from "./errors";
import type { PublicUser, UserWriter } from "./user-repository";

type RegistrationInput = {
  username: string;
  email: string;
  password: string;
};

function parseRegistration(body: unknown): RegistrationInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Request data must be an object.");
  }

  const input = body as Record<string, unknown>;
  const fields = ["username", "email", "password"];

  if (Object.keys(input).some((key) => !fields.includes(key))) {
    throw new HttpError(400, "Only username, email and password are allowed.");
  }

  if (typeof input.username !== "string" || !input.username.trim()) {
    throw new HttpError(400, "Username is required.");
  }

  const username = input.username.trim();

  if ([...username].length > 50 || /[\u0000-\u001f\u007f]/u.test(username)) {
    throw new HttpError(400, "Username must contain at most 50 characters and no control characters.");
  }

  if (typeof input.email !== "string") {
    throw new HttpError(400, "A valid email address is required.");
  }

  const email = input.email.trim().toLowerCase();

  if (email.length > 255 || !isEmail(email)) {
    throw new HttpError(400, "A valid email address of at most 255 characters is required.");
  }

  if (typeof input.password !== "string" || [...input.password].length < 8) {
    throw new HttpError(400, "Password must contain at least 8 characters.");
  }

  if (Buffer.byteLength(input.password, "utf8") > 72) {
    throw new HttpError(400, "Password must contain at most 72 UTF-8 bytes.");
  }

  return { username, email, password: input.password };
}

class RegistrationService {
  constructor(private readonly users: UserWriter) {}

  async register(body: unknown): Promise<PublicUser> {
    const input = parseRegistration(body);
    const passwordHash = await bcrypt.hash(input.password, 12);

    return this.users.create({
      username: input.username,
      email: input.email,
      passwordHash,
    });
  }
}

export { parseRegistration };
export default RegistrationService;
