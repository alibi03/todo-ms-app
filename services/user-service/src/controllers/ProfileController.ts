import type { Request, Response } from "express";

import { UserResponseMapper } from "../mappers/UserResponseMapper";
import type { ProfileResponse } from "../models/dto/responses/ProfileResponse";
import type { IAuthenticationService } from "../interfaces/services/IAuthenticationService";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";

export class ProfileController {
  constructor(private readonly authenticationService: IAuthenticationService) {}

  async getProfile(
    _request: Request,
    response: Response<ProfileResponse, AuthenticatedLocals>
  ): Promise<void> {
    const user = await this.authenticationService.getProfile(response.locals.userId);
    response.json({ user: UserResponseMapper.toPublicResponse(user) });
  }
}
