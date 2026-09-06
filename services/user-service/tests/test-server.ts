import { once } from "node:events";
import type { Express } from "express";

async function withServer(
  app: Express,
  check: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP port.");
    }

    await check("http://127.0.0.1:" + String(address.port));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

export default withServer;
