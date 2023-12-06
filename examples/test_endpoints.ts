import { DateTimeString, Kind, Maybe, PosInt, Type, TypeRegistry } from "../src/deps/typebox.ts";
import { defineOpenboxEndpoint, defineOpenboxJsonEndpoint, OpenboxEndpoints } from "../src/endpoint.ts";
import { OpenboxSchemaRegistry } from "../src/registry.ts";

export const schemaRegistry = OpenboxSchemaRegistry.default;

const BinaryReadableStream = Type.Unsafe<ReadableStream<Uint8Array>>({
  [Kind]: "BinaryReadableStream",
  type: "string",
  format: "binary",
});

TypeRegistry.Set(BinaryReadableStream[Kind], (_, value) => value instanceof ReadableStream);

const FormFileSchema = Type.Unsafe<File | Blob>({
  [Kind]: "FormFile",
  type: "string",
  format: "binary",
});

TypeRegistry.Set(FormFileSchema[Kind], (_, value) => value instanceof File || value instanceof Blob);

export const UserSchema = schemaRegistry.register(
  "User",
  Type.Object({
    id: Type.Number({ minimum: 1, maximum: 9999 }), // zsNumber(z.number().int().min(1).max(9999)).openapi({ example: 1212121 }),
    name: Type.String(), // z.string().openapi({ example: "John Doe" }),
    age: Type.Number({ minimum: 1, maximum: 200 }), // z.number().min(1).max(200).openapi({ example: 42 }),
    gender: Type.Union([Type.Literal("male"), Type.Literal("female"), Type.Literal("unknown")]),
    weapon: Type.Union([
      Type.Object({ type: Type.Literal("a"), a: Type.String() }),
      Type.Object({ type: Type.Literal("b"), b: Type.String() }),
    ]),
  }),
);

export const ResumeSchema = schemaRegistry.register(
  "Resume",
  Type.Object({
    name: Type.String(), // z.string().openapi({ example: "John Doe" }),
    age: Type.Number({ minimum: 1, maximum: 200 }), // z.number().min(1).max(200).openapi({ example: 42 }),
    gender: Type.Union([Type.Literal("male"), Type.Literal("female"), Type.Literal("unknown")]),
    hobbies: Type.Array(Type.String()),
  }),
);

export const ResumeWithFileSchema = schemaRegistry.register(
  "ResumeWithFile",
  Type.Intersect([
    ResumeSchema,
    Type.Object({
      resumeFile: Type.Optional(FormFileSchema),
    }),
  ]),
);

export const InternalErrorSchema = schemaRegistry.register(
  "InternalError",
  Type.Object({
    error: Type.Boolean(),
    message: Type.String(),
  }),
);

export const NotFoundError = schemaRegistry.register(
  "NotFoundError",
  Type.Object({
    error: Type.Boolean(),
    message: Type.String(),
  }),
);

export const FileTooLargeError = schemaRegistry.register(
  "FileTooLargeError",
  Type.Object({
    error: Type.Boolean(),
    message: Type.String(),
  }),
);

export const UserIdSchema = schemaRegistry.register("UserId", Type.Integer({ minimum: 1, maximum: 999 }));

const alivezEndpoint = defineOpenboxEndpoint({
  method: "get",
  path: "/alivez",
  summary: "Liveness check",
  responses: {
    200: {
      description: "OK",
      headers: {
        "X-RateLimit-Limit": PosInt({ description: "Request limit per hour." }),
        "X-RateLimit-Remaining": PosInt({ description: "The number of requests left for the time window." }),
        "X-RateLimit-Reset": DateTimeString({
          description: "The UTC date/time at which the current rate limit window resets.",
        }),
      },
      content: {
        "text/plain": {
          schema: Type.Literal("OK"),
        },
        "application/json": {
          schema: Type.Object({
            isOk: Type.Boolean(),
          }),
        },
      },
    },
  },
});

const healthzEndpoint = defineOpenboxEndpoint({
  method: "get",
  path: "/healthz",
  summary: "Health check",
  responses: {
    200: {
      description: "OK",
      content: {
        "text/plain": {
          schema: Type.String(),
        },
      },
    },
  },
});

const probingEndpoints = new OpenboxEndpoints(schemaRegistry)
  .endpoint(alivezEndpoint)
  .endpoint(healthzEndpoint);

const getUserByIdEndpoint = defineOpenboxJsonEndpoint({
  method: "get",
  path: "/users/{id}",
  summary: "Get a single user",
  request: {
    params: { id: UserIdSchema },
  },
  response: {
    description: "Object with user data.",
    body: UserSchema,
  },
});

