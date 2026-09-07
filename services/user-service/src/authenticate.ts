import type { RequestHandler } from "express";

import HttpError from "./errors";
import type TokenService from "./token";

function authenticate(tokens: Pick<TokenService, "verify">): RequestHandler {
  return (request, response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer +(\S+)$/i);
    const token = match?.[1];

    if (!token || token.length > 4096) {
      throw new HttpError(401, "A Bearer token is required.");
    }

    response.locals.userId = tokens.verify(token).id;
    next();
  };
}

export default authenticate;
