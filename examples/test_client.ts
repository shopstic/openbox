import { ClientResponse, createOpenboxClient } from "../src/client.ts";
import { IsEqual } from "../src/deps.test.ts";
import { Static } from "../src/deps/typebox.ts";
import { endpoints, UserSchema } from "./test_endpoints.ts";

const testClient = createOpenboxClient({
  baseUrl: "http://localhost:9876",
  // baseUrl: "https://tun.late9.com",
  endpoints,
});

const user: Static<typeof UserSchema> = {
  id: 123,
  age: 50,
  name: "Jacky",
  gender: "male",
  weapon: {
    type: "a",
    a: "foo bar",
  },
};

async function testFetch<R extends ClientResponse>(name: string, doIt: () => Promise<R>) {
  console.log(`${name} -----------------------`);
  try {
    const response = await doIt();

    console.log(
      response.headers,
      response.status,
      response.data,
    );
  } catch (e) {
    console.error("Failed", e, JSON.stringify(e, null, 2));
  }
}

type EnsureEqual<T, I> = IsEqual<T, I> extends true ? I : never;

function checkType<T, I extends T = T>(input: I): EnsureEqual<T, typeof input> {
  return input as EnsureEqual<T, typeof input>;
}

// await testFetch("GET /healthz", () => testClient("/healthz").get());

// await testFetch("GET /alivez", async () => {
//   const response = await testClient("/alivez").get();

//   if (response.mediaType === "application/json") {
//     console.log("OK", checkType<{ isOk: boolean }>(response.data).isOk);
//   } else {
//     console.log("OK", checkType<"OK">(response.data));
//   }

//   console.log("X-RateLimit-Limit", checkType<number>(response.headers["X-RateLimit-Limit"]));

//   return response;
// });

await testFetch("PUT /users/{id}", async () => {
  const response = await testClient("/users/{id}").put.json({
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

  checkType<number>(response.data.age);
  checkType<string>(response.data.name);

  return response;
});

await testFetch("GET /users/{id}", async () => {
  const response = await testClient("/users/{id}").get({
    params: {
      id: 55,
    },
  });

  checkType<number>(response.data.age);
  checkType<string>(response.data.name);

  return response;
});

await testFetch("DELETE /users/{id}", async () => {
  const response = await testClient("/users/{id}").delete.empty({
    params: {
      id: 123,
    },
  });

  if (response.status === 200) {
    checkType(response.data.age);
  } else if (response.status === 404) {
    checkType<"The user does not exist">(response.data);
  }

  return response;
});

// await testFetch("GET /users/{id}", () =>
//   testClient.get("/users/{id}")({
//     params: {
//       id: 99999,
//     },
//   }));

const postUser = testClient("/users/{id}").post.json;

await testFetch("POST /users/{id}", async () => {
  const response = await postUser({
    params: {
      id: 999,
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

  if (response.status === 200) {
    checkType(response.data.age);
  } else if (response.status === 201) {
    checkType<"unknown" | "male" | "female">(response.data.gender);
  } else if (response.status === 404) {
    checkType<string>(response.data.message);
  }

  return response;
});

const downloadFile = testClient("/download/{fileName}.pdf").get;

await testFetch("GET /download/{fileName}", async () => {
  const response = await downloadFile({
    params: {
      fileName: "foobar",
    },
  });

  console.log("binary length", (await response.response.arrayBuffer()).byteLength);

  return response;
});

// const uploadResumeWithFile = testClient.post("/resume").sendForm;
const uploadResume = testClient("/resume").post.form;
// const uploadResume = testClient("/resume").post.contentType("application/x-www-form-urlencoded");

await testFetch("POST /resume", async () => {
  const response = await uploadResume({
    headers: {
      "x-some-uuid": "8443e041-ba6c-442c-81fa-bd0345c970c5",
      "x-some-date": new Date(),
    },
    query: {
      dryRun: true,
    },
    body: {
      age: 84,
      name: "John",
      gender: "male",
      hobbies: ["none", "really"],
      resumeFile: new File(["foo bar"], "resume.txt"),
    },
  });

  if (response.status === 200) {
    console.log(checkType<string>(response.data));
  } else if (response.status === 413) {
    console.log(
      "error:",
      checkType<boolean>(response.data.error),
      "message:",
      checkType<string>(response.data.message),
    );
  }
  return response;
});
