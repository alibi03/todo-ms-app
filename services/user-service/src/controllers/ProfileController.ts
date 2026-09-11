import type { Request, Response } from "express";

import UserResponseMapper from "../mappers/UserResponseMapper";
import type { ProfileResponse } from "../models/dto/responses/ProfileResponse";
import type { IAuthenticationService } from "../interfaces/services/IAuthenticationService";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";

class ProfileController {
  constructor(private readonly authentication: IAuthenticationService) {}

  async getProfile(
    _request: Request,
    response: Response<ProfileResponse, AuthenticatedLocals>
  ): Promise<void> {
    const user = await this.authentication.getProfile(response.locals.userId);
    response.json({ user: UserResponseMapper.toPublicResponse(user) });
  }
}

export default ProfileController;
