const { default: worker } = await import("../dist/server/index.js");
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.RELIEF_PORT ?? 8787),
  fetch: worker.fetch,
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
