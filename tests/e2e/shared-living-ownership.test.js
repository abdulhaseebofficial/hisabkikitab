const crypto = require('node:crypto');
const { ok, section, report, requireApi } = require('./helpers');

const base = process.env.HW_API || 'http://localhost:5000/api';
const request = async (method, path, body, token) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
};

(async () => {
  await requireApi();
  section('SHARED LIVING OWNERSHIP TRANSFER AND ACCOUNT EXIT');
  const password = 'OwnershipTest123!';
  const register = async (name) => {
    const response = await request('POST', '/auth/register', {
      name, email: `ownership-${crypto.randomUUID()}@example.test`, password,
      confirmPassword: password, acceptTerms: true,
    });
    return { response, token: response.data?.data?.accessToken };
  };
  const owner = await register('Ownership API Owner');
  const successor = await register('Ownership API Successor');
  ok('owner and successor accounts register', owner.response.status === 201 && successor.response.status === 201);
  if (!owner.token || !successor.token) { report(); return; }
  const created = await request('POST', '/shared-living/spaces', {
    name: 'API Ownership Space', currency: 'PKR', residents: 1,
    members: ['Historical resident'], month: new Date().toISOString().slice(0, 7),
  }, owner.token);
  const space = created.data?.data;
  ok('owner creates space', created.status === 200 && !!space?.id && space.owner_id === owner.response.data.data.user._id);
  if (!space?.id) { report(); return; }
  const joined = await request('POST', '/shared-living/join', { code: space.invite.code }, successor.token);
  ok('successor joins the same space', joined.status === 200 && joined.data?.data?.space_id === space.id);

  const blocked = await request('DELETE', '/profile', { password }, owner.token);
  ok('account deletion returns actionable transfer conflict', blocked.status === 409 && blocked.data?.message === 'shared.ownerTransferBeforeDelete');
  const spaces = await request('GET', '/shared-living/spaces', undefined, owner.token);
  ok('owner receives eligible same-space successor', spaces.status === 200 && spaces.data.data.find((row) => row.id === space.id)?.eligible_successors?.some((row) => row.user_id === successor.response.data.data.user._id));

  const transferred = await request('POST', `/shared-living/spaces/${space.id}/transfer-ownership`, {
    successor_user_id: successor.response.data.data.user._id,
  }, owner.token);
  ok('owner transfers to active member', transferred.status === 200 && transferred.data?.data?.owner_id === successor.response.data.data.user._id);
  const retried = await request('POST', `/shared-living/spaces/${space.id}/transfer-ownership`, {
    successor_user_id: successor.response.data.data.user._id,
  }, owner.token);
  ok('former owner retry is denied without a second transfer', retried.status === 403);
  const left = await request('DELETE', `/shared-living/spaces/${space.id}/membership`, undefined, owner.token);
  ok('former owner leaves after transfer', left.status === 200 && left.data?.data?.left === true);
  const deleted = await request('DELETE', '/profile', { password }, owner.token);
  ok('account deletion succeeds after transfer and leave', deleted.status === 200);

  const ownerSpaces = await request('GET', '/shared-living/spaces', undefined, successor.token);
  ok('space and ownership remain available to successor', ownerSpaces.status === 200 && ownerSpaces.data.data.some((row) => row.id === space.id && row.owner_id === successor.response.data.data.user._id));
  report();
})().catch((error) => { console.error(error); process.exitCode = 1; });
