const crypto = require('node:crypto');
const { transaction } = require('../../infrastructure/database/pool');
const ApiError = require('../errors/ApiError');
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' && !(value instanceof Date)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;

const requireKey = (req, _res, next) => {
  const key = req.get('Idempotency-Key');
  if (!KEY_PATTERN.test(key || '')) {
    return next(ApiError.badRequest('A UUID Idempotency-Key header is required'));
  }
  req.financialRequestKey = key.toLowerCase();
  next();
};

const run = (userId, action, key, payload, perform) => {
  if (!KEY_PATTERN.test(key || '')) throw ApiError.badRequest('A UUID Idempotency-Key header is required');
  const requestHash = crypto.createHash('sha256')
    .update(JSON.stringify(canonical(payload))).digest('hex');
  return transaction(async tx => {
    const claim = await tx.queryOne(
      `INSERT INTO financial_requests(user_id,request_id,action,request_hash)
       VALUES($1,$2,$3,$4) ON CONFLICT (user_id,request_id) DO NOTHING RETURNING request_id`,
      [userId, key, action, requestHash]
    );
    if (!claim) {
      const prior = await tx.queryOne(
        'SELECT action,request_hash,result FROM financial_requests WHERE user_id=$1 AND request_id=$2',
        [userId, key]
      );
      if (!prior || prior.action !== action || prior.request_hash !== requestHash || prior.result === null)
        throw ApiError.conflict('Idempotency key was already used for a different request');
      return { value: prior.result, replayed: true };
    }
    const value = await perform(tx);
    if (value === undefined || value === null)
      throw new Error('Financial mutation did not return a result');
    await tx.query(
      'UPDATE financial_requests SET result=$3::jsonb WHERE user_id=$1 AND request_id=$2',
      [userId, key, JSON.stringify(value)]
    );
    return { value, replayed: false };
  });
};

module.exports = { requireKey, run };
