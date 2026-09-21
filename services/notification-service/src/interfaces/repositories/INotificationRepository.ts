import type { CreateNotificationModel } from "../../models/domain/CreateNotificationModel";
import type { Notification } from "../../models/domain/Notification";

export interface INotificationRepository {
  createOnce(notification: CreateNotificationModel): Promise<void>;
  listByRecipient(userId: number, before: number | null, limit: number): Promise<Notification[]>;
}
