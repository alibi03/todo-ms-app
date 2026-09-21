import type { Notification } from "../../domain/Notification";

export type NotificationPage = { notifications: Notification[]; nextCursor: number | null };
