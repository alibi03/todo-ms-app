import { Router } from "express";

import type AuthController from "../controllers/AuthController";
import { createAuthLimiter } from "../middleware/rateLimiters";

function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post("/register", createAuthLimiter("registration"), controller.register);
  router.post("/login", createAuthLimiter("login"), controller.login);
  return router;
}

export default createAuthRouter;
