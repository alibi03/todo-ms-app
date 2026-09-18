import type { IUserServiceClient } from "../src/interfaces/services/IUserServiceClient";
import { AuthenticationError } from "../src/errors/AuthenticationError";

export const testUserClient: IUserServiceClient = {
  async getCurrentUser(token) {
    if (!["alice", "bob", "carol"].includes(token)) throw new AuthenticationError("Invalid or expired credentials.");
    return { id: token === "alice" ? 1 : token === "bob" ? 2 : 3 };
  },
  async getUserById(_token, id) {
    return [1, 2, 3].includes(id) ? { id } : null;
  },
};
