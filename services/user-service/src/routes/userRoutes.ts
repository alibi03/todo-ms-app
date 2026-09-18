import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { UserLookupController } from "../controllers/UserLookupController";
import type { ITokenService } from "../interfaces/services/ITokenService";
import authenticate from "../middleware/authenticate";

function createUserRouter(controller: UserLookupController, tokens: ITokenService): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
    message: { message: "Too many user lookup requests. Please try again later." },
  }));
  router.use(authenticate(tokens));
  router.get("/:id", controller.getUser.bind(controller));
  return router;
}

export default createUserRouter;
