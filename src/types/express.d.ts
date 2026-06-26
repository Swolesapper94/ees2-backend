import type { User } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Populated by the auth middleware.
      authUserId?: string; // Supabase auth user id
      user?: User; // EES domain user record
    }
  }
}

export {};
