import type { PublicUserResponse } from "./PublicUserResponse";

interface RegisterResponse {
  message: string;
  user: PublicUserResponse;
}

export { type RegisterResponse };
