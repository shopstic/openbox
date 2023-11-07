import { Kind, Maybe, NonEmptyString, Type, TypeRegistry } from "../../src/deps.ts";
import { defineOpenboxEndpoint, defineOpenboxJsonEndpoint, OpenboxEndpoints } from "../../src/endpoint.ts";
import { OpenboxSchemaRegistry } from "../../src/registry.ts";

const schemaRegistry = new OpenboxSchemaRegistry();
const BinaryReadableStream = Type.Unsafe<ReadableStream<Uint8Array>>({
  [Kind]: "BinaryReadableStream",
  type: "string",
  format: "binary",
});

TypeRegistry.Set(BinaryReadableStream[Kind], (_, value) => value instanceof ReadableStream);

export const FormFileSchema = Type.Unsafe<File | Blob>({
  [Kind]: "FormFile",
  type: "string",
  format: "binary",
});

TypeRegistry.Set(FormFileSchema[Kind], (_, value) => value instanceof File || value instanceof Blob);

export const DateTime = Type.Date();
export const UserSchema = Type.Object({
  id: Type.Number({ minimum: 1, maximum: 9999 }),
  name: Type.String(),
  age: Type.Number({ minimum: 1, maximum: 200 }),
  gender: Type.Union([Type.Literal("male"), Type.Literal("female"), Type.Literal("unknown")]),
  weapon: Type.Union([
    Type.Object({ type: Type.Literal("a"), a: Type.String() }),
    Type.Object({ type: Type.Literal("b"), b: Type.String() }),
  ]),
});

export const ResumeSchema = Type.Object({
  name: Type.String(),
  age: Type.Number({ minimum: 1, maximum: 200 }),
  gender: Type.Union([Type.Literal("male"), Type.Literal("female"), Type.Literal("unknown")]),
  hobbies: Type.Array(Type.String()),
});

export const ResumeWithFileSchema = Type.Object({
  ...ResumeSchema.properties,
  resumeFile: Type.Optional(FormFileSchema),
});

export const InternalErrorSchema = Type.Object({
  error: Type.Boolean(),
  message: Type.String(),
});

export const NotFoundError = Type.Object({
  error: Type.Boolean(),
  message: Type.String(),
});

export const FileTooLargeError = Type.Object({
  error: Type.Boolean(),
  message: Type.String(),
});

export const PositiveIntSchema = Type.Integer({ minimum: 1 });
export const UserIdSchema = Type.Integer({ minimum: 1, maximum: 999 });

const alivezEndpoint = defineOpenboxEndpoint({
  method: "get",
  path: "/alivez",
  summary: "Liveness check",
  responses: {
    200: {
      description: "OK",
      headers: {
        "X-RateLimit-Limit": {
          ...PositiveIntSchema,
          description: "Request limit per hour.",
        },
        "X-RateLimit-Remaining": {
          ...PositiveIntSchema,
          description: "The number of requests left for the time window.",
        },
        "X-RateLimit-Reset": {
          ...DateTime,
          description: "The UTC date/time at which the current rate limit window resets.",
        },
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
      dates: Type.Optional(Type.Array(Type.Date())),
    },
    headers: {
      "x-some-uuid": Type.String({ format: "uuid" }),
      "x-some-date": DateTime,
      "x-optional": Maybe(NonEmptyString()),
    },
    body: UserSchema,
  },
  response: {
    description: "Object with user data.",
    body: UserSchema,
  },
});

const replaceUserByIdEndpoint = defineOpenboxEndpoint({
  method: "post",
  path: "/users/{id}",
  summary: "Update a single user",
  request: {
    params: { id: UserIdSchema },
    query: { dryRun: Type.Boolean() },
    headers: {
      "x-some-uuid": Type.String({ format: "uuid" }),
      "x-some-date": DateTime,
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
      "x-some-date": DateTime,
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

export const endpoints = probingEndpoints.merge(userEndpoints);
