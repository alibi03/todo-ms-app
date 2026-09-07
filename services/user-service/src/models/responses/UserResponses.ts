import type UserRole from "../../types/UserRole";

interface PublicUserResponse {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export { type PublicUserResponse };
