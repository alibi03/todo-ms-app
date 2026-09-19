import { setTimeout as delay } from "node:timers/promises";
import type { IOutboxRepository } from "../interfaces/repositories/IOutboxRepository";
import type { IEventPublisher } from "../interfaces/services/IEventPublisher";

export class OutboxDispatcher {
  private readonly abort = new AbortController();
  private running?: Promise<void>;

  constructor(
    private readonly outboxRepository: IOutboxRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Pick<Console, "error"> = console
  ) {}

  start(): void {
    this.running ??= this.run();
  }

  async dispatchOne(): Promise<boolean> {
    const delivery = await this.outboxRepository.claim();
    if (!delivery) return false;
    try {
      await this.eventPublisher.publish(delivery.event);
      await this.outboxRepository.markPublished(delivery);
    } catch {
      await this.outboxRepository.retry(delivery);
      this.logger.error("Notification event delivery failed; retry scheduled.");
    }
    return true;
  }

  private async run(): Promise<void> {
    while (!this.abort.signal.aborted) {
      try {
        if (await this.dispatchOne()) continue;
      } catch {
        this.logger.error("Notification outbox is unavailable; retry scheduled.");
      }
      await delay(1000, undefined, { signal: this.abort.signal }).catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    this.abort.abort();
    await this.running;
    await this.eventPublisher.close();
  }
}
