import { createApp } from "@/app";
import { env } from "@/config/env";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ees2-backend] listening on http://localhost:${env.port}`);
});
