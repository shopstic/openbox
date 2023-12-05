import { deferred } from "../../src/deps.test.ts";
import { OpenboxRouter } from "../../src/server.ts";
import { DefaultLogger as logger } from "../../src/deps.test.ts";

export async function useTempDir() {
  const tempDir = await Deno.makeTempDir();

  return {
    dir: tempDir,
    async [Symbol.asyncDispose]() {
      await Deno.remove(tempDir, { recursive: true });
    },
  };
}

export async function useServer(handler: Deno.ServeHandler) {
  const portPromise = deferred<number>();
  const abortController = new AbortController();

  const server = Deno
    .serve({
      port: 0,
      signal: abortController.signal,
      onListen({ hostname, port }) {
        logger.debug?.(`Test server is up at http://${hostname}:${port}`);
        portPromise.resolve(port);
      },
    }, handler);

  return {
    port: await portPromise,
    async [Symbol.asyncDispose]() {
      abortController.abort();
      await server.finished;
    },
  };
}

export function useTestServer(router: OpenboxRouter<unknown>) {
  return useServer(async (request, connInfo) => {
    logger.debug?.("<<<", request.method, request.url, request.headers);
    const response = await router.handle(request, connInfo);
    logger.debug?.(">>>", response);
    return response;
  });
}
