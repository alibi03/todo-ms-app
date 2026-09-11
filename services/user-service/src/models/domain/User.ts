import type UserRole from "../../types/UserRole";

class User {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole;
  readonly createdAt: Date;

  constructor(
    id: number,
    username: string,
    email: string,
    role: UserRole,
    createdAt: Date
  ) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.role = role;
    this.createdAt = createdAt;
  }
}

export default User;
