import { deferred } from "../../src/deps.test.ts";
import { OpenboxRouter } from "../../src/server.ts";
import { debugLog } from "./debug_log.ts";

export async function useServer(router: OpenboxRouter<unknown>) {
  const portPromise = deferred<number>();
  const abortController = new AbortController();

  const server = Deno
    .serve({
      port: 0,
      signal: abortController.signal,
      onListen({ hostname, port }) {
        debugLog?.(`Test server is up at http://${hostname}:${port}`);
        portPromise.resolve(port);
      },
    }, async (request, connInfo) => {
      debugLog?.("<<<", request.method, request.url, request.headers);
      const response = await router.handle(request, connInfo);
      debugLog?.(">>>", response);
      return response;
    });

  return {
    port: await portPromise,
    async [Symbol.asyncDispose]() {
      abortController.abort();
      await server.finished;
    },
  };
}
