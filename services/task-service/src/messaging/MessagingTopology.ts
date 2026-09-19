import type { Channel } from "amqplib";

export class MessagingTopology {
  static readonly exchange = "task.events.v1";
  static readonly queue = "notification.assignments.v1";
  static readonly rejectedQueue = "notification.assignments.rejected.v1";

  static async declare(channel: Channel): Promise<void> {
    await channel.assertExchange(this.exchange, "direct", { durable: true });
    await channel.assertQueue(this.queue, { durable: true, arguments: { "x-queue-type": "classic" } });
    await channel.assertQueue(this.rejectedQueue, { durable: true, arguments: { "x-queue-type": "classic" } });
    await channel.bindQueue(this.queue, this.exchange, "task.assigned");
    await channel.bindQueue(this.queue, this.exchange, "task.reassigned");
  }
}
