import type { TaskAssignmentEvent } from "./TaskAssignmentEvent";

export interface OutboxDelivery {
  event: TaskAssignmentEvent;
  leaseId: string;
  attempts: number;
}
