import { z } from "zod";
import { ApiError } from "../errors/ApiError";

const errorResponseSchema = z.object({ message: z.string().min(1) });

export class ApiClient {
  constructor(
    private readonly token?: string,
    private readonly onSessionExpired?: () => void,
  ) {}

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", "Bearer " + this.token);
    const timeout = AbortSignal.timeout(10_000);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;

    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(path, {
        ...init,
        headers,
        signal,
        cache: "no-store",
        redirect: "error",
      });
      if (response.status === 401 && this.token) this.onSessionExpired?.();
      payload =
        response.status === 204
          ? undefined
          : response.headers.get("content-type")?.includes("application/json")
            ? await response.json()
            : null;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError(
        "The service could not be reached. Please try again.",
        0,
      );
    }
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(payload);
      const message =
        response.status >= 500
          ? "The service is temporarily unavailable. Please try again."
          : parsed.success
            ? parsed.data.message
            : "The request could not be completed.";
      throw new ApiError(message, response.status);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new ApiError(
        "The service returned an unexpected response. Please try again.",
        502,
      );
    return parsed.data;
  }
}
