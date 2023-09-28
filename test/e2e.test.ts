import { createOpenboxClient, OpenboxClientUnexpectedResponseError } from "../src/client.ts";
import { assert, assertEquals, assertRejects, IsEqual } from "../src/deps.test.ts";
import { Static } from "../src/deps.ts";
import { MediaTypes } from "../src/runtime/media_type.ts";
import { debugLog } from "./helper/debug_log.ts";
import { endpoints, UserSchema } from "./helper/test_endpoints.ts";
import { router as testRouter } from "./helper/test_router.ts";
import { useServer } from "./helper/use_server.ts";

type EnsureEqual<T, I> = IsEqual<T, I> extends true ? I : never;

function checkType<T, I extends T = T>(input: I): EnsureEqual<T, typeof input> {
  return input as EnsureEqual<T, typeof input>;
}

Deno.test("e2e", async (t) => {
  await using server = await useServer(testRouter);

  const api = createOpenboxClient({
    baseUrl: `http://localhost:${server.port}`,
    endpoints,
  });

  await t.step("GET /healthz", async () => {
    const res = await api("/healthz").get();
    assertEquals(res.status, 200);
  });

  await t.step("GET /alivez", async () => {
    const res = await api("/alivez").get();

    if (res.mediaType === MediaTypes.Json) {
      debugLog?.("OK", checkType<{ isOk: boolean }>(res.data).isOk);
    } else {
      debugLog?.("OK", checkType<"OK">(res.data));
    }

    debugLog?.("X-RateLimit-Limit", checkType<number>(res.headers["X-RateLimit-Limit"]));
  });

  await t.step("GET /users/{id}", async () => {
    const res = await api("/users/{id}").get({
      params: {
        id: 55,
      },
    });

    checkType<number>(res.data.age);
    checkType<string>(res.data.name);
  });

  const user: Static<typeof UserSchema> = {
    id: 123,
    age: 101,
    name: "Jacky",
    gender: "male",
    weapon: {
      type: "a",
      a: "foo bar",
    },
  };

  await t.step("PUT /users/{id}", async () => {
    const putUser = api("/users/{id}").put.json;

    const res = await putUser({
      params: {
        id: 99,
      },
      query: {
        dryRun: true,
        dates: [new Date(), new Date(Date.now() + 1000 * 60 * 60 * 24)],
      },
      body: user,
      headers: {
        "x-some-uuid": "b473dbfe-2a89-4b8f-8d7a-3c576a917c14",
        "x-some-date": new Date(),
      },
    });

    checkType<number>(res.data.age);
    checkType<string>(res.data.name);
  });

  await t.step("POST /users/{id}", async (tt) => {
    const postUser = api("/users/{id}").post.json;

    async function postWithId(id: number) {
      return await postUser({
        params: {
          id,
        },
        query: {
          dryRun: true,
        },
        body: user,
        headers: {
          "x-some-uuid": "8443e041-ba6c-442c-81fa-bd0345c970c5",
          "x-some-date": new Date(),
        },
      });
    }

    await tt.step("200", async () => {
      const res = await postWithId(99);

      assert(res.status === 200);
      checkType<number>(res.data.age);
      checkType<string>(res.data.name);
    });

    await tt.step("404", async () => {
      const res = await postWithId(600);

      assert(res.status === 404);
      checkType<string>(res.data.message);
    });

    await tt.step("422", async () => {
      const error = await assertRejects(
        () => postWithId(9999),
        OpenboxClientUnexpectedResponseError,
        "Received an unexpected response with status=422 Unprocessable Entity",
      );

      assertEquals(error.body, {
        error: {
          message: "Expected integer to be less or equal to 999",
          path: "",
          schema: {
            maximum: 999,
            minimum: 1,
            type: "integer",
          },
          type: 24,
          value: 9999,
        },
        message: "Schema validation failed",
        name: "id",
        source: "params",
        type: "schemaValidation",
      });
    });
  });

  await t.step("GET /download/{fileName}", async () => {
    const downloadFile = api("/download/{fileName}.pdf").get;

    const res = await downloadFile({
      params: {
        fileName: "foobar",
      },
    });

    assertEquals((await res.response.arrayBuffer()).byteLength, 13264);
  });

  await t.step("POST /resume", async (tt) => {
    const body = {
      age: 21,
      name: "John",
      gender: "male" as const,
      hobbies: ["none", "really"],
      resumeFile: new File(["foo bar"], "resume.txt"),
    };

    await tt.step("urlEncoded", async () => {
      const res = await api("/resume").post.urlEncoded({
        headers: {
          "x-some-uuid": "8443e041-ba6c-442c-81fa-bd0345c970c5",
          "x-some-date": new Date(),
        },
        query: {
          dryRun: true,
        },
        body,
      });

      assert(res.status === 200);
      checkType<string>(res.data);
    });

    await tt.step("form", async () => {
      const res = await api("/resume").post.form({
        headers: {
          "x-some-uuid": "8443e041-ba6c-442c-81fa-bd0345c970c5",
          "x-some-date": new Date(),
        },
        query: {
          dryRun: true,
        },
        body,
      });

      assert(res.status === 413);
      assertEquals(res.data.error, true);
      checkType<string>(res.data.message);
    });
  });
});
