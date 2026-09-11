import type UserRole from "../../types/UserRole";

class UserCredentials {
  readonly id: number;
  readonly role: UserRole;
  readonly passwordHash: string;

  constructor(
    id: number,
    role: UserRole,
    passwordHash: string
  ) {
    this.id = id;
    this.role = role;
    this.passwordHash = passwordHash;
  }
}

export default UserCredentials;
