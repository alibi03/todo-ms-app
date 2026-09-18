import type UserRole from "../../types/UserRole";

export class AuthenticatedUser {
  readonly id: number;
  readonly role: UserRole;

  constructor(
    id: number,
    role: UserRole
  ) {
    this.id = id;
    this.role = role;
  }
}
