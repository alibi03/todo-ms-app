import type { Request, Response } from "express";

import UserResponseMapper from "../mappers/UserResponseMapper";
import { LoginRequestDto, RegisterRequestDto } from "../models/requests/AuthRequests";
import type { LoginResponse, RegisterResponse } from "../models/responses/AuthResponses";
import type { AuthenticationServicePort, RegistrationServicePort } from "../ports/ServicePorts";
import RequestValidator from "../utils/RequestValidator";

class AuthController {
  constructor(
    private readonly registration: RegistrationServicePort,
    private readonly authentication: Pick<AuthenticationServicePort, "login">
  ) {}

  readonly register = async (request: Request, response: Response<RegisterResponse>): Promise<void> => {
    const input = await RequestValidator.validate(RegisterRequestDto, request.body);
    const user = await this.registration.register(input);
    response.status(201).json({
      message: "User registered successfully.",
      user: UserResponseMapper.toPublicResponse(user),
    });
  };

  readonly login = async (request: Request, response: Response<LoginResponse>): Promise<void> => {
    const input = await RequestValidator.validate(LoginRequestDto, request.body);
    const result = await this.authentication.login(input);
    response.json({ token: result.token });
  };
}

export default AuthController;
