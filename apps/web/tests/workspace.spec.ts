import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { controlTaskService } from "./docker";

type Account = { id: number; email: string; password: string; token: string };
let owner: Account;
let assignee: Account;
let other: Account;

async function account(
  request: APIRequestContext,
  name: string,
): Promise<Account> {
  const email =
    name.toLowerCase().replace(/\s+/g, "-") +
    "-" +
    randomUUID() +
    "@example.test";
  const password = randomUUID();
  const registration = await request.post("/api/auth/register", {
    data: { username: name + "-" + randomUUID().slice(0, 8), email, password },
  });
  expect(registration.status()).toBe(201);
  const { user } = await registration.json();
  const login = await request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  return { id: user.id, email, password, token };
}

async function restore(page: Page, user: Account) {
  await page.addInitScript(
    (token) => sessionStorage.setItem("task-workspace-token", token),
    user.token,
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^Welcome,/ })).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  owner = await account(request, "Owner");
  assignee = await account(request, "Assignee");
  other = await account(request, "Other");
});

test("proxy preserves API status codes and rejects unknown API paths", async ({
  request,
}) => {
  for (const path of [
    "/api/profile",
    "/api/tasks",
    "/api/tasks/",
    "/api/notifications",
    "/api/notifications/",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/json");
  }
  expect((await request.get("/api/unknown")).status()).toBe(404);
  expect((await request.get("/health")).status()).toBe(200);
  const html = await request.get("/");
  expect(html.headers()["content-security-policy"]).toContain(
    "script-src 'self'",
  );
});

test("register, sign in, assign, update status, reassign, clear fields and delete", async ({
  page,
  browser,
  request,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = "browser-" + randomUUID() + "@example.test";
  const password = randomUUID();
  await page.goto("/");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page
    .getByLabel("Username")
    .fill("Browser owner-" + randomUUID().slice(0, 8));
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Account created");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /^Welcome, Browser owner/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /^Welcome, Browser owner/ }),
  ).toBeVisible();

  const form = page.getByRole("form", { name: "Create task", exact: true });
  await form.getByLabel("Title", { exact: true }).fill("Prepare <demo>");
  await form.getByLabel("Description").fill("<script>alert('test')</script>");
  await form.getByLabel("Assignee user ID").fill(String(assignee.id));
  await form.getByLabel("Due date").fill("2026-12-31");
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks") &&
        response.request().method() === "POST",
    ),
    form.getByRole("button", { name: "Create task", exact: true }).click(),
  ]);
  expect(created.status()).toBe(201);
  const { task } = await created.json();
  const card = page.getByRole("article", {
    name: "Task " + task.id + ": Prepare <demo>",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(
    card.getByText("<script>alert('test')</script>", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });

  const memberContext = await browser.newContext({ baseURL });
  const otherContext = await browser.newContext({ baseURL });
  try {
    const memberPage = await memberContext.newPage();
    const otherPage = await otherContext.newPage();
    await restore(memberPage, assignee);
    await restore(otherPage, other);
    const memberCard = memberPage
      .getByRole("article")
      .filter({ hasText: "Prepare <demo>" });
    await expect(
      memberCard.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
    await memberCard.getByRole("button", { name: "Update status" }).click();
    await expect(memberCard.getByLabel("Title", { exact: true })).toHaveCount(
      0,
    );
    await memberCard
      .getByLabel("Status", { exact: true })
      .selectOption("in_progress");
    await memberCard.getByRole("button", { name: "Save changes" }).click();
    await expect(memberCard.locator(".status")).toHaveText("In progress");
    expect(
      (
        await request.patch("/api/tasks/" + task.id, {
          headers: { Authorization: "Bearer " + assignee.token },
          data: { title: "Forbidden" },
        })
      ).status(),
    ).toBe(403);

    await expect(async () => {
      await memberPage
        .getByRole("complementary", { name: "Notifications" })
        .getByRole("button", { name: "Refresh" })
        .click();
      await expect(
        memberPage
          .getByRole("complementary")
          .getByText("Prepare <demo>", { exact: true }),
      ).toBeVisible();
    }).toPass({ timeout: 25_000, intervals: [500, 1000] });
    await expect(otherPage.getByText("No tasks yet.")).toBeVisible();
    await expect(
      otherPage.getByText("No assignment notifications yet."),
    ).toBeVisible();

    await page
      .getByRole("region", { name: "Tasks", exact: true })
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await expect(card.locator(".status")).toHaveText("In progress");
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await card.getByLabel("Title", { exact: true }).fill("Updated demo");
    await card.getByLabel("Assignee user ID").fill(String(other.id));
    await card.getByLabel("Due date").fill("");
    await card.getByRole("button", { name: "Save changes" }).click();
    const updatedCard = page
      .getByRole("article")
      .filter({ hasText: "Updated demo" });
    await expect(
      updatedCard.getByText("Not set", { exact: true }),
    ).toBeVisible();
    await expect(async () => {
      await otherPage
        .getByRole("complementary")
        .getByRole("button", { name: "Refresh" })
        .click();
      await expect(
        otherPage
          .getByRole("complementary")
          .getByText("Updated demo", { exact: true }),
      ).toBeVisible();
    }).toPass({ timeout: 25_000, intervals: [500, 1000] });

    await memberPage
      .getByRole("region", { name: "Tasks", exact: true })
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await expect(memberPage.getByText("No tasks yet.")).toBeVisible();
    await updatedCard
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await updatedCard.getByLabel("Assignee user ID").fill("");
    await updatedCard.getByRole("button", { name: "Save changes" }).click();
    await expect(
      updatedCard.getByText("Unassigned", { exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await updatedCard
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(updatedCard).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    expect(
      await page.evaluate(() => sessionStorage.getItem("task-workspace-token")),
    ).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await memberContext.close();
    await otherContext.close();
  }
});

test("task and notification pagination stay unique after task creation", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const recipient = await account(request, "Pagination recipient");
  for (let index = 1; index <= 21; index++) {
    const response = await request.post("/api/tasks", {
      headers: { Authorization: "Bearer " + owner.token },
      data: { title: "Pagination " + index, assignedToUserId: recipient.id },
    });
    expect(response.status()).toBe(201);
  }
  await restore(page, owner);
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("button", { name: "Load more tasks" }).click();
  await expect(page.getByRole("article")).toHaveCount(21);
  const form = page.getByRole("form", { name: "Create task", exact: true });
  await form
    .getByLabel("Title", { exact: true })
    .fill("Created after pagination");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Load more tasks" }).click();
  await expect(page.getByRole("article")).toHaveCount(22);
  const names = await page
    .getByRole("article")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    );
  expect(new Set(names).size).toBe(22);

  const context = await browser.newContext({ baseURL });
  try {
    const memberPage = await context.newPage();
    await restore(memberPage, recipient);
    const notifications = memberPage.getByRole("complementary");
    await expect(async () => {
      await notifications.getByRole("button", { name: "Refresh" }).click();
      await expect(notifications.getByRole("listitem")).toHaveCount(20);
    }).toPass({ timeout: 25_000, intervals: [500, 1000] });
    await notifications
      .getByRole("button", { name: "Load older notifications" })
      .click();
    await expect(notifications.getByRole("listitem")).toHaveCount(21);
    const entries = await notifications.getByRole("listitem").allTextContents();
    expect(new Set(entries).size).toBe(21);
  } finally {
    await context.close();
  }
});

test("invalid sessions return to sign in and clear stored credentials", async ({
  page,
}) => {
  await restore(page, other);
  await page.route("**/api/tasks?*", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Expired." }),
    }),
  );
  await page
    .getByRole("region", { name: "Tasks", exact: true })
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("session has expired");
  expect(
    await page.evaluate(() => sessionStorage.getItem("task-workspace-token")),
  ).toBeNull();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("outages preserve a restorable session and malformed data shows a safe error", async ({
  page,
}) => {
  await page.addInitScript(
    (token) => sessionStorage.setItem("task-workspace-token", token),
    owner.token,
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Internal connection detail" }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Unable to load your account" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Boolean(sessionStorage.getItem("task-workspace-token")),
    ),
  ).toBe(true);
  await expect(page.getByRole("alert")).not.toContainText("Internal");
  await page.unroute("**/api/profile");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome, Owner/ }),
  ).toBeVisible();

  await page.route("**/api/tasks?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Bad gateway",
    }),
  );
  await page
    .getByRole("region", { name: "Tasks", exact: true })
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Tasks", exact: true }).getByRole("alert"),
  ).toContainText("temporarily unavailable");
  await page.route("**/api/notifications?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [{ occurredAt: "invalid" }] }),
    }),
  );
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "Refresh" })
    .click();
  await expect(
    page.getByRole("complementary").getByRole("alert"),
  ).toContainText("unexpected response");
});

