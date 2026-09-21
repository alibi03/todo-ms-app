import type { RequestHandler } from "express";
import { AuthenticationError } from "../errors/AuthenticationError";
import type { IUserServiceClient } from "../interfaces/services/IUserServiceClient";

export function authenticate(userServiceClient: IUserServiceClient): RequestHandler {
  return async (request, response, next) => {
    const token = request.get("authorization")?.match(/^Bearer +(\S+)$/i)?.[1];
    if (!token || token.length > 4096) throw new AuthenticationError("A Bearer token is required.");
    const user = await userServiceClient.getCurrentUser(token);
    response.locals.userId = user.id;
    next();
  };
}
