import { AuthenticationError } from "../errors/AuthenticationError";
import { DependencyUnavailableError } from "../errors/DependencyUnavailableError";
import type { IUserServiceClient } from "../interfaces/services/IUserServiceClient";
import AuthenticatedUser from "../models/domain/AuthenticatedUser";

class UserServiceClient implements IUserServiceClient {
  constructor(private readonly baseUrl: string, private readonly timeoutMs: number = 3000) {}

  async getCurrentUser(token: string): Promise<AuthenticatedUser> {
    try {
      const response = await fetch(new URL("/api/profile", this.baseUrl), {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (response.status === 401) {
        await response.body?.cancel();
        throw new AuthenticationError("Invalid or expired credentials.");
      }
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new DependencyUnavailableError("User Service is unavailable. Please try again later.");
      }

      const payload: unknown = await this.readProfile(response);
      const user = typeof payload === "object" && payload !== null && "user" in payload ? payload.user : null;
      const id = typeof user === "object" && user !== null && "id" in user ? user.id : null;
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
        throw new Error("Invalid profile response.");
      }
      return new AuthenticatedUser(id);
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new DependencyUnavailableError("User Service is unavailable. Please try again later.");
    }
  }

  private async readProfile(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing profile response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) throw new Error("Profile response too large.");
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

export default UserServiceClient;
