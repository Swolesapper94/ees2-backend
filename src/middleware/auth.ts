import type { NextFunction, Request, Response } from "express";
import { verifySupabaseToken } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";
import { isProd } from "@/config/env";
import { AdministrativeScopeType, type User } from "@prisma/client";

/**
 * Development-only: in-memory users — no database required.
 * Usage: Authorization: Bearer dev:<email>:testpass
 *
 * These match the DEV_PROFILES in frontend/src/lib/auth/dev-login.ts
 */
const DEV_USERS: Record<string, User> = {
  // ── Delta Phase-1 personas (matched to dev-login.ts DEV_PROFILES) ──
  "dev:peter.smith@army.mil:testpass": {
    id: "dev-cpt-smith",
    supabaseId: "dev-cpt-smith",
    email: "peter.smith@army.mil",
    firstName: "Peter",
    lastName: "Smith",
    rank: "CPT",
    mos: "11A",
    roles: ["SOLDIER", "RATER", "SENIOR_RATER", "COMMANDER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:marcus.johnson@army.mil:testpass": {
    id: "dev-ssg-johnson",
    supabaseId: "dev-ssg-johnson",
    email: "marcus.johnson@army.mil",
    firstName: "Marcus",
    lastName: "Johnson",
    rank: "SSG",
    mos: "11B",
    roles: ["SOLDIER", "RATER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:james.davis@army.mil:testpass": {
    id: "dev-sgt-davis",
    supabaseId: "dev-sgt-davis",
    email: "james.davis@army.mil",
    firstName: "James",
    lastName: "Davis",
    rank: "SGT",
    mos: "11B",
    roles: ["SOLDIER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:maria.torres@army.mil:testpass": {
    id: "dev-1lt-torres",
    supabaseId: "dev-1lt-torres",
    email: "maria.torres@army.mil",
    firstName: "Maria",
    lastName: "Torres",
    rank: "FIRST_LT",
    mos: "11A",
    roles: ["SOLDIER", "RATER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:robert.williams@army.mil:testpass": {
    id: "dev-sfc-williams",
    supabaseId: "dev-sfc-williams",
    email: "robert.williams@army.mil",
    firstName: "Robert",
    lastName: "Williams",
    rank: "SFC",
    mos: "11B",
    roles: ["SOLDIER", "RATER", "SENIOR_RATER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:jordan.lee@army.mil:testpass": {
    id: "dev-maj-lee",
    supabaseId: "dev-maj-lee",
    email: "jordan.lee@army.mil",
    firstName: "Jordan",
    lastName: "Lee",
    rank: "MAJ",
    mos: "11A",
    roles: ["SOLDIER", "SENIOR_RATER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:avery.quinn@army.mil:testpass": {
    id: "dev-admin-quinn",
    supabaseId: "dev-admin-quinn",
    email: "avery.quinn@army.mil",
    firstName: "Avery",
    lastName: "Quinn",
    rank: "CPT",
    mos: "42B",
    roles: ["SOLDIER", "ADMIN"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:morgan.reed@army.mil:testpass": {
    id: "dev-reviewer-reed",
    supabaseId: "dev-reviewer-reed",
    email: "morgan.reed@army.mil",
    firstName: "Morgan",
    lastName: "Reed",
    rank: "LTC",
    mos: "11A",
    roles: ["SOLDIER", "REVIEWER", "COMMANDER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:alex.rivera@army.mil:testpass": {
    id: "dev-assistant-rivera",
    supabaseId: "dev-assistant-rivera",
    email: "alex.rivera@army.mil",
    firstName: "Alex",
    lastName: "Rivera",
    rank: "SGT",
    mos: "42A",
    roles: ["SOLDIER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
  "dev:taylor.morgan@army.mil:testpass": {
    id: "dev-assistant-morgan",
    supabaseId: "dev-assistant-morgan",
    email: "taylor.morgan@army.mil",
    firstName: "Taylor",
    lastName: "Morgan",
    rank: "SFC",
    mos: "42A",
    roles: ["SOLDIER"],
    unitId: "dev-unit-505",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as unknown as User,
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

  // Dev mode: resolve identity from the in-memory credential map directly.
  if (!isProd && token in DEV_USERS) {
    const devUser = DEV_USERS[token]!;
    // Existing demo databases may have users created before their stable dev
    // IDs were introduced. Resolve by email so chain queries use the persisted
    // foreign-key identity rather than the in-memory placeholder ID.
    const persistedUser = await prisma.user.findUnique({
      where: { email: devUser.email },
    });
    const user = persistedUser ?? devUser;
    if (user.applicationAccessStatus && user.applicationAccessStatus !== "ACTIVE") {
      res.status(403).json({ error: "EES access is not active" });
      return;
    }
    req.authUserId = user.supabaseId;
    req.user = user;
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
  if (user?.applicationAccessStatus && user.applicationAccessStatus !== "ACTIVE") {
    res.status(403).json({ error: "EES access is not active" });
    return;
  }
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

/** Application administration is separate from rating authority. */
export function requireApplicationAdministrator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!req.user.roles.includes("ADMIN")) {
    res.status(403).json({ error: "Identity and Access Administration requires application administrator access" });
    return;
  }
  next();
}

/**
 * Returns the units an administrator is scoped to. Administrators without
 * explicit scope rows retain the legacy full-administrator scope; once scope
 * rows exist, callers must constrain record queries to the listed units.
 */
export async function administrativeScopeUnitIds(userId: string): Promise<string[] | null> {
  const now = new Date();
  const scopes = await prisma.administrativeScope.findMany({
    where: {
      administratorId: userId,
      scopeType: { in: [AdministrativeScopeType.IDENTITY_ACCESS, AdministrativeScopeType.SERVICING_ADMINISTRATION] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { unitId: true },
  });
  if (scopes.length === 0) return null;
  if (scopes.some((scope) => scope.unitId === null)) return null;
  return scopes.flatMap((scope) => scope.unitId ? [scope.unitId] : []);
}
