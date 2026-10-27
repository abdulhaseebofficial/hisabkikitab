/**
 * Production Financial Idempotency Service for HisabKi Kitab Business Mode.
 *
 * Scopes keys to (business_id, request_id) with user_id and operation audit.
 * Guarantees that:
 * 1. Network retries with the same key and payload safely replay the authoritative result.
 * 2. Reuse of a key with a different payload or different action is strictly rejected (409 Conflict).
 * 3. Concurrent double-posting is prevented via atomic database row claim and status locking.
 * 4. Mutations that fail rollback atomically without leaving poisoned keys.
 */

const crypto = require('node:crypto');
const { getPool } = require('../../infrastructure/database/pool');
const ApiError = require('../../shared/errors/ApiError');

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Deterministically sorts object keys for canonical cryptographic hashing.
 */
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object' && !(value instanceof Date)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
      : value;

const hashPayload = (payload) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(payload) || {}))
    .digest('hex');

/**
 * Executes a financial business mutation idempotently within an isolated database transaction.
 */
const runBusinessIdempotent = async ({
  businessId,
  userId,
  action,
  key,
  payload,
  perform,
  existingClient = null,
}) => {
  if (!businessId) throw ApiError.badRequest('businessId is required for business idempotency');
  if (!userId) throw ApiError.badRequest('userId is required for business idempotency');
  if (!action) throw ApiError.badRequest('action name is required for business idempotency');

  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!KEY_PATTERN.test(normalizedKey)) {
    throw ApiError.badRequest('A UUID Idempotency-Key header is required');
  }

  const requestHash = hashPayload(payload);
  const client = existingClient || (await getPool().connect());
  const managesTransaction = !existingClient;

  try {
    if (managesTransaction) {
      await client.query('BEGIN');
    }

    // 1. Attempt atomic reservation of this idempotency key for this business
    const claimRes = await client.query(
      `INSERT INTO biz_financial_requests (
        business_id, user_id, request_id, action, request_hash, status
      ) VALUES ($1, $2, $3, $4, $5, 'processing')
      ON CONFLICT (business_id, request_id) DO NOTHING
      RETURNING request_id`,
      [businessId, userId, normalizedKey, action, requestHash]
    );

    const hasClaim = claimRes.rows.length > 0;

    if (!hasClaim) {
      // 2. Conflict or Replay: Inspect the prior execution under row lock
      const priorRes = await client.query(
        `SELECT user_id, action, request_hash, status, result
         FROM biz_financial_requests
         WHERE business_id = $1 AND request_id = $2
         FOR UPDATE`,
        [businessId, normalizedKey]
      );

      const prior = priorRes.rows[0];

      if (!prior) {
        throw ApiError.conflict('Idempotency lock conflict. Please retry the request.');
      }

      if (prior.action !== action || prior.request_hash !== requestHash) {
        throw ApiError.conflict('Idempotency key was already used for a different request');
      }

      if (prior.status === 'processing') {
        throw ApiError.conflict('A concurrent mutation with this idempotency key is already in progress');
      }

      if (prior.status === 'completed' && prior.result !== null) {
        if (managesTransaction) await client.query('COMMIT');
        return { value: prior.result, replayed: true };
      }

      throw ApiError.conflict('The original operation with this idempotency key could not be replayed');
    }

    // 3. Execute the actual mutation callback
    const value = await perform(client);

    if (value === undefined || value === null) {
      throw new Error('Financial mutation did not return a valid result');
    }

    // 4. Record authoritative outcome and mark as completed
    await client.query(
      `UPDATE biz_financial_requests
       SET status = 'completed', result = $1::jsonb, updated_at = now()
       WHERE business_id = $2 AND request_id = $3`,
      [JSON.stringify(value), businessId, normalizedKey]
    );

    if (managesTransaction) {
      await client.query('COMMIT');
    }

    return { value, replayed: false };
  } catch (err) {
    if (managesTransaction) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (managesTransaction) {
      client.release();
    }
  }
};

module.exports = {
  KEY_PATTERN,
  canonical,
  hashPayload,
  runBusinessIdempotent,
};
