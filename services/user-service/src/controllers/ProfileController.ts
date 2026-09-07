import type { Request, Response } from "express";

import UserResponseMapper from "../mappers/UserResponseMapper";
import type { ProfileResponse } from "../models/responses/AuthResponses";
import type { AuthenticationServicePort } from "../ports/ServicePorts";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";

class ProfileController {
  constructor(private readonly authentication: Pick<AuthenticationServicePort, "getProfile">) {}

  readonly getProfile = async (
    _request: Request,
    response: Response<ProfileResponse, AuthenticatedLocals>
  ): Promise<void> => {
    const user = await this.authentication.getProfile(response.locals.userId);
    response.json({ user: UserResponseMapper.toPublicResponse(user) });
  };
}

export default ProfileController;
