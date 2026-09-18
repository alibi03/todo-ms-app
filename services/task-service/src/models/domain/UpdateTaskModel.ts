import type { TaskStatus } from "../../types/TaskStatus";

export class UpdateTaskModel {
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly status: TaskStatus | undefined;

  constructor(title: string | undefined, description: string | undefined, status: TaskStatus | undefined) {
    this.title = title;
    this.description = description;
    this.status = status;
  }
}
