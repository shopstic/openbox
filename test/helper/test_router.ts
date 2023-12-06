import { assertExists, stringifyYaml } from "../../src/deps.test.ts";
import { toOpenapiSpecPaths, toOpenapiSpecSchemas } from "../../src/docs.ts";
import { memoizePromise } from "../../src/runtime/utils.ts";
import { OpenboxRouter } from "../../src/server.ts";
import { OpenapiObject } from "../../src/types/openapi_spec.ts";
import { endpoints, schemaRegistry, UserSchema } from "./test_endpoints.ts";
import { DefaultLogger as logger } from "../../src/deps.test.ts";
import { Static } from "../../src/deps/typebox.ts";

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

export const router = new OpenboxRouter({ endpoints })
  .path("/users/{id}").get.empty(({ params, connInfo }, respond) => {
    logger.debug?.("connInfo", connInfo);
    logger.debug?.("param: id", params.id);

    return respond(200).json(fakeUser);
  })
  .path("/users/{id}").put.json(({ params, query, headers, body, connInfo }, respond) => {
    logger.debug?.("remoteAddr", connInfo.remoteAddr);
    logger.debug?.("param: id", params.id);
    logger.debug?.("query: dryRun", query.dryRun);
    logger.debug?.("query: dates", query.dates);
    logger.debug?.("header: X-Some-UUID", headers["x-some-uuid"]);
    logger.debug?.("header: X-Some-Date", headers["x-some-date"].toLocaleString());
    logger.debug?.("body", body.id, body.age, body.name, body.gender);

    return respond(200)
      .headers({ "some-extra-stuff": "here" })
      .json(body);
  })
  .path("/users/{id}").post.json(({ params, query, headers, body, connInfo }, respond) => {
    logger.debug?.("remoteAddr", connInfo.remoteAddr);
    logger.debug?.("param: id", params.id);
    logger.debug?.("query: dryRun", query.dryRun);
    logger.debug?.("headers", headers);
    logger.debug?.("body", body.id, body.age, body.name, body.gender);

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
    logger.debug?.("application/x-www-form-urlencoded", body);

    return respond(200).text("Good");
  })
  .path("/resume").post.form(({ body }, respond) => {
    logger.debug?.("resumeFile", body.resumeFile);

    return respond(413).json({
      error: true,
      message: "File too large",
    });
    // return respond(200).text("Good");
  })
  .path("/alivez").get.empty((_, respond) => {
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
    logger.debug?.("connInfo", connInfo);

    return respond(200).text("");
  })
  .path("/download/{fileName}.pdf").get.empty(
    async (
      {
        params,
        query: { fileUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" },
        signal,
      },
      respond,
    ) => {
      logger.debug?.("fileName", params.fileName);
      logger.debug?.("fileUrl", fileUrl);

      const file = await fetch(fileUrl, {
        signal,
      });
      assertExists(file.body);

      return respond(200)
        .headers({ "some-extra-stuff": "here" })
        .media("application/pdf")(file.body);
    },
  )
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
