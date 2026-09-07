import { Router } from "express";

import type ProfileController from "../controllers/ProfileController";
import authenticate from "../middleware/authenticate";
import type { TokenServicePort } from "../ports/ServicePorts";

function createProfileRouter(
  controller: ProfileController,
  tokens: Pick<TokenServicePort, "verify">
): Router {
  const router = Router();
  router.get("/", authenticate(tokens), controller.getProfile);
  return router;
}

export default createProfileRouter;
