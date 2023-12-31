import { stringifyYaml } from "../src/deps.test.ts";
import { assertExists } from "../src/deps.test.ts";
import { Static } from "../src/deps/typebox.ts";
import { toOpenapiSpecPaths, toOpenapiSpecSchemas } from "../src/docs.ts";
import { memoizePromise } from "../src/runtime/utils.ts";
import { OpenboxRouter } from "../src/server.ts";
import { OpenapiObject } from "../src/types/openapi_spec.ts";
import { endpoints, schemaRegistry, UserSchema } from "./test_endpoints.ts";

function createOpenapiSpec() {
  return {
    info: {
      title: "Test API",
      version: "1.0.0",
    },
    openapi: "3.1.0",
    paths: toOpenapiSpecPaths(schemaRegistry, endpoints),
    components: toOpenapiSpecSchemas(schemaRegistry),
  } satisfies OpenapiObject;
}

const memoizedOpenapiSpecJson = memoizePromise(() => Promise.resolve(JSON.stringify(createOpenapiSpec(), null, 2)));
const memoizedOpenapiSpecYaml = memoizePromise(async () => {
  const json = await memoizedOpenapiSpecJson();
  return stringifyYaml(JSON.parse(json));
});

const fakeUser: Static<typeof UserSchema> = {
  id: 123,
  age: 88,
  gender: "female",
  name: "test",
  weapon: {
    type: "b",
    b: "whatever",
  },
};

const router = new OpenboxRouter({ endpoints })
  .path("/users/{id}").get.empty(({ params, connInfo }, respond) => {
    console.log("connInfo", connInfo);
    console.log("param: id", params.id);

    return respond(200).json(fakeUser);
  })
  .path("/users/{id}").put.json(({ params, query, headers, body, connInfo }, respond) => {
    console.log("remoteAddr", connInfo.remoteAddr);
    console.log("param: id", params.id);
    console.log("query: dryRun", query.dryRun);
    console.log("query: dates", query.dates);
    console.log("header: X-Some-UUID", headers["x-some-uuid"]);
    console.log("header: X-Some-Date", headers["x-some-date"].toLocaleString());
    console.log("body", body.id, body.age, body.name, body.gender);

    return respond(200)
      .headers({ "some-extra-stuff": "here" })
      .json(body);
  })
  .path("/users/{id}").post.json(({ params, query, headers, body, connInfo }, respond) => {
    console.log("remoteAddr", connInfo.remoteAddr);
    console.log("param: id", params.id);
    console.log("query: dryRun", query.dryRun);
    console.log("headers", headers);
    console.log("body", body.id, body.age, body.name, body.gender);

    if (params.id > 500) {
      return respond(404).json({
        error: true,
        message: `The user with id ${params.id} is not found`,
      });
    }

    return respond(200)
      .headers({ "some-extra-stuff": "here" })
      .json(body);
  })
  .path("/resume").post.urlEncoded(({ body }, respond) => {
    console.log("application/x-www-form-urlencoded", body);

    return respond(200).text("Good");
  })
  .path("/resume").post.form(({ body }, respond) => {
    console.log("resumeFile", body.resumeFile);

    return respond(413).json({
      error: true,
      message: "File too large",
    });
    // return respond(200).text("Good");
  })
  .path("/alivez").get.empty((_, respond) => {
    /* return new ServerResponse(200, "application/json", {
    isOk: true,
  }, {
    "X-RateLimit-Limit": 5000,
    "X-RateLimit-Remaining": 4999,
    "X-RateLimit-Reset": new Date(Date.now() + 3600000),
    "some-extra-stuff": "here",
  }); */
    return respond(200)
      .headers({
        "X-RateLimit-Limit": 5000,
        "X-RateLimit-Remaining": 4999,
        "X-RateLimit-Reset": new Date(Date.now() + 3600000),
        "some-extra-stuff": "here",
      })
      .json({ isOk: true });
    // .text("OK");
  })
  .path("/healthz").get.empty(({ connInfo }, respond) => {
    console.log("connInfo", connInfo);

    return respond(200).text("");
  })
  .path("/download/{fileName}.pdf").get.empty(async ({ params }, respond) => {
    console.log("fileName", params.fileName);

    const file = await fetch("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf");
    assertExists(file.body);

    return respond(200)
      .headers({ "some-extra-stuff": "here" })
      .media("application/pdf")(file.body);
  })
  .path("/docs/openapi_v3.1.{ext}").get.empty(async ({ params: { ext } }, respond) => {
    if (ext === "json") {
      return respond(200)
        .media("application/json")(await memoizedOpenapiSpecJson());
    }

    if (ext === "yaml") {
      return respond(200)
        .media("application/yaml")(await memoizedOpenapiSpecYaml());
    }

    return respond(404).text(`Unsupported file extension ${ext}`);
  })
  .path("/users/{id}").delete.empty(({ params: { id } }, respond) => {
    if (id !== fakeUser.id) {
      return respond(404).text("The user does not exist");
    }

    return respond(200).json(fakeUser);
  })
  .complete({});

await Deno
  .serve({
    port: 9876,
    onListen({ hostname, port }) {
      console.log(`OpenAPI server is up at http://${hostname}:${port}`);
    },
  }, async (request, connInfo) => {
    console.log("<<<", request.method, request.url, request.headers);
    const response = await router.handle(request, connInfo);
    console.log(">>>", response);
    return response;
  })
  .finished;
