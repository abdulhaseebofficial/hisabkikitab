const router = require("express").Router();
const { protect } = require("../auth/auth.middleware");
const { limiter } = require("../../shared/middleware/rateLimiter");
const asyncHandler = require("../../shared/http/asyncHandler");
const service = require("./sharedLiving.service");
const respond = (fn) =>
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await fn(req) }),
  );
router.use(protect);
router.get(
  "/spaces",
  respond((r) => service.spaces(r.user._id)),
);
router.post(
  "/spaces",
  respond((r) => service.createSpace(r.user, r.body)),
);
router.post(
  "/join",
  limiter({
    scope: "shared-join",
    windowMs: 900000,
    max: 10,
    text: "shared.rateLimited",
    failClosed: true,
  }),
  respond((r) => service.join(r.user, r.body)),
);
router.patch(
  "/spaces/:space",
  respond((r) => service.editSpace(r.user, r.params.space, r.body)),
);
router.post(
  "/spaces/:space/transfer-ownership",
  respond((r) => service.transferOwnership(r.user, r.params.space, r.body)),
);
router.delete(
  "/spaces/:space/membership",
  respond((r) => service.leaveSpace(r.user, r.params.space)),
);
router.post(
  "/spaces/:space/invite",
  respond((r) => service.rotateInvite(r.user, r.params.space, r.body)),
);
router.get(
  "/spaces/:space/months/:month",
  respond((r) => service.dashboard(r.user, r.params.space, r.params.month)),
);
router.put(
  "/spaces/:space/months/:month",
  respond((r) =>
    service.editPeriod(r.user, r.params.space, r.params.month, r.body),
  ),
);
router.post(
  "/spaces/:space/months/:month/start",
  respond((r) => service.startMonth(r.user, r.params.space, r.params.month)),
);
router.post(
  "/spaces/:space/months/:month/copy-bills",
  respond((r) =>
    service.copyBills(r.user, r.params.space, r.params.month, r.body),
  ),
);
router.post(
  "/spaces/:space/months/:month/preview",
  respond((r) =>
    service.preview(r.user, r.params.space, r.params.month, r.body),
  ),
);
router.get(
  "/spaces/:space/months/:month/bills/:id/receipt",
  asyncHandler(async (r, res) => {
    const image = await service.receipt(
      r.user,
      r.params.space,
      r.params.month,
      r.params.id,
    );
    res
      .set({
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="receipt.png"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      })
      .send(image);
  }),
);
router.post(
  "/spaces/:space/members",
  respond((r) => service.editMember(r.user, r.params.space, null, r.body)),
);
router.patch(
  "/spaces/:space/members/:id",
  respond((r) =>
    service.editMember(r.user, r.params.space, r.params.id, r.body),
  ),
);
router.delete(
  "/spaces/:space/members/:id",
  respond((r) =>
    service.editMember(r.user, r.params.space, r.params.id, r.body, true),
  ),
);
router.post(
  "/spaces/:space/categories",
  respond((r) => service.editCategory(r.user, r.params.space, null, r.body)),
);
router.patch(
  "/spaces/:space/categories/:id",
  respond((r) =>
    service.editCategory(r.user, r.params.space, r.params.id, r.body),
  ),
);
for (const kind of ["expenses", "bills", "payments"]) {
  router.post(
    `/spaces/:space/months/:month/${kind}`,
    respond((r) =>
      service.editFinancial(
        r.user,
        r.params.space,
        r.params.month,
        kind,
        null,
        r.body,
      ),
    ),
  );
  router.patch(
    `/spaces/:space/months/:month/${kind}/:id`,
    respond((r) =>
      service.editFinancial(
        r.user,
        r.params.space,
        r.params.month,
        kind,
        r.params.id,
        r.body,
      ),
    ),
  );
  router.delete(
    `/spaces/:space/months/:month/${kind}/:id`,
    respond((r) =>
      service.editFinancial(
        r.user,
        r.params.space,
        r.params.month,
        kind,
        r.params.id,
        r.body,
        true,
      ),
    ),
  );
}
// Stable translation keys, including constraint failures; never expose SQL or stack traces.
router.use((err, req, res, _next) => {
  const status =
    err.statusCode ||
    (["23505", "23514", "23503", "22P02"].includes(err.code) ? 400 : 500);
  if (status >= 500) console.error("[shared-living]", err.stack || err);
  const key = String(err.message).startsWith("shared.")
    ? err.message
    : "shared.error";
  res.status(status).json({ success: false, message: key });
});
module.exports = router;
