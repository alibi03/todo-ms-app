import { useMemo } from "react";
import type { UserResponse } from "../models/dto/responses/UserResponse";
import { ApiClient } from "../services/ApiClient";
import { TaskService } from "../services/TaskService";
import { NotificationService } from "../services/NotificationService";
import { TaskBoard } from "./TaskBoard";
import { NotificationPanel } from "./NotificationPanel";

interface DashboardProps {
  user: UserResponse;
  token: string;
  onSignOut: () => void;
  onSessionExpired: () => void;
}

export function Dashboard({
  user,
  token,
  onSignOut,
  onSessionExpired,
}: DashboardProps) {
  const apiClient = useMemo(
    () => new ApiClient(token, onSessionExpired),
    [token, onSessionExpired],
  );
  const taskService = useMemo(() => new TaskService(apiClient), [apiClient]);
  const notificationService = useMemo(
    () => new NotificationService(apiClient),
    [apiClient],
  );

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Task workspace</p>
          <h1>Welcome, {user.username}</h1>
        </div>
        <div className="user-menu">
          <span>
            {user.email} · Your user ID: {user.id}
          </span>
          <button type="button" className="text-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace-grid">
        <TaskBoard user={user} taskService={taskService} />
        <NotificationPanel notificationService={notificationService} />
      </div>
    </main>
  );
}
