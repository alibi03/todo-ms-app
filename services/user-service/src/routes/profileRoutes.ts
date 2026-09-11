import { Router } from "express";

import type ProfileController from "../controllers/ProfileController";
import authenticate from "../middleware/authenticate";
import type { ITokenService } from "../interfaces/services/ITokenService";

function createProfileRouter(
  controller: ProfileController,
  tokens: ITokenService
): Router {
  const router = Router();
  router.get("/", authenticate(tokens), controller.getProfile.bind(controller));
  return router;
}

export default createProfileRouter;
