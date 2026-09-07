import jwt from "jsonwebtoken";

import HttpError from "./errors";
import type { PublicUser } from "./user-repository";

const issuer = "staj-user-service";
const audience = "staj-apis";
const lifetimeSeconds = 60 * 60;

type TokenUser = Pick<PublicUser, "id" | "role">;

class TokenService {
  constructor(private readonly secret: string) {}

  create(user: TokenUser): string {
    return jwt.sign({ role: user.role }, this.secret, {
      algorithm: "HS256",
      subject: String(user.id),
      issuer,
      audience,
      expiresIn: lifetimeSeconds,
    });
  }

  verify(token: string): TokenUser {
    let payload: string | jwt.JwtPayload;

    try {
      payload = jwt.verify(token, this.secret, {
        algorithms: ["HS256"],
        issuer,
        audience,
        maxAge: lifetimeSeconds,
      });
    } catch {
      throw new HttpError(401, "Token is invalid or expired.");
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
      throw new HttpError(401, "Token is invalid or expired.");
    }

    return { id: Number(payload.sub), role: payload.role };
  }
}

export default TokenService;
