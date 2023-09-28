import { assertExists, Static } from "../src/deps.ts";
import { OpenboxRouter } from "../src/server.ts";
import { endpoints, UserSchema } from "./test_endpoints.ts";

const router = new OpenboxRouter({ endpoints })
  .path("/users/{id}").get.empty(({ params, connInfo }, respond) => {
    console.log("connInfo", connInfo);
    console.log("param: id", params.id);

    const responseBody: Static<typeof UserSchema> = {
      id: 123,
      age: 88,
      gender: "female",
      name: "test",
      weapon: {
        type: "b",
        b: "whatever",
      },
    };

    return respond(200).json(responseBody);
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

    return respond(200).empty();
  })
  .path("/download/{fileName}.pdf").get.empty(async ({ params }, respond) => {
    console.log("fileName", params.fileName);

    const file = await fetch("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf");
    assertExists(file.body);

    return respond(200)
      .headers({ "some-extra-stuff": "here" })
      .media("application/pdf")(file.body);
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
