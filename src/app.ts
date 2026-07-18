import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env, isProd } from "@/config/env";
import { apiRouter } from "@/routes";
import { errorHandler, notFound } from "@/middleware/error";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(isProd ? "combined" : "dev"));

  // Authenticated API data is persona- and relationship-scoped. Keep it out
  // of browser/proxy caches; the frontend owns short-lived in-memory SWR
  // caching and explicit invalidation after workflow mutations.
  app.use("/api", (req, res, next) => {
    if (req.path !== "/health") {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });

  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
