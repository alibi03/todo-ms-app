import type { TaskAssignmentEventDto } from "../../models/dto/events/TaskAssignmentEventDto";
import type { ListNotificationsQueryDto } from "../../models/dto/requests/ListNotificationsQueryDto";
import type { NotificationPage } from "../../models/dto/results/NotificationPage";

export interface INotificationService {
  process(event: TaskAssignmentEventDto): Promise<void>;
  list(userId: number, query: ListNotificationsQueryDto): Promise<NotificationPage>;
}
