import { notificationPageResponseSchema } from "../models/dto/responses/NotificationPageResponse";
import { ApiClient } from "./ApiClient";

export class NotificationService {
  constructor(private readonly apiClient: ApiClient) {}

  list(before?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "20" });
    if (before !== undefined) query.set("before", String(before));
    return this.apiClient.request(
      "/api/notifications?" + query,
      notificationPageResponseSchema,
      { signal },
    );
  }
}
