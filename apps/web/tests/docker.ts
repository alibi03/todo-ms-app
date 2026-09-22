import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);

export async function controlTaskService(
  action: "stop" | "recreate",
): Promise<void> {
  const project = process.env.E2E_PROJECT ?? "";
  if (
    process.env.E2E_DISPOSABLE !== "true" ||
    !/^staj-notification-test-web-[a-z0-9-]+$/.test(project)
  ) {
    throw new Error(
      "Service control is restricted to the disposable web test project.",
    );
  }
  const command =
    action === "stop"
      ? ["stop", "task-service"]
      : [
          "up",
          "-d",
          "--no-deps",
          "--force-recreate",
          "--wait",
          "--wait-timeout",
          "45",
          "task-service",
        ];
  await execute(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "compose.yaml",
      "-f",
      "compose.test.yaml",
      ...command,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      timeout: 60_000,
    },
  );
}
