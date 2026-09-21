import type { Request, Response } from "express";
import type { INotificationService } from "../interfaces/services/INotificationService";
import { NotificationResponseMapper } from "../mappers/NotificationResponseMapper";
import { ListNotificationsQueryDto } from "../models/dto/requests/ListNotificationsQueryDto";
import type { ListNotificationsResponse } from "../models/dto/responses/ListNotificationsResponse";
import type { AuthenticatedLocals } from "../types/AuthenticatedLocals";
import { RequestValidator } from "../utils/RequestValidator";

export class NotificationController {
  constructor(private readonly notificationService: INotificationService) {}

  async list(request: Request, response: Response<ListNotificationsResponse, AuthenticatedLocals>): Promise<void> {
    const query = await RequestValidator.validate(ListNotificationsQueryDto, request.query);
    const page = await this.notificationService.list(response.locals.userId, query);
    response.json({ notifications: page.notifications.map(NotificationResponseMapper.toResponse), nextCursor: page.nextCursor });
  }
}
