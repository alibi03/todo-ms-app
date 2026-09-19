import type { OutboxDelivery } from "../../models/domain/OutboxDelivery";

export interface IOutboxRepository {
  claim(): Promise<OutboxDelivery | null>;
  markPublished(delivery: OutboxDelivery): Promise<void>;
  retry(delivery: OutboxDelivery): Promise<void>;
}
