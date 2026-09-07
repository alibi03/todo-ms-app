import type UserRole from "../../types/UserRole";

class UserCredentials {
  constructor(
    readonly id: number,
    readonly role: UserRole,
    readonly passwordHash: string
  ) {}
}

export default UserCredentials;
