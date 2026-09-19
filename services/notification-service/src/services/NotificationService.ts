import type { INotificationRepository } from "../interfaces/repositories/INotificationRepository";
import type { INotificationService } from "../interfaces/services/INotificationService";
import type { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { NotificationMapper } from "../mappers/NotificationMapper";

export class NotificationService implements INotificationService {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async process(event: TaskAssignmentEventDto): Promise<void> {
    await this.notificationRepository.createOnce(NotificationMapper.toCreateModel(event));
  }
}
