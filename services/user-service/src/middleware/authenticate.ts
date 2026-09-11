import type { RequestHandler } from "express";

import { AuthenticationError } from "../errors/AuthenticationError";
import type { ITokenService } from "../interfaces/services/ITokenService";

function authenticate(tokens: ITokenService): RequestHandler {
  return (request, response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer +(\S+)$/i);
    const token = match?.[1];

    if (!token || token.length > 4096) {
      throw new AuthenticationError("A Bearer token is required.");
    }

    response.locals.userId = tokens.verify(token).id;
    next();
  };
}

export default authenticate;
