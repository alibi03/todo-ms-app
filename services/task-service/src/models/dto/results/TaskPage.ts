import type Task from "../../domain/Task";

interface TaskPage {
  tasks: Task[];
  nextCursor: number | null;
}

export type { TaskPage };
