import { Router } from "express";
import { usersRouter } from "./users";
import { identityAccessRouter } from "./identity-access";
import { unitsRouter } from "./units";
import { ratingChainsRouter } from "./rating-chains";
import { ratingSchemeAssignmentsRouter } from "./rating-scheme-assignments";
import { supportFormsRouter } from "./support-forms";
import { evaluationsRouter } from "./evaluations";
import { pdfRouter } from "./pdf";
import { dashboardRouter } from "./dashboard";
import { milestonesRouter } from "./milestones";
import { delegatesRouter } from "./delegates";
import { accessGrantsRouter } from "./access-grants";
import { analyticsRouter } from "./analytics";
import { commanderRouter } from "./commander";
import { commentsRouter } from "./comments";
import { notificationsRouter } from "./notifications";
import { supportRouter } from "./support";
import { devRouter } from "./dev";
import { supportFormUploadsRouter } from "./support-form-uploads";
import { regulationsRouter } from "./regulations";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ees2-backend" });
});

apiRouter.use("/users", usersRouter);
apiRouter.use("/admin/identity-access", identityAccessRouter);
apiRouter.use("/units", unitsRouter);
apiRouter.use("/rating-chains", ratingChainsRouter);
apiRouter.use("/rating-scheme-assignments", ratingSchemeAssignmentsRouter);
apiRouter.use("/support-forms", supportFormsRouter);
apiRouter.use("/evaluations", evaluationsRouter);
apiRouter.use("/evaluations/:evalId/comments", commentsRouter);
apiRouter.use("/pdf", pdfRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/milestones", milestonesRouter);
apiRouter.use("/delegates", delegatesRouter);
apiRouter.use("/access-grants", accessGrantsRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/commander", commanderRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/support", supportRouter);
apiRouter.use("/dev", devRouter);
apiRouter.use("/support-form-uploads", supportFormUploadsRouter);
apiRouter.use("/regulations", regulationsRouter);
