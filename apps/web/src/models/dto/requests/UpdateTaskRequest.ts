import type { CreateTaskRequest } from "./CreateTaskRequest";
import type { TaskStatus } from "../../TaskStatus";

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
}
