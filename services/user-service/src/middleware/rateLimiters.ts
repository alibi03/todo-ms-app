import { rateLimit } from "express-rate-limit";

function createAuthLimiter(operation: "registration" | "login") {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many " + operation + " attempts. Please try again later." },
  });
}

export { createAuthLimiter };
