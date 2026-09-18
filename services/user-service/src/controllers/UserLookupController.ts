import type { Request, Response } from "express";
import type { IUserLookupService } from "../interfaces/services/IUserLookupService";
import { UserIdParamsDto } from "../models/dto/requests/UserIdParamsDto";
import type { UserLookupResponse } from "../models/dto/responses/UserLookupResponse";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";
import { RequestValidator } from "../utils/RequestValidator";
import { UserResponseMapper } from "../mappers/UserResponseMapper";

export class UserLookupController {
  constructor(private readonly userLookupService: IUserLookupService) {}

  async getUser(request: Request, response: Response<UserLookupResponse, AuthenticatedLocals>): Promise<void> {
    const params = await RequestValidator.validate(UserIdParamsDto, request.params);
    const user = await this.userLookupService.getUser(response.locals.userId, Number(params.id));
    response.json(UserResponseMapper.toLookupResponse(user));
  }
}
