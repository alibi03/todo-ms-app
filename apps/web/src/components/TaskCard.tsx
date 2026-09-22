import { useState } from "react";
import type { TaskResponse } from "../models/dto/responses/TaskResponse";
import type { UpdateTaskRequest } from "../models/dto/requests/UpdateTaskRequest";
import type { CreateTaskRequest } from "../models/dto/requests/CreateTaskRequest";
import { statusLabels, type TaskStatus } from "../models/TaskStatus";
import { errorMessage } from "../utils/errorMessage";
import { TaskForm } from "./TaskForm";

interface TaskCardProps {
  task: TaskResponse;
  userId: number;
  onUpdate: (id: number, input: UpdateTaskRequest) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function TaskCard({ task, userId, onUpdate, onDelete }: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = task.ownerUserId === userId;

  async function save(values: CreateTaskRequest & { status: TaskStatus }) {
    await onUpdate(task.id, isOwner ? values : { status: values.status });
    setEditing(false);
  }

  async function remove() {
    if (!window.confirm('Delete "' + task.title + '"?')) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(task.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article
      className="task-card"
      aria-label={"Task " + task.id + ": " + task.title}
    >
      <div className="task-card-heading">
        <div>
          <h3>{task.title}</h3>
          <span className={"status " + task.status}>
            {statusLabels[task.status]}
          </span>
        </div>
        <span className="muted">#{task.id}</span>
      </div>
      {task.description && <p>{task.description}</p>}
      <dl className="task-meta">
        <div>
          <dt>Due</dt>
          <dd>{task.dueDate ?? "Not set"}</dd>
        </div>
        <div>
          <dt>Assignee</dt>
          <dd>
            {task.assignedToUserId
              ? "User #" + task.assignedToUserId
              : "Unassigned"}
          </dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{isOwner ? "Owner" : "Assignee"}</dd>
        </div>
      </dl>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing ? (
        <TaskForm
          task={task}
          isOwner={isOwner}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="actions">
          <button
            className="secondary"
            type="button"
            disabled={deleting}
            onClick={() => setEditing(true)}
          >
            {isOwner ? "Edit" : "Update status"}
          </button>
          {isOwner && (
            <button
              className="danger"
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
