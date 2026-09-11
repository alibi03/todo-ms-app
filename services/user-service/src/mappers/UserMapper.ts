import User from "../models/domain/User";
import UserCredentials from "../models/domain/UserCredentials";
import type { UserRecord } from "../models/database/UserRecord";
import type { UserCredentialsRecord } from "../models/database/UserCredentialsRecord";

class UserMapper {
  static fromDatabase(row: UserRecord): User {
    return new User(row.id, row.username, row.email, row.role, row.created_at);
  }

  static credentialsFromDatabase(row: UserCredentialsRecord): UserCredentials {
    return new UserCredentials(row.id, row.role, row.password_hash);
  }
}

export default UserMapper;
