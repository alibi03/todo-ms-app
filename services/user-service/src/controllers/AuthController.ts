import type { Request, Response } from "express";

import UserResponseMapper from "../mappers/UserResponseMapper";
import { LoginRequestDto } from "../models/dto/requests/LoginRequestDto";
import { RegisterRequestDto } from "../models/dto/requests/RegisterRequestDto";
import type { LoginResponse } from "../models/dto/responses/LoginResponse";
import type { RegisterResponse } from "../models/dto/responses/RegisterResponse";
import type { IAuthenticationService } from "../interfaces/services/IAuthenticationService";
import type { IRegistrationService } from "../interfaces/services/IRegistrationService";
import RequestValidator from "../utils/RequestValidator";

class AuthController {
  constructor(
    private readonly registration: IRegistrationService,
    private readonly authentication: IAuthenticationService
  ) {}

  async register(request: Request, response: Response<RegisterResponse>): Promise<void> {
    const input = await RequestValidator.validate(RegisterRequestDto, request.body);
    const user = await this.registration.register(input);
    response.status(201).json({
      message: "User registered successfully.",
      user: UserResponseMapper.toPublicResponse(user),
    });
  }

  async login(request: Request, response: Response<LoginResponse>): Promise<void> {
    const input = await RequestValidator.validate(LoginRequestDto, request.body);
    const result = await this.authentication.login(input);
    response.json({ token: result.token });
  }
}

export default AuthController;
