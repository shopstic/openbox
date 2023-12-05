import { createOpenboxClient } from "../src/client.ts";
import { assert, assertStringIncludes, deferred } from "../src/deps.test.ts";
import { assertEquals, assertGreater, assertLess } from "../src/deps.test.ts";
import { defineOpenboxEndpoint, OpenboxEndpoints } from "../src/endpoint.ts";
import { OpenboxSchemaRegistry } from "../src/registry.ts";
import { PartReader } from "../src/runtime/streaming_multipart_reader.ts";
import { OpenboxRouter, streamingMultipartFormData } from "../src/server.ts";
import { FormFileSchema } from "./helper/test_endpoints.ts";
import { useTestServer } from "./helper/use_test_server.ts";
import { DefaultLogger as logger } from "../src/deps.test.ts";
import { Static, Type } from "../src/deps/typebox.ts";

/* {
  bytes: number;
  exceeddedLimit: boolean;
  fileName: string;
  formName: string;
  headers: Headers;
};
 */

const schemaRegistry = new OpenboxSchemaRegistry();
const PartReadResultSchema = Type.Object({
  bytes: Type.Number(),
  exceeddedLimit: Type.Boolean(),
  fileName: Type.Optional(Type.String()),
  formName: Type.Optional(Type.String()),
  headers: Type.Array(Type.Tuple([Type.String(), Type.String()])),
});

const streamUploadEndpoint = defineOpenboxEndpoint({
  method: "post",
  path: "/stream-upload",
  summary: "Stream upload",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: Type.Object({
            text: Type.String(),
            radio: Type.Boolean(),
            file: FormFileSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: Type.Array(PartReadResultSchema),
        },
      },
    },
    413: {
      description: "The file is too large",
      content: {
        "application/json": {
          schema: Type.Array(PartReadResultSchema),
        },
      },
    },
  },
});

const streamUploadServerEndpoint = {
  ...streamUploadEndpoint,
  request: {
    ...streamUploadEndpoint.request,
    body: {
      ...streamUploadEndpoint.request.body,
      content: {
        ...streamUploadEndpoint.request.body.content,
        "multipart/form-data": {
          ...streamUploadEndpoint.request.body.content["multipart/form-data"],
          schema: streamingMultipartFormData(streamUploadEndpoint.request.body.content["multipart/form-data"].schema),
        },
      },
    },
  },
};

const clientEndpoints = new OpenboxEndpoints(schemaRegistry)
  .endpoint(streamUploadEndpoint);

const serverEndpoints = new OpenboxEndpoints(schemaRegistry)
  .endpoint(streamUploadServerEndpoint);

type PartReadResult = Static<typeof PartReadResultSchema>;

async function readPartWithLimit(reader: PartReader, limitBytes: number): Promise<PartReadResult> {
  const buf = new Uint8Array(1000);

  let ret: number | null = null;
  let total = 0;
  const headers = Array.from(reader.headers);

  while (true) {
    ret = await reader.read(buf);

    if (ret === null) {
      break;
    }

    total += ret;

    if (total > limitBytes) {
      logger.debug?.("total too big", total, "canceling");
      return {
        bytes: total,
        exceeddedLimit: true,
        fileName: reader.fileName,
        formName: reader.formName,
        headers,
      };
    }
  }

  return {
    bytes: total,
    exceeddedLimit: false,
    fileName: reader.fileName,
    formName: reader.formName,
    headers,
  };
}

Deno.test("streaming multipart", async (t) => {
  const limitEnforcedResultsPromise = deferred<PartReadResult[]>();

  const router = new OpenboxRouter({ endpoints: serverEndpoints })
    .path("/stream-upload").post.form(async ({ body }, respond) => {
      const results: PartReadResult[] = [];

      for await (const partReader of body) {
        const result = await readPartWithLimit(partReader, 1_000_000);
        results.push(result);

        if (result.exceeddedLimit) {
          limitEnforcedResultsPromise.resolve(results);
          return respond(413).json(results);
        }
      }

      return respond(200).json(results);
    })
    .complete({});

  await using server = await useTestServer(router);

  const api = createOpenboxClient({
    baseUrl: `http://localhost:${server.port}`,
    endpoints: clientEndpoints,
  });

  await t.step("upload within limit", async () => {
    const res = await api("/stream-upload").post.form({
      body: {
        text: "foo",
        radio: true,
        file: new File([new Uint8Array(100_000).fill(111)], "100K.bin"),
      },
    });

    assertEquals(res.data, [
      {
        bytes: 3,
        exceeddedLimit: false,
        formName: "text",
        headers: [
          [
            "content-disposition",
            'form-data; name="text"',
          ],
        ],
      },
      {
        bytes: 4,
        exceeddedLimit: false,
        formName: "radio",
        headers: [
          [
            "content-disposition",
            'form-data; name="radio"',
          ],
        ],
      },
      {
        bytes: 100_000,
        exceeddedLimit: false,
        fileName: "100K.bin",
        formName: "file",
        headers: [
          [
            "content-disposition",
            'form-data; name="file"; filename="100K.bin"',
          ],
          [
            "content-type",
            "application/octet-stream",
          ],
        ],
      },
    ]);
  });

  await t.step("upload above limit", async () => {
    try {
      const res = await api("/stream-upload").post.form({
        body: {
          text: "boom",
          radio: false,
          file: new File([new Uint8Array(2_000_000).fill(222)], "2M.bin"),
        },
      });
      assert(res.status === 413);
    } catch (e) {
      if (e instanceof TypeError) {
        assertStringIncludes(
          e.message,
          "request or response body error: error reading a body from connection: connection error",
        );
      } else {
        throw e;
      }
    }

    const results = await limitEnforcedResultsPromise;
    assertEquals(results.length, 3);
    assertEquals(results[0], {
      bytes: 4,
      exceeddedLimit: false,
      formName: "text",
      fileName: undefined,
      headers: [
        [
          "content-disposition",
          'form-data; name="text"',
        ],
      ],
    });
    assertEquals(results[1], {
      bytes: 5,
      exceeddedLimit: false,
      formName: "radio",
      fileName: undefined,
      headers: [
        [
          "content-disposition",
          'form-data; name="radio"',
        ],
      ],
    });
    assertEquals(results[2].exceeddedLimit, true);
    assertGreater(results[2].bytes, 1_000_000);
    assertLess(results[2].bytes, 1_000_000 + 1000);
  });
});
