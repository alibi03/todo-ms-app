import { setTimeout as delay } from "node:timers/promises";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import type { BrokerConfig } from "../config/broker";
import type { INotificationService } from "../interfaces/services/INotificationService";
import type { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { ConfirmedDelivery } from "./ConfirmedDelivery";
import { EventValidator } from "./EventValidator";
import { MessagingTimeout } from "./MessagingTimeout";
import { MessagingTopology } from "./MessagingTopology";
import { RabbitSession } from "./RabbitSession";

export class NotificationConsumer {
  private readonly abort = new AbortController();
  private session?: RabbitSession;
  private running?: Promise<void>;
  private ready = false;

  constructor(
    private readonly config: BrokerConfig,
    private readonly notificationService: INotificationService,
    private readonly logger: Pick<Console, "error"> = console
  ) {}

  isReady(): boolean { return this.ready; }

  start(): void { this.running ??= this.run(); }

  async handle(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    let event: TaskAssignmentEventDto;
    try {
      event = await EventValidator.parse(message);
    } catch {
      // Keep the rejected payload without allowing an invalid message to block the queue.
      await ConfirmedDelivery.send(channel, "", MessagingTopology.rejectedQueue, message.content, {
        contentType: message.properties.contentType, messageId: message.properties.messageId,
        type: message.properties.type, headers: { reason: "invalid-event" },
      });
      channel.ack(message);
      this.logger.error("Invalid notification event moved to the rejected queue.");
      return;
    }
    await this.notificationService.process(event);
    channel.ack(message);
  }

  private async run(): Promise<void> {
    while (!this.abort.signal.aborted) {
      const session = new RabbitSession(this.config);
      this.session = session;
      let pending: Promise<void> = Promise.resolve();
      try {
        const channel = await session.open();
        if (this.abort.signal.aborted) break;
        await MessagingTimeout.run(channel.prefetch(1));
        await MessagingTimeout.run(channel.consume(MessagingTopology.queue, message => {
          if (!message) { session.close(); return; }
          pending = this.handle(channel, message).catch(() => {
            this.ready = false;
            this.logger.error("Notification processing failed; the message will be retried.");
            // Closing requeues the unacknowledged message; reconnect delay prevents a hot retry loop.
            session.close();
          });
        }, { noAck: false }));
        this.ready = true;
        await session.closed;
      } catch {
        this.logger.error("Notification broker connection failed; retry scheduled.");
      } finally {
        this.ready = false;
        session.close();
        await pending;
      }
      await delay(2000, undefined, { signal: this.abort.signal }).catch(() => undefined);
    }
  }

  async stop(): Promise<void> {
    this.abort.abort();
    this.session?.close();
    await this.running;
  }
}
