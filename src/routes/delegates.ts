import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { Notifications } from "@/lib/notifications/create";

export const delegatesRouter = Router();

// GET /api/delegates — my active delegates and who I'm a delegate for
delegatesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");

    const [myDelegates, delegatedTo] = await Promise.all([
      prisma.delegate.findMany({
        where: { principalId: req.user.id, isActive: true },
        include: {
          delegateUser: {
            select: { id: true, firstName: true, lastName: true, rank: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.delegate.findMany({
        where: { delegateUserId: req.user.id, isActive: true },
        include: {
          principal: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rank: true,
              unit: true,
              ratedOnChains: {
                where: { isActive: true },
                take: 1,
                select: {
                  id: true,
                  evaluations: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { id: true, status: true, periodEnd: true, formType: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({ myDelegates, delegatedTo });
  }),
);

const createDelegateSchema = z.object({
  delegateUserId: z.string().min(1),
  accessLevel: z.enum(["VIEW_ONLY", "PUSH_ALONG"]).default("VIEW_ONLY"),
  effectiveDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional(),
  appointedReason: z.string().optional(),
});

// POST /api/delegates — appoint a delegate
delegatesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = createDelegateSchema.parse(req.body);

    if (body.delegateUserId === req.user.id) {
      throw new HttpError(400, "Cannot appoint yourself as a delegate");
    }

    const delegate = await prisma.delegate.upsert({
      where: { principalId_delegateUserId: { principalId: req.user.id, delegateUserId: body.delegateUserId } },
      update: { ...body, isActive: true },
      create: { principalId: req.user.id, ...body },
      include: {
        delegateUser: { select: { id: true, firstName: true, lastName: true, rank: true } },
        principal: { select: { firstName: true, lastName: true, rank: true } },
      },
    });

    // Notify the appointed delegate
    const principalName = `${(delegate as typeof delegate & { principal: { rank: string; firstName: string; lastName: string } }).principal.rank} ${(delegate as typeof delegate & { principal: { firstName: string; lastName: string } }).principal.firstName} ${(delegate as typeof delegate & { principal: { firstName: string; lastName: string } }).principal.lastName}`;
    await Notifications.delegateAppointed(body.delegateUserId, principalName, body.accessLevel);

    res.status(201).json(delegate);
  }),
);

const updateDelegateSchema = z.object({
  accessLevel: z.enum(["VIEW_ONLY", "PUSH_ALONG"]).optional(),
  expiryDate: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/delegates/:id
delegatesRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateDelegateSchema.parse(req.body);
    const delegate = await prisma.delegate.findUnique({ where: { id: req.params.id } });
    if (!delegate) throw new HttpError(404, "Delegate not found");
    if (delegate.principalId !== req.user?.id) throw new HttpError(403, "Forbidden");

    const updated = await prisma.delegate.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json(updated);
  }),
);

// DELETE /api/delegates/:id — revoke
delegatesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const delegate = await prisma.delegate.findUnique({ where: { id: req.params.id } });
    if (!delegate) throw new HttpError(404, "Delegate not found");
    if (delegate.principalId !== req.user?.id) throw new HttpError(403, "Forbidden");

    const fullDelegate = await prisma.delegate.findUnique({
      where: { id: req.params.id },
      include: { principal: { select: { firstName: true, lastName: true, rank: true } } },
    });
    await prisma.delegate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    // Notify the delegate their access was revoked
    if (fullDelegate) {
      const principalName = `${fullDelegate.principal.rank} ${fullDelegate.principal.firstName} ${fullDelegate.principal.lastName}`;
      await Notifications.delegateRevoked(delegate.delegateUserId, principalName);
    }
    res.status(204).send();
  }),
);

// POST /api/delegates/:id/remind — send chain reminder (PUSH_ALONG only)
delegatesRouter.post(
  "/:id/remind",
  requireAuth,
  asyncHandler(async (req, res) => {
    const delegate = await prisma.delegate.findUnique({
      where: { id: req.params.id },
      include: { principal: { select: { firstName: true, lastName: true } } },
    });
    if (!delegate) throw new HttpError(404, "Delegate not found");
    if (delegate.delegateUserId !== req.user?.id) throw new HttpError(403, "Forbidden");
    if (delegate.accessLevel !== "PUSH_ALONG") throw new HttpError(403, "PUSH_ALONG access required");

    // Log the reminder action in audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "DELEGATE_REMINDER_SENT",
        entityType: "Delegate",
        entityId: delegate.id,
        details: {
          principalName: `${delegate.principal.firstName} ${delegate.principal.lastName}`,
          message: "Delegate flagged eval as needing attention",
        },
      },
    });

    res.json({ success: true, message: "Reminder logged" });
  }),
);
