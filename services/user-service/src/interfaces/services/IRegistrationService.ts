import type User from "../../models/domain/User";
import type { RegisterRequestDto } from "../../models/dto/requests/RegisterRequestDto";

interface IRegistrationService {
  register(input: RegisterRequestDto): Promise<User>;
}

export type { IRegistrationService };
