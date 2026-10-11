const { default: worker } = await import("../dist/server/index.js");
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.RELIEF_PORT ?? 8787),
  async fetch(request) {
    const response = await worker.fetch(request);
    if (
      !response.body ||
      !/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "") ||
      response.headers.has("content-encoding") ||
      !/^(text\/|application\/(javascript|json)|image\/svg\+xml)/.test(
        response.headers.get("content-type") ?? "",
      )
    )
      return response;
    const headers = new Headers(response.headers);
    headers.set("content-encoding", "gzip");
    headers.append("vary", "Accept-Encoding");
    headers.delete("content-length");
    return new Response(response.body.pipeThrough(new CompressionStream("gzip")), {
      status: response.status,
      headers,
    });
  },
  error(error) {
    console.error(error);
    return new Response("Preview server failed", { status: 500 });
  },
});
console.log(`Local: http://127.0.0.1:${server.port}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.stop(true);
    process.exit(0);
  });
}
