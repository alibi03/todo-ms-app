import type { NotificationResponse } from "./NotificationResponse";

export type ListNotificationsResponse = { notifications: NotificationResponse[]; nextCursor: number | null };
