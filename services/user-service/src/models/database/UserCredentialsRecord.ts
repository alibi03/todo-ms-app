import type UserRole from "../../types/UserRole";

type UserCredentialsRecord = {
  id: number;
  role: UserRole;
  password_hash: string;
};

export { type UserCredentialsRecord };
