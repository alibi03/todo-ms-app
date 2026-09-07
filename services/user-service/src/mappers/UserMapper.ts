import User from "../models/domain/User";
import UserCredentials from "../models/domain/UserCredentials";
import type UserRole from "../types/UserRole";

type UserRecord = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  created_at: Date;
};

type UserCredentialsRecord = {
  id: number;
  role: UserRole;
  password_hash: string;
};

class UserMapper {
  static fromDatabase(row: UserRecord): User {
    return new User(row.id, row.username, row.email, row.role, row.created_at);
  }

  static credentialsFromDatabase(row: UserCredentialsRecord): UserCredentials {
    return new UserCredentials(row.id, row.role, row.password_hash);
  }
}

export { type UserCredentialsRecord, type UserRecord };
export default UserMapper;
