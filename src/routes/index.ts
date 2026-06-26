import { Router } from "express";
import { usersRouter } from "./users";
import { unitsRouter } from "./units";
import { ratingChainsRouter } from "./rating-chains";
import { supportFormsRouter } from "./support-forms";
import { evaluationsRouter } from "./evaluations";
import { aiRouter } from "./ai";
import { pdfRouter } from "./pdf";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ees2-backend" });
});

apiRouter.use("/users", usersRouter);
apiRouter.use("/units", unitsRouter);
apiRouter.use("/rating-chains", ratingChainsRouter);
apiRouter.use("/support-forms", supportFormsRouter);
apiRouter.use("/evaluations", evaluationsRouter);
apiRouter.use("/ai", aiRouter);
apiRouter.use("/pdf", pdfRouter);
