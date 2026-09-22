import { useCallback } from "react";
import type { NotificationService } from "../services/NotificationService";
import { useCursorPage } from "../hooks/useCursorPage";

interface NotificationPanelProps {
  notificationService: NotificationService;
}

export function NotificationPanel({
  notificationService,
}: NotificationPanelProps) {
  const fetchPage = useCallback(
    async (cursor?: number, signal?: AbortSignal) => {
      const page = await notificationService.list(cursor, signal);
      return { items: page.notifications, nextCursor: page.nextCursor };
    },
    [notificationService],
  );
  const page = useCursorPage(fetchPage);

  return (
    <aside className="panel notification-panel" aria-label="Notifications">
      <div className="section-heading">
        <h2>Assignments</h2>
        <button
          className="secondary"
          type="button"
          disabled={page.loading}
          onClick={() => void page.load()}
        >
          Refresh
        </button>
      </div>
      <p className="hint">
        Notifications can take a moment to arrive. Refresh to check for new
        assignments.
      </p>
      {page.error && (
        <p className="error" role="alert">
          {page.error}
        </p>
      )}
      {page.loading && (
        <p className="muted" role="status">
          Loading notifications…
        </p>
      )}
      {!page.loading && !page.error && page.items.length === 0 && (
        <p className="muted">No assignment notifications yet.</p>
      )}
      <ol className="notification-list">
        {page.items.map((notification) => (
          <li key={notification.id}>
            <strong>
              {notification.eventType === "task.assigned"
                ? "Assigned"
                : "Reassigned"}
            </strong>
            <span>{notification.title}</span>
            <small>
              Task #{notification.taskId} ·{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(notification.occurredAt))}
            </small>
          </li>
        ))}
      </ol>
      {page.nextCursor !== null && (
        <button
          className="secondary"
          type="button"
          disabled={page.loading}
          onClick={() => void page.load(page.nextCursor!)}
        >
          Load older notifications
        </button>
      )}
    </aside>
  );
}
