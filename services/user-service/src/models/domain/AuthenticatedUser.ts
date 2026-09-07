import type UserRole from "../../types/UserRole";

class AuthenticatedUser {
  constructor(readonly id: number, readonly role: UserRole) {}
}

export default AuthenticatedUser;
