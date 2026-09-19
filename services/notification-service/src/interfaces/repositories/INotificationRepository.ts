import type { CreateNotificationModel } from "../../models/domain/CreateNotificationModel";

export interface INotificationRepository {
  createOnce(notification: CreateNotificationModel): Promise<void>;
}
