import { z } from "zod";
import { userResponseSchema } from "../models/dto/responses/UserResponse";
import { ApiClient } from "./ApiClient";

const loginResponseSchema = z.object({ token: z.string().min(1) });
const profileResponseSchema = z.object({ user: userResponseSchema });
const registerResponseSchema = z.object({
  message: z.string(),
  user: userResponseSchema,
});

export class UserService {
  constructor(private readonly apiClient: ApiClient) {}

  register(username: string, email: string, password: string) {
    return this.apiClient.request(
      "/api/auth/register",
      registerResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      },
    );
  }

  login(email: string, password: string) {
    return this.apiClient.request("/api/auth/login", loginResponseSchema, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  profile(signal?: AbortSignal) {
    return this.apiClient.request("/api/profile", profileResponseSchema, {
      signal,
    });
  }
}
