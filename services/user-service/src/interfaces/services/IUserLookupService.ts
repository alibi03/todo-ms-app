import type { User } from "../../models/domain/User";

export interface IUserLookupService {
  getUser(requesterId: number, userId: number): Promise<User>;
}