test("proxy recovers after the task container is recreated", async ({
  page,
}) => {
  await restore(page, other);
  const tasks = page.getByRole("region", { name: "Tasks", exact: true });
  await expect(tasks.getByText("No tasks yet.")).toBeVisible();
  try {
    await controlTaskService("stop");
    await tasks.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(tasks.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
  } finally {
    await controlTaskService("recreate");
  }
  await expect(async () => {
    await tasks.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(tasks.getByRole("alert")).toHaveCount(0);
    await expect(tasks.getByText("No tasks yet.")).toBeVisible();
  }).toPass({ timeout: 20_000, intervals: [1000] });
});

test("a delayed response from the old account cannot expire a new session", async ({
  page,
}) => {
  await restore(page, owner);
  let release: () => void = () => {};
  let started: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/tasks", async (route) => {
    started();
    await gate;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"message":"Expired."}',
    });
  });
  try {
    const form = page.getByRole("form", { name: "Create task", exact: true });
    await form.getByLabel("Title", { exact: true }).fill("Delayed request");
    await form
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await pending;
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email", { exact: true }).fill(other.email);
    await page.getByLabel("Password", { exact: true }).fill(other.password);
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /^Welcome, Other/ }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/tasks") && result.status() === 401,
    );
    release();
    await response;
    await expect(
      page.getByRole("heading", { name: /^Welcome, Other/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Boolean(sessionStorage.getItem("task-workspace-token")),
      ),
    ).toBe(true);
  } finally {
    release();
  }
});

test("mobile layout remains usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await restore(page, owner);
  await expect(
    page.getByRole("form", { name: "Create task", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
});
