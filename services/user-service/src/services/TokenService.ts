import jwt from "jsonwebtoken";

import { AuthenticationError } from "../errors/ApplicationErrors";
import AuthenticatedUser from "../models/domain/AuthenticatedUser";
import type { TokenServicePort } from "../ports/ServicePorts";

const issuer = "staj-user-service";
const audience = "staj-apis";
const lifetimeSeconds = 60 * 60;

class TokenService implements TokenServicePort {
  constructor(private readonly secret: string) {}

  create(user: AuthenticatedUser): string {
    return jwt.sign({ role: user.role }, this.secret, {
      algorithm: "HS256",
      subject: String(user.id),
      issuer,
      audience,
      expiresIn: lifetimeSeconds,
    });
  }

  verify(token: string): AuthenticatedUser {
    let payload: string | jwt.JwtPayload;

    try {
      payload = jwt.verify(token, this.secret, {
        algorithms: ["HS256"],
        issuer,
        audience,
        maxAge: lifetimeSeconds,
      });
    } catch {
      throw new AuthenticationError("Token is invalid or expired.");
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" || !/^[1-9]\d*$/.test(payload.sub) ||
      !Number.isSafeInteger(Number(payload.sub)) || Number(payload.sub) > 2_147_483_647 ||
      (payload.role !== "member" && payload.role !== "admin") ||
      typeof payload.iat !== "number" || !Number.isSafeInteger(payload.iat) ||
      typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp) ||
      payload.iat < 0 || payload.iat > now || payload.exp <= payload.iat ||
      payload.exp - payload.iat > lifetimeSeconds
    ) {
      throw new AuthenticationError("Token is invalid or expired.");
    }

    return new AuthenticatedUser(Number(payload.sub), payload.role);
  }
}

export default TokenService;
