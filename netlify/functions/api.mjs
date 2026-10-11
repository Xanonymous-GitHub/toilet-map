import api from "../../dist/server/api.js";

export default (request) => api.fetch(request);
export const config = { path: "/api/*" };
