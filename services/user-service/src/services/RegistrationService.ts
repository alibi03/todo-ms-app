import bcrypt from "bcrypt";

import type { User } from "../models/domain/User";
import type { RegisterRequestDto } from "../models/dto/requests/RegisterRequestDto";
import { CreateUserModel } from "../models/domain/CreateUserModel";
import type { IUserRepository } from "../interfaces/repositories/IUserRepository";
import type { IRegistrationService } from "../interfaces/services/IRegistrationService";

export class RegistrationService implements IRegistrationService {
  constructor(private readonly userRepository: IUserRepository) {}

  async register(input: RegisterRequestDto): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 12);
    return this.userRepository.create(new CreateUserModel(input.username, input.email, passwordHash));
  }
}
