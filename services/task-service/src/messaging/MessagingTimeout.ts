export class MessagingTimeout {
  static async run<T>(operation: Promise<T>, milliseconds = 5000): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Messaging operation timed out.")), milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
