import type { ConfirmChannel } from "amqplib";
import type { BrokerConfig } from "../config/broker";
import type { IEventPublisher } from "../interfaces/services/IEventPublisher";
import type { TaskAssignmentEvent } from "../models/domain/TaskAssignmentEvent";
import { ConfirmedDelivery } from "./ConfirmedDelivery";
import { MessagingTopology } from "./MessagingTopology";
import { RabbitSession } from "./RabbitSession";

export class RabbitEventPublisher implements IEventPublisher {
  private session?: RabbitSession;
  private channel?: ConfirmChannel;

  constructor(private readonly config: BrokerConfig) {}

  async publish(event: TaskAssignmentEvent): Promise<void> {
    try {
      if (!this.channel) {
        const session = new RabbitSession(this.config);
        this.session = session;
        this.channel = await session.open();
        void session.closed.then(() => {
          if (this.session === session) this.channel = undefined;
        });
      }
      await ConfirmedDelivery.send(this.channel, MessagingTopology.exchange, event.type, Buffer.from(JSON.stringify(event)), {
        contentType: "application/json", messageId: event.eventId, type: event.type,
      });
    } catch {
      await this.close();
      throw new Error("Message broker is unavailable.");
    }
  }

  async close(): Promise<void> {
    this.session?.close();
    this.channel = undefined;
    this.session = undefined;
  }
}
