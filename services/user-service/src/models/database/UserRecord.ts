import type UserRole from "../../types/UserRole";

type UserRecord = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  created_at: Date;
};

export { type UserRecord };
