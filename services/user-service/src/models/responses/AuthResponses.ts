import type { PublicUserResponse } from "./UserResponses";

interface RegisterResponse {
  message: string;
  user: PublicUserResponse;
}

interface LoginResponse {
  token: string;
}

interface ProfileResponse {
  user: PublicUserResponse;
}

export { type LoginResponse, type ProfileResponse, type RegisterResponse };
