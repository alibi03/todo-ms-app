import type { INotificationRepository } from "../interfaces/repositories/INotificationRepository";
import type { INotificationService } from "../interfaces/services/INotificationService";
import type { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { NotificationMapper } from "../mappers/NotificationMapper";
import { ValidationError } from "../errors/ValidationError";
import type { ListNotificationsQueryDto } from "../models/dto/requests/ListNotificationsQueryDto";
import type { NotificationPage } from "../models/dto/results/NotificationPage";

export class NotificationService implements INotificationService {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async list(userId: number, query: ListNotificationsQueryDto): Promise<NotificationPage> {
    const limit = Number(query.limit ?? 20);
    const before = query.before === undefined ? null : Number(query.before);
    if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) {
      throw new ValidationError("User ID must be a valid positive integer.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("Limit must be between 1 and 100.");
    }
    if (before !== null && (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)) {
      throw new ValidationError("Before must be a valid notification ID.");
    }
    const rows = await this.notificationRepository.listByRecipient(userId, before, limit + 1);
    const notifications = rows.slice(0, limit);
    return { notifications, nextCursor: rows.length > limit ? notifications.at(-1)?.id ?? null : null };
  }

  async process(event: TaskAssignmentEventDto): Promise<void> {
    await this.notificationRepository.createOnce(NotificationMapper.toCreateModel(event));
  }
}
