import type { TaskAssignmentEventDto } from "../../models/dto/events/TaskAssignmentEventDto";

export interface INotificationService {
  process(event: TaskAssignmentEventDto): Promise<void>;
}
