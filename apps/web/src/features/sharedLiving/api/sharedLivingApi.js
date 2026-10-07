import api from "../../../shared/api/client";
const root = "/shared-living";
const request = async (method, path, body) =>
  (await api.request({ method, url: `${root}${path}`, data: body })).data.data;
export default {
  spaces: () => request("get", "/spaces"),
  create: (body) => request("post", "/spaces", body),
  join: (body) => request("post", "/join", body),
  month: (space, month) => request("get", `/spaces/${space}/months/${month}`),
  transferOwnership: (space, successorUserId) => request("post", `/spaces/${space}/transfer-ownership`, { successor_user_id: successorUserId }),
  leave: (space) => request("delete", `/spaces/${space}/membership`),
  save: (method, path, body) => request(method, path, body),
};
