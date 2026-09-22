import { useId, useState, type FormEvent } from "react";
import type { TaskResponse } from "../models/dto/responses/TaskResponse";
import {
  taskStatusSchema,
  statusLabels,
  type TaskStatus,
} from "../models/TaskStatus";
import type { CreateTaskRequest } from "../models/dto/requests/CreateTaskRequest";
import { errorMessage } from "../utils/errorMessage";

interface TaskFormProps {
  task?: TaskResponse;
  isOwner?: boolean;
  onSave: (values: CreateTaskRequest & { status: TaskStatus }) => Promise<void>;
  onCancel?: () => void;
}

export function TaskForm({
  task,
  isOwner = true,
  onSave,
  onCancel,
}: TaskFormProps) {
  const statusId = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "pending");
  const [assignee, setAssignee] = useState(
    task?.assignedToUserId?.toString() ?? "",
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assignedToUserId = assignee.trim() ? Number(assignee) : null;
    if (
      isOwner &&
      assignedToUserId !== null &&
      (!Number.isSafeInteger(assignedToUserId) ||
        assignedToUserId < 1 ||
        assignedToUserId > 2147483647)
    ) {
      setError("Assignee ID must be a positive whole number up to 2147483647.");
      return;
    }
    if (isOwner && !title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        assignedToUserId,
        dueDate: dueDate || null,
      });
      if (!task) {
        setTitle("");
        setDescription("");
        setAssignee("");
        setDueDate("");
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={task ? "edit-form" : "task-form"}
      onSubmit={submit}
      aria-label={task ? "Edit task" : "Create task"}
    >
      <fieldset className="stack" disabled={submitting}>
        <h3>
          {task ? (isOwner ? "Edit task" : "Update status") : "Create a task"}
        </h3>
        {isOwner && (
          <>
            <label>
              Title
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Assignee user ID
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              Ask the assignee for the user ID shown in their account. Leave it
              blank to unassign.
            </p>
          </>
        )}
        {task && (
          <div className="stack">
            <label htmlFor={statusId}>Status</label>
            <select
              id={statusId}
              value={status}
              onChange={(event) =>
                setStatus(taskStatusSchema.parse(event.target.value))
              }
            >
              {taskStatusSchema.options.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isOwner && (
          <p className="hint">
            As an assignee, you can only change the status.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary">
            {submitting ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
          {onCancel && (
            <button className="secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
