import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type TaskController from "../controllers/TaskController";
import type { IUserServiceClient } from "../interfaces/services/IUserServiceClient";
import authenticate from "../middleware/authenticate";

function createTaskRouter(controller: TaskController, users: IUserServiceClient): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many task requests. Please try again later." },
  }));
  router.use(authenticate(users));
  router.post("/", controller.create.bind(controller));
  router.get("/", controller.list.bind(controller));
  return router;
}

export default createTaskRouter;
