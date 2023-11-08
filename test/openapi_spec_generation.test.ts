import { useServer, useTempDir } from "./helper/use_server.ts";
import { router } from "./helper/test_router.ts";
import { createOpenboxClient } from "../src/client.ts";
import { endpoints } from "./helper/test_endpoints.ts";
import { assertEquals, inheritExec, joinPath } from "../src/deps.test.ts";
import { MediaTypes } from "../src/runtime/media_type.ts";

Deno.test("OpenAPI spec generation", async (t) => {
  await using server = await useServer(router);

  const api = createOpenboxClient({
    baseUrl: `http://localhost:${server.port}`,
    endpoints,
  });

  await using tempDir = await useTempDir();
  const { dir } = tempDir;

  await t.step("JSON", async () => {
    const res = await api("/docs/openapi_v3.1.{ext}").get({
      params: {
        ext: "json",
      },
    });

    assertEquals(res.status, 200);
    assertEquals(res.mediaType, MediaTypes.Json);

    await Deno.writeTextFile(joinPath(dir, "spec.json"), JSON.stringify(res.data, null, 2));

    await inheritExec({
      cmd: ["oas-tools", "validate", joinPath(dir, "spec.json")],
    });
  });

  await t.step("YAML", async () => {
    const res = await api("/docs/openapi_v3.1.{ext}").get({
      params: {
        ext: "yaml",
      },
    });

    assertEquals(res.status, 200);
    assertEquals(res.mediaType, "application/yaml");

    await Deno.writeTextFile(joinPath(dir, "spec.yaml"), await res.response.text());

    await inheritExec({
      cmd: ["oas-tools", "validate", joinPath(dir, "spec.yaml")],
    });
  });
});
