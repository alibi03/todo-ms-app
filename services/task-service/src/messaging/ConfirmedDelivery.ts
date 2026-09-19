import type { ConfirmChannel, Message, Options } from "amqplib";
import { MessagingTimeout } from "./MessagingTimeout";

export class ConfirmedDelivery {
  static async send(channel: ConfirmChannel, exchange: string, key: string, content: Buffer, options: Options.Publish): Promise<void> {
    let returned = false;
    const onReturn = (_message: Message): void => { returned = true; };
    channel.on("return", onReturn);
    try {
      // Each channel sends one message at a time and waits for its broker confirmation.
      await MessagingTimeout.run(new Promise<void>((resolve, reject) => {
        channel.publish(exchange, key, content, { ...options, persistent: true, mandatory: true }, error => {
          if (error || returned) reject(new Error("Message delivery was not confirmed."));
          else resolve();
        });
      }));
    } finally {
      channel.removeListener("return", onReturn);
    }
  }
}
