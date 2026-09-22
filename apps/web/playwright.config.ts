import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = process.env.E2E_PROJECT ?? "";
if (
  process.env.E2E_DISPOSABLE !== "true" ||
  !/^staj-notification-test-web-[a-z0-9-]+$/.test(project)
) {
  throw new Error(
    "Browser tests require E2E_DISPOSABLE=true and a staj-notification-test-web-* Docker project.",
  );
}
const repository = fileURLToPath(new URL("../../", import.meta.url));
const address = execFileSync(
  "docker",
  [
    "compose",
    "-p",
    project,
    "-f",
    "compose.yaml",
    "-f",
    "compose.test.yaml",
    "port",
    "web",
    "8080",
  ],
  { cwd: repository, encoding: "utf8" },
).trim();
if (!/^127\.0\.0\.1:\d+$/.test(address))
  throw new Error("Expected a disposable loopback web port.");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://" + address,
    browserName: "chromium",
    trace: "off",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
});
