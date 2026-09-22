import { useCallback, useState } from "react";
import type { UserResponse } from "../models/dto/responses/UserResponse";
import type { CreateTaskRequest } from "../models/dto/requests/CreateTaskRequest";
import type { UpdateTaskRequest } from "../models/dto/requests/UpdateTaskRequest";
import type { TaskService } from "../services/TaskService";
import { useCursorPage } from "../hooks/useCursorPage";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

interface TaskBoardProps {
  user: UserResponse;
  taskService: TaskService;
}

export function TaskBoard({ user, taskService }: TaskBoardProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const fetchPage = useCallback(
    async (cursor?: number, signal?: AbortSignal) => {
      const page = await taskService.list(cursor, signal);
      return { items: page.tasks, nextCursor: page.nextCursor };
    },
    [taskService],
  );
  const page = useCursorPage(fetchPage);

  async function create(input: CreateTaskRequest) {
    const { title, description, assignedToUserId, dueDate } = input;
    await taskService.create({ title, description, assignedToUserId, dueDate });
    setNotice("Task created.");
    await page.load();
  }

  async function update(id: number, input: UpdateTaskRequest) {
    await taskService.update(id, input);
    setNotice("Task updated.");
    await page.load();
  }

  async function remove(id: number) {
    await taskService.delete(id);
    setNotice("Task deleted.");
    await page.load();
  }

  return (
    <section className="panel task-panel" aria-label="Tasks">
      <div className="section-heading">
        <h2>Your tasks</h2>
        <button
          className="secondary"
          type="button"
          onClick={() => void page.load()}
          disabled={page.loading}
        >
          Refresh
        </button>
      </div>
      <TaskForm onSave={create} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {page.error && (
        <p className="error" role="alert">
          {page.error}
        </p>
      )}
      {page.loading && (
        <p className="muted" role="status">
          Loading tasks…
        </p>
      )}
      {!page.loading && !page.error && page.items.length === 0 && (
        <p className="muted">No tasks yet.</p>
      )}
      <div className="task-list">
        {page.items.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            userId={user.id}
            onUpdate={update}
            onDelete={remove}
          />
        ))}
      </div>
      {page.nextCursor !== null && (
        <button
          className="secondary"
          type="button"
          disabled={page.loading}
          onClick={() => void page.load(page.nextCursor!)}
        >
          Load more tasks
        </button>
      )}
    </section>
  );
}
