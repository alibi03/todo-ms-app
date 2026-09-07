import type UserRole from "../../types/UserRole";

class User {
  constructor(
    readonly id: number,
    readonly username: string,
    readonly email: string,
    readonly role: UserRole,
    readonly createdAt: Date
  ) {}
}

export default User;
