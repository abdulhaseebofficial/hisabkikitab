/**
 * Middleware for Multi-Business Authorization and Membership Scoping.
 */

const BusinessRepository = require('./business.repository');

const requireBusinessMember = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.body?.businessId || req.query?.businessId;
    if (!businessId) {
      return res.status(400).json({ success: false, message: 'Business ID is required' });
    }

    const membership = await BusinessRepository.getMembership(businessId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this business' });
    }

    // Demo safety check: Demo user cannot perform write mutations
    if (req.user.isDemo && req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(403).json({ success: false, message: 'Demo Mode is read-only' });
    }

    req.businessId = businessId;
    req.businessMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

const requireBusinessRole = (allowedRoles = []) => (req, res, next) => {
  if (!req.businessMembership) {
    return res.status(403).json({ success: false, message: 'Unauthorized business access' });
  }

  const role = req.businessMembership.role;
  if (!allowedRoles.includes(role) && role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Insufficient business permissions' });
  }

  next();
};

module.exports = {
  requireBusinessMember,
  requireBusinessRole,
};
