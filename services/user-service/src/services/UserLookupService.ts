import { AuthenticationError } from "../errors/AuthenticationError";
import { NotFoundError } from "../errors/NotFoundError";
import { ValidationError } from "../errors/ValidationError";
import type { IUserRepository } from "../interfaces/repositories/IUserRepository";
import type { IUserLookupService } from "../interfaces/services/IUserLookupService";
import type { User } from "../models/domain/User";

export class UserLookupService implements IUserLookupService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getUser(requesterId: number, userId: number): Promise<User> {
    if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) {
      throw new ValidationError("User ID must be a valid positive integer.");
    }
    const requester = await this.userRepository.findById(requesterId);
    if (!requester) throw new AuthenticationError("User is no longer available.");
    const user = requesterId === userId ? requester : await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found.");
    return user;
  }
}
