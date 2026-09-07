import bcrypt from "bcrypt";

import type User from "../models/domain/User";
import type { RegisterRequestDto } from "../models/requests/AuthRequests";
import { CreateUserModel } from "../models/repositories/UserModels";
import type { UserWriter } from "../ports/RepositoryPorts";
import type { RegistrationServicePort } from "../ports/ServicePorts";

class RegistrationService implements RegistrationServicePort {
  constructor(private readonly users: UserWriter) {}

  async register(input: RegisterRequestDto): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 12);
    return this.users.create(new CreateUserModel(input.username, input.email, passwordHash));
  }
}

export default RegistrationService;
