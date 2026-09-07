import type { RequestHandler } from "express";

import { AuthenticationError } from "../errors/ApplicationErrors";
import type { TokenServicePort } from "../ports/ServicePorts";

function authenticate(tokens: Pick<TokenServicePort, "verify">): RequestHandler {
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
