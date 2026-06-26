import type { NextFunction, Request, Response } from "express";
import { verifySupabaseToken } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";
import { isProd } from "@/config/env";

/**
 * Development-only: Maps test credentials to database users.
 * Passwords are Base64(email:password) for simplicity in dev.
 * Usage: Authorization: Bearer dev:james.smith@army.mil:testpass
 */
const DEV_CREDENTIALS: Record<string, string> = {
  "dev:james.smith@army.mil:testpass": "seed-soldier-smith",
  "dev:robert.jones@army.mil:testpass": "seed-rater-jones",
  "dev:david.davis@army.mil:testpass": "seed-sr-davis",
  "dev:patricia.brown@army.mil:testpass": "seed-admin-brown",
};

/**
 * Verifies the Supabase bearer token and attaches the EES user to the request.
 * In dev mode, also accepts simple test credentials: dev:email:password
 * Responds 401 when the token is missing or invalid.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  // Dev mode: allow test credentials
  if (!isProd && token in DEV_CREDENTIALS) {
    const supabaseId = DEV_CREDENTIALS[token];
    req.authUserId = supabaseId;
    const user = await prisma.user.findUnique({
      where: { supabaseId },
    });
    if (user) req.user = user;
    next();
    return;
  }

  // Production: verify real Supabase token
  const authUser = await verifySupabaseToken(token);
  if (!authUser) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.authUserId = authUser.id;
  const user = await prisma.user.findUnique({
    where: { supabaseId: authUser.id },
  });
  if (user) req.user = user;

  next();
}

/**
 * Restricts a route to users holding at least one of the given roles.
 * Must run after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const hasRole = req.user.roles.some((r) => roles.includes(r));
    if (!hasRole) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}
