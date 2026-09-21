import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { NotificationController } from "../controllers/NotificationController";
import type { IUserServiceClient } from "../interfaces/services/IUserServiceClient";
import { authenticate } from "../middleware/authenticate";

export function createNotificationRouter(controller: NotificationController, userServiceClient: IUserServiceClient): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many notification requests. Please try again later." },
  }));
  router.use(authenticate(userServiceClient));
  router.get("/", controller.list.bind(controller));
  return router;
}