const updateUserByIdEndpoint = defineOpenboxJsonEndpoint({
  method: "put",
  path: "/users/{id}",
  summary: "Update a single user",
  request: {
    params: {
      id: UserIdSchema,
    },
    query: {
      dryRun: Type.Boolean(),
      dates: Maybe(Type.Array(DateTimeString())),
    },
    headers: {
      "x-some-uuid": Type.String({ format: "uuid", description: "Some UUID" }),
      "x-some-date": DateTimeString(),
      "x-optional": Maybe(Type.String()),
    },
    body: UserSchema,
  },
  response: {
    description: "Object with user data.",
    body: UserSchema,
  },
});

const deleteUserByIdEndpoint = defineOpenboxEndpoint({
  method: "delete",
  path: "/users/{id}",
  summary: "Delete a single user",
  request: {
    params: {
      id: UserIdSchema,
    },
  },
  responses: {
    200: {
      description: "Object with user data.",
      content: {
        "application/json": {
          schema: UserSchema,
        },
      },
    },
    404: {
      description: "The user does not exist",
      content: {
        "text/plain": {
          schema: Type.Literal("The user does not exist"),
        },
      },
    },
  },
});

const replaceUserByIdEndpoint = defineOpenboxEndpoint({
  method: "post",
  path: "/users/{id}",
  summary: "Update a single user",
  request: {
    params: {
      id: {
        ...UserIdSchema,
        description: "The user ID",
      },
    },
    query: { dryRun: Type.Boolean() },
    headers: {
      "x-some-uuid": Type.String({ format: "uuid" }),
      "x-some-date": DateTimeString(),
    },
    body: {
      content: {
        "application/json": {
          schema: UserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Object with user data.",
      content: {
        "application/json": {
          schema: UserSchema,
        },
      },
    },
    201: {
      description: "Object with user data.",
      content: {
        "application/json": {
          schema: UserSchema,
        },
      },
    },
    400: {
      description: "Access denied",
      content: {
        "text/plain": {
          schema: Type.Literal("Access denied"),
        },
      },
    },
    404: {
      description: "The user is not found",
      content: {
        "application/json": {
          schema: NotFoundError,
        },
      },
    },
  },
});

const uploadResumeEndpoint = defineOpenboxEndpoint({
  method: "post",
  path: "/resume",
  summary: "Upload a resume",
  request: {
    query: { dryRun: Type.Boolean() },
    headers: {
      "x-some-uuid": Type.String({ format: "uuid" }),
      "x-some-date": DateTimeString(),
    },
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: ResumeSchema,
        },
        "multipart/form-data": {
          schema: ResumeWithFileSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "text/plain": {
          schema: Type.String(),
        },
      },
    },
    413: {
      description: "The file is too large",
      content: {
        "application/json": {
          schema: FileTooLargeError,
        },
      },
    },
  },
});

const userEndpoints = new OpenboxEndpoints(schemaRegistry)
  .endpoint(updateUserByIdEndpoint)
  .endpoint(deleteUserByIdEndpoint)
  .endpoint(replaceUserByIdEndpoint)
  .endpoint(getUserByIdEndpoint)
  .endpoint(uploadResumeEndpoint)
  .endpoint({
    method: "get",
    path: "/download/{fileName}.pdf",
    summary: "Download a PDF file",
    request: {
      params: {
        fileName: Type.String({ minLength: 1 }),
      },
    },
    responses: {
      200: {
        description: "The file",
        content: {
          "application/pdf": {
            schema: BinaryReadableStream,
          },
        },
      },
    },
  });

const openapiDocsEndpoint = defineOpenboxEndpoint({
  method: "get",
  path: "/docs/openapi_v3.1.{ext}",
  summary: "OpenAPI specification",
  request: {
    params: {
      ext: Type.Union([
        Type.Literal("json"),
        Type.Literal("yaml"),
      ]),
    },
  },
  responses: {
    200: {
      description: "OpenAPI specification",
      content: {
        "application/json": {
          schema: Type.Unknown(),
        },
        "application/yaml": {
          schema: Type.Unknown(),
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "text/plain": {
          schema: Type.String(),
        },
      },
    },
  },
});

export const docsEndpoints = new OpenboxEndpoints(schemaRegistry)
  .endpoint(openapiDocsEndpoint);

export const endpoints = probingEndpoints.merge(userEndpoints).merge(docsEndpoints);
