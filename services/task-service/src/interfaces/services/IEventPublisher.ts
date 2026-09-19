import type { TaskAssignmentEvent } from "../../models/domain/TaskAssignmentEvent";

export interface IEventPublisher {
  publish(event: TaskAssignmentEvent): Promise<void>;
  close(): Promise<void>;
}
