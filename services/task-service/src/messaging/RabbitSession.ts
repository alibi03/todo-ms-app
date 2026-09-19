import { connect, type ConfirmChannel } from "amqplib";
import type { BrokerConfig } from "../config/broker";
import { MessagingTimeout } from "./MessagingTimeout";
import { MessagingTopology } from "./MessagingTopology";

export class RabbitSession {
  private readonly abort = new AbortController();
  private finish!: () => void;
  readonly closed = new Promise<void>(resolve => { this.finish = resolve; });

  constructor(private readonly config: BrokerConfig) {}

  async open(): Promise<ConfirmChannel> {
    try {
      const socketOptions = { timeout: 5000, signal: this.abort.signal };
      const connection = await connect({ ...this.config, protocol: "amqp", heartbeat: 5 }, socketOptions);
      connection.on("error", () => this.close());
      connection.on("close", () => this.close());
      const channel = await MessagingTimeout.run(connection.createConfirmChannel());
      channel.on("error", () => this.close());
      channel.on("close", () => this.close());
      await MessagingTimeout.run(MessagingTopology.declare(channel));
      return channel;
    } catch {
      this.close();
      throw new Error("Message broker is unavailable.");
    }
  }

  close(): void {
    this.abort.abort();
    this.finish();
  }
}
