import type { ConsumeMessage } from "amqplib";
import { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { RequestValidator } from "../utils/RequestValidator";

export class EventValidator {
  static async parse(message: ConsumeMessage): Promise<TaskAssignmentEventDto> {
    if (message.content.length > 16384 || message.properties.contentType !== "application/json") {
      throw new Error("Invalid event envelope.");
    }
    const value: unknown = JSON.parse(message.content.toString("utf8"));
    const event = await RequestValidator.validate(TaskAssignmentEventDto, value);
    if (event.eventId !== message.properties.messageId || event.type !== message.properties.type
      || event.type !== message.fields.routingKey) throw new Error("Invalid event metadata.");
    return event;
  }
}
