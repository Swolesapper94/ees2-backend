import { createApp } from "@/app";
import { env } from "@/config/env";
import { runAccessGrantLifecycleSweep } from "@/lib/access-assistance/scheduler";
import { runMilestoneNudgeSweep } from "@/lib/milestones/scheduler";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ees2-backend] listening on http://localhost:${env.port}`);
});

// Proactive milestone-overdue nudges (product-research gap fix, 2026-07-06):
// previously `Notifications.milestoneOverdue()` only ever fired from a
// manual dev-test route — nothing scanned for overdue milestones on its
// own. Run once at startup, then on a fixed interval.
const MILESTONE_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

function sweep() {
  runMilestoneNudgeSweep()
    .then(({ scanned, notified }) => {
      if (notified > 0) {
        // eslint-disable-next-line no-console
        console.log(`[milestone-sweep] scanned ${scanned}, notified ${notified}`);
      }
    })
    // eslint-disable-next-line no-console
    .catch((err) => console.error("[milestone-sweep] failed", err));
}

sweep();
setInterval(sweep, MILESTONE_SWEEP_INTERVAL_MS);

function sweepAccessGrants() {
  runAccessGrantLifecycleSweep()
    .then(({ expired, expiringNotified }) => {
      if (expired > 0 || expiringNotified > 0) {
        // eslint-disable-next-line no-console
        console.log(`[access-grant-sweep] expired ${expired}, sent ${expiringNotified} expiring notices`);
      }
    })
    // eslint-disable-next-line no-console
    .catch((err) => console.error("[access-grant-sweep] failed", err));
}

sweepAccessGrants();
setInterval(sweepAccessGrants, MILESTONE_SWEEP_INTERVAL_MS);
