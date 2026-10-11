import api from "../dist/server/api.js";

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/handler") {
      url.pathname = `/api/v1/${url.searchParams.get("__relief_path") ?? ""}`;
      url.searchParams.delete("__relief_path");
      request = new Request(url, request);
    }
    return api.fetch(request);
  },
};
