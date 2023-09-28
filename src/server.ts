import { IsEmptyObject } from "./deps.test.ts";
import { Kind, readerFromStreamReader, TransformDecodeCheckError, TSchema, Type } from "./deps.ts";
import {
  ExtractRequestBodyByMediaMap,
  OpenboxEndpointResponseByStatusMap,
  OpenboxEndpoints,
  OpenboxEndpointTypeBag,
  OpenboxEraseRoute,
  transformRecordToStringValues,
} from "./endpoint.ts";
import { parseForm } from "./runtime/form.ts";
import { MediaTypes } from "./runtime/media_type.ts";
import { PartReader, StreamingMultipartReader } from "./runtime/streaming_multipart_reader.ts";
import { OpenboxParam, parseParam } from "./runtime/param.ts";
import { OpenboxBodySchema } from "./runtime/request.ts";
import { assertUnreachable } from "./runtime/utils.ts";
import { OpenboxRouteConfig, OpenboxRouteMethod } from "./types/spec.ts";
import { EmptyObject, ExtractEndpointsByPath, MaybeRecord, NotLiterallyString, TypedResponse } from "./types/utils.ts";

export interface OpenboxServerRequestContext<P, Q, H, B> {
  url: URL;
  params: P;
  query: Q;
  headers: H;
  body: B;
  request: Request;
  connInfo: Deno.ServeHandlerInfo;
}

export class RawResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
  }

  toResponse() {
    return this;
  }
}

type MaybePromise<T> = Promise<T> | T;

enum OpenboxRequestErrorSource {
  Params = "params",
  Query = "query",
  Headers = "headers",
  Body = "body",
}

enum OpenboxRequestErrorType {
  ProtocolValidation = "protocolValidation",
  SchemaValidation = "schemaValidation",
  Internal = "internal",
}

type OpenboxServerRouteHandler = (
  request: OpenboxServerRequestContext<unknown, unknown, unknown, unknown>,
  responder: (status: number) => RouteResponderApi,
) => MaybePromise<ServerResponse<number, string, unknown, unknown>>;

type OpenboxServerRoute = {
  config: OpenboxRouteConfig<string>;
  path: string;
  mediaType: string;
  urlPattern?: URLPattern;
  pathParams?: OpenboxParam[];
  queryParams?: OpenboxParam[];
  headerParams?: OpenboxParam[];
  bodySchema?: OpenboxBodySchema;
  errorHandler?: OpenboxServerErrorHandler;
  handler: OpenboxServerRouteHandler;
};

type OpenboxServerErrorHandler = (
  source: OpenboxRequestErrorSource,
  type: OpenboxRequestErrorType,
  error: unknown,
  name?: string,
) => Response;

export const createOpenboxDefaultErrorHandler = (log?: (...args: unknown[]) => void) =>
(
  source: OpenboxRequestErrorSource,
  type: OpenboxRequestErrorType,
  error: unknown,
  name?: string,
) => {
  if (type === OpenboxRequestErrorType.SchemaValidation) {
    return new Response(
      JSON.stringify(
        {
          type,
          message: "Schema validation failed",
          source,
          error,
          ...(name !== undefined ? { name } : {}),
        },
        null,
        2,
      ),
      {
        status: 422,
        headers: {
          "Content-Type": MediaTypes.Json,
        },
      },
    );
  }

  if (type === OpenboxRequestErrorType.ProtocolValidation) {
    const underlyingCause = (error instanceof Error) ? error.cause : undefined;

    if (underlyingCause) {
      log?.(
        "Request failed with underlying cause",
        "type:",
        type,
        "source:",
        source,
        "name:",
        name,
        "error:",
        error,
      );
    }

    return new Response(
      JSON.stringify(
        {
          type,
          source,
          ...(error instanceof Error ? { message: error.message } : {}),
          ...(name !== undefined ? { name } : {}),
        },
        null,
        2,
      ),
      {
        status: 400,
        headers: {
          "Content-Type": MediaTypes.Json,
        },
      },
    );
  }

  if (type === OpenboxRequestErrorType.Internal) {
    log?.("Internal server error", "type:", type, "source:", source, "name:", name, "error:", error);
    return new Response("Internal server error", {
      status: 500,
      headers: {
        "Content-Type": MediaTypes.Text,
      },
    });
  }

  assertUnreachable(type);
};

type OpenboxStreamingMultipartFormData = AsyncGenerator<PartReader>;

export const OpenboxStreamingMultipartFormData = Symbol.for("OpenboxStreamingMultipartFormData");

export function streamingMultipartFormData(schema: TSchema) {
  return Type.Unsafe<OpenboxStreamingMultipartFormData>(
    {
      [Kind]: OpenboxStreamingMultipartFormData.description,
      schema,
    },
  );
}

type UppercasedMethodKey = string;
type PathKey = string;
type MediaTypeKey = string;

class RouteHandlerWithPathWithMethodApi {
  constructor(readonly api: RouteHandlerWithPathApi, readonly method: OpenboxRouteMethod) {}

  media(mediaType: string) {
    return this.api.router.addRoute.bind(this.api.router, this.api.path, this.method, mediaType);
  }

  get empty() {
    return this.media("");
  }

  get json() {
    return this.media(MediaTypes.Json);
  }

  get urlEncoded() {
    return this.media(MediaTypes.UrlEncoded);
  }

  get form() {
    return this.media(MediaTypes.FormData);
  }

  get text() {
    return this.media(MediaTypes.Text);
  }

  get binary() {
    return this.media(MediaTypes.OctetStream);
  }
}

class RouteHandlerWithPathApi {
  constructor(readonly router: RouteHandlerApi, readonly path: string) {}
  get get() {
    return new RouteHandlerWithPathWithMethodApi(this, "get");
  }
  get post() {
    return new RouteHandlerWithPathWithMethodApi(this, "post");
  }
  get put() {
    return new RouteHandlerWithPathWithMethodApi(this, "put");
  }
  get patch() {
    return new RouteHandlerWithPathWithMethodApi(this, "patch");
  }
  get delete() {
    return new RouteHandlerWithPathWithMethodApi(this, "delete");
  }
}

interface RouteHandlerApi {
  addRoute(
    path: string,
    method: OpenboxRouteMethod,
    mediaType: string,
    handler: OpenboxServerRouteHandler,
    errorHandler?: OpenboxServerErrorHandler,
  ): this;
}

class RouteResponderWithMediaTypeApi {
  constructor(readonly responder: RouteResponderApi, readonly mediaType: string) {}

  body(body: BodyInit | null) {
    return new ServerResponse(this.responder.status, this.mediaType, body, this.responder.headersInit);
  }
}

class RouteResponderApi {
  constructor(readonly status: number, readonly headersInit?: HeadersInit) {}

  media(mediaType: string) {
    const r = new RouteResponderWithMediaTypeApi(this, mediaType);
    return r.body.bind(r);
  }

  headers(headers: HeadersInit) {
    return new RouteResponderApi(this.status, headers);
  }

  empty() {
    return this.media(MediaTypes.Text)(null);
  }

  get json() {
    return this.media(MediaTypes.Json);
  }

  get text() {
    return this.media(MediaTypes.Text);
  }

  get html() {
    return this.media(MediaTypes.Html);
  }

  get binary() {
    return this.media(MediaTypes.OctetStream);
  }
}

function withPath<
  Routes,
  Path extends Extract<keyof Routes, string>,
> // deno-lint-ignore no-unused-vars
(path: Path) {
  type EndpointsByMethod = ExtractEndpointsByPath<Path, Routes>;
  type Methods = Extract<keyof EndpointsByMethod, OpenboxRouteMethod>;

  function withMethod<
    Method extends Methods,
  > // deno-lint-ignore no-unused-vars
  (method: Method) {
    type TypeBag = EndpointsByMethod[Method];
    type ReqBodyMap = ExtractRequestBodyByMediaMap<TypeBag>;
    type ReqMediaTypes = Extract<keyof ReqBodyMap, string>;
    type RequestContextByMediaType<M> = M extends ReqMediaTypes
      ? TypeBag extends OpenboxEndpointTypeBag<infer P, infer Q, infer H>
        ? OpenboxServerRequestContext<P, Q, H, ReqBodyMap[M]>
      : never
      : never;

    type ResByStatusMap = TypeBag extends
      OpenboxEndpointTypeBag<MaybeRecord, MaybeRecord, MaybeRecord, MaybeRecord, unknown, infer B> ? B : never;
    type ResUnionType = TypeBag extends OpenboxEndpointTypeBag<
      MaybeRecord,
      MaybeRecord,
      MaybeRecord,
      MaybeRecord,
      infer B,
      OpenboxEndpointResponseByStatusMap
    > ? B
      : never;
    type ResStatusCodes = Extract<keyof ResByStatusMap, number>;

    // deno-lint-ignore no-unused-vars
    function withResStatus<ResStatus extends ResStatusCodes>(resStatus: ResStatus) {
      type ResBodyByMediaType = ResByStatusMap[ResStatus]["body"];
      type ResHeaders = ResByStatusMap[ResStatus]["headers"];
      type GenericResHeaders = ResHeaders extends never ? HeadersInit : ResHeaders & Record<string, unknown>;
      type ResMediaTypes = keyof ResBodyByMediaType;

      type ResponderWithMedia<M, K extends string> = M extends NotLiterallyString<ResMediaTypes> ? {
          [key in K]: (body: ResBodyByMediaType[M]) => Promise<ResUnionType>;
        }
        : EmptyObject;

      type ResponderWithEmpty<K extends string> = ResBodyByMediaType extends never ? {
          [key in K]: () => Promise<ResUnionType>;
        }
        : EmptyObject;

      type WithHeaders<Chain> = {
        headers: (headers: GenericResHeaders) => Chain;
      };

      type BaseResponder =
        & ResponderWithEmpty<"empty">
        & ResponderWithMedia<typeof MediaTypes.Html, "html">
        & ResponderWithMedia<typeof MediaTypes.Text, "text">
        & ResponderWithMedia<typeof MediaTypes.Json, "json">
        & ResponderWithMedia<typeof MediaTypes.OctetStream, "binary">;

      type WithGeneric = IsEmptyObject<BaseResponder> extends true ? {
          media: (mediaType: ResMediaTypes) => (body: BodyInit | null) => Promise<ResUnionType>;
        }
        : EmptyObject;

      type BaseResponderWithGeneric = BaseResponder & WithGeneric;

      type Responder = ResHeaders extends never ? BaseResponderWithGeneric & WithHeaders<BaseResponderWithGeneric>
        : WithHeaders<BaseResponderWithGeneric>;

      return {} as Responder;
    }

    type WithEmptyReq<K extends string> = NotLiterallyString<ReqMediaTypes> extends never ? {
        [key in K]: (
          handler: (request: RequestContextByMediaType<string>, respond: typeof withResStatus) => Promise<ResUnionType>,
          errorHandler?: OpenboxServerErrorHandler,
        ) => OpenboxRouter<OpenboxEraseRoute<Routes, Path, Method, string>>;
      }
      : EmptyObject;

    type WithReqMedia<M, K extends string> = M extends NotLiterallyString<ReqMediaTypes> ? {
        [key in K]: (
          handler: (
            request: RequestContextByMediaType<M>,
            respond: typeof withResStatus,
            m: M,
          ) => Promise<ResUnionType>,
          errorHandler?: OpenboxServerErrorHandler,
        ) => OpenboxRouter<OpenboxEraseRoute<Routes, Path, Method, M>>;
      }
      : EmptyObject;

    type WithCustom = {
      media: <M extends ReqMediaTypes>(
        mediaType: M,
      ) => (request: RequestContextByMediaType<M>, respond: typeof withResStatus) => Promise<ResUnionType>;
    };

    return {} as
      & WithCustom
      & WithEmptyReq<"empty">
      & WithReqMedia<typeof MediaTypes.Json, "json">
      & WithReqMedia<typeof MediaTypes.UrlEncoded, "urlEncoded">
      & WithReqMedia<typeof MediaTypes.FormData, "form">
      & WithReqMedia<typeof MediaTypes.Text, "text">
      & WithReqMedia<typeof MediaTypes.OctetStream, "binary">;
  }

  type WithMethod<M> = M extends Methods ? {
      [key in M]: ReturnType<typeof withMethod<M>>;
    }
    : EmptyObject;

  return {} as
    & WithMethod<"get">
    & WithMethod<"post">
    & WithMethod<"put">
    & WithMethod<"patch">
    & WithMethod<"delete">;
}

type UnimplementedRoutes<Routes> =
  & {
    [Path in keyof Routes]:
      & {
        [Method in keyof Routes[Path]]: Extract<keyof ExtractRequestBodyByMediaMap<Routes[Path][Method]>, string>;
      }
      // deno-lint-ignore ban-types
      & {};
  }
  // deno-lint-ignore ban-types
  & {};

export class OpenboxRouter<Routes> implements RouteHandlerApi {
  readonly endpoints: OpenboxEndpoints<Routes>;

  #defaultErrorHandler: OpenboxServerErrorHandler;
  #routesByUppercasedMethodMap: Map<
    UppercasedMethodKey,
    Map<MediaTypeKey, {
      byPathTemplateMap: Map<PathKey, OpenboxServerRoute>;
      byPathMap: Map<PathKey, OpenboxServerRoute>;
      patternList: OpenboxServerRoute[];
    }>
  >;
  #responder = (status: number) => new RouteResponderApi(status);

  constructor(
    {
      endpoints,
      defaultErrorHandler = createOpenboxDefaultErrorHandler(console.error.bind(console)),
      // deno-lint-ignore no-unused-vars
      openapiSpecPath = "/docs/openapi",
    }: {
      endpoints: OpenboxEndpoints<Routes>;
      openapiSpecPath?: string;
      defaultErrorHandler?: OpenboxServerErrorHandler;
    },
  ) {
    this.endpoints = endpoints;
    this.#routesByUppercasedMethodMap = new Map();
    this.#defaultErrorHandler = defaultErrorHandler;

    /* const memorizedDocs = memoizePromise(() => {
      const generator = new OpenboxGenerator(registry.definitions);
      const document = generator.generateDocument({
        openapi: "3.0.0",
        info: {
          title: "Test",
          version: "1.0.0",
        },
      });

      return Promise.resolve(
        new ServerResponse(200, MediaTypes.Json, document, null),
      );
    });

    this.addRoute({
      method: "get",
      path: openapiSpecPath,
      responses: {
        200: {
          description: "OpenAPI v3 specification",
          content: {
            MediaTypes.Json: {
              schema: z.unknown(),
            },
          },
        },
      },
    }, {
      path: openapiSpecPath,
      urlPattern: new URLPattern({ pathname: openapiSpecPath.replaceAll(/{([^}]+)}/g, ":$1") }),
      errorHandler: defaultValidationErrorHandler,
      handler() {
        return memorizedDocs();
      },
    }); */

    if (defaultErrorHandler) {
      this.#defaultErrorHandler = defaultErrorHandler;
    }
  }

  path<P extends Extract<keyof Routes, string>>(path: P): ReturnType<typeof withPath<Routes, P>> {
    // deno-lint-ignore no-explicit-any
    return new RouteHandlerWithPathApi(this, path) as any;
  }

  addRoute(
    path: string,
    method: OpenboxRouteMethod,
    mediaType: string,
    handler: OpenboxServerRouteHandler,
    errorHandler?: OpenboxServerErrorHandler,
  ) {
    const routesMap = this.#routesByUppercasedMethodMap;

    const upperCasedMethod = method.toUpperCase();

    if (routesMap.get(upperCasedMethod)?.get(mediaType)?.byPathTemplateMap.has(path)) {
      throw new Error(`Duplicate route for the combination of method=${method} mediaType=${mediaType} path=${path}`);
    }

    const endpoint = this.endpoints.get(path, method);

    if (!endpoint) {
      throw new Error(`Defect: endpoint not found path=${path} method=${method}`);
    }

    const config = endpoint.config;
    const patternPath = path.replaceAll(/{([^}]+)}/g, ":$1");

    const route: OpenboxServerRoute = {
      config,
      path,
      mediaType,
      urlPattern: path !== patternPath ? new URLPattern({ pathname: patternPath }) : undefined,
      queryParams: endpoint.request.query,
      pathParams: endpoint.request.params,
      headerParams: endpoint.request.headers,
      bodySchema: endpoint.request.body?.[mediaType],
      errorHandler,
      handler,
    };

    let byMediaType = routesMap.get(upperCasedMethod)!;

    if (!byMediaType) {
      byMediaType = new Map();
      routesMap.set(upperCasedMethod, byMediaType);
    }

    let paths = byMediaType.get(mediaType);

    if (!paths) {
      paths = {
        byPathMap: new Map(),
        byPathTemplateMap: new Map(),
        patternList: [],
      };
      byMediaType.set(mediaType, paths);
    }

    paths.byPathTemplateMap.set(path, route);

    if (route.urlPattern !== undefined) {
      paths.patternList.push(route);
    } else {
      paths.byPathMap.set(route.path, route);
    }

    // this.registry.registerPath({
    //   ...config,
    //   responses: config.responses ?? {},
    // });

    return this;
  }

  private notFound() {
    return new Response("Not found", {
      status: 404,
    });
  }

  async handle(request: Request, connInfo: Deno.ServeHandlerInfo): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const headers = request.headers;

    const requestContentTypeParts = headers.get("content-type")?.split(";", 2);
    const requestContentType = requestContentTypeParts?.[0].trim() ?? "";

    const routes = this.#routesByUppercasedMethodMap.get(request.method)?.get(requestContentType);

    if (!routes) {
      return this.notFound();
    }

    let matchedRoute: OpenboxServerRoute | undefined;
    let params: Record<string, string | undefined> | undefined;

    matchedRoute = routes.byPathMap.get(pathname);

    if (!matchedRoute) {
      matchedRoute = routes.patternList.find((r) => r.urlPattern!.test(url));
      if (matchedRoute) {
        params = matchedRoute.urlPattern!.exec(url)!.pathname.groups;
      }
    }

    if (!matchedRoute) {
      return this.notFound();
    }

    const { pathParams, queryParams, headerParams, bodySchema } = matchedRoute;

    const errorHandler = matchedRoute.errorHandler ?? this.#defaultErrorHandler;

    const searchParams = url.searchParams;

    const validatedParams: [string, unknown][] = [];
    const validatedQuery: [string, unknown][] = [];
    const validatedHeaders: [string, unknown][] = [];

    if (pathParams) {
      const validatingParams = params ?? {};

      for (const param of pathParams) {
        const parsed = parseParam(param, validatingParams[param.name]);

        try {
          validatedParams.push([param.name, param.check ? param.check.Decode(parsed) : parsed]);
        } catch (e) {
          if (e instanceof TransformDecodeCheckError) {
            return errorHandler(
              OpenboxRequestErrorSource.Params,
              OpenboxRequestErrorType.SchemaValidation,
              e.error,
              param.name,
            );
          }
          return errorHandler(
            OpenboxRequestErrorSource.Params,
            OpenboxRequestErrorType.Internal,
            e,
            param.name,
          );
        }
      }
    }

    if (queryParams) {
      for (const param of queryParams) {
        const parsed = parseParam(param, searchParams.getAll(param.name));

        try {
          validatedQuery.push([param.name, param.check ? param.check.Decode(parsed) : parsed]);
        } catch (e) {
          if (e instanceof TransformDecodeCheckError) {
            return errorHandler(
              OpenboxRequestErrorSource.Query,
              OpenboxRequestErrorType.SchemaValidation,
              e.error,
              param.name,
            );
          }
          return errorHandler(
            OpenboxRequestErrorSource.Query,
            OpenboxRequestErrorType.Internal,
            e,
            param.name,
          );
        }
      }
    }

    if (headerParams) {
      for (const param of headerParams) {
        const parsed = parseParam(param, headers.get(param.name));

        try {
          validatedHeaders.push([param.name, param.check ? param.check.Decode(parsed) : parsed]);
        } catch (e) {
          if (e instanceof TransformDecodeCheckError) {
            return errorHandler(
              OpenboxRequestErrorSource.Headers,
              OpenboxRequestErrorType.SchemaValidation,
              e.error,
              param.name,
            );
          }
          return errorHandler(
            OpenboxRequestErrorSource.Headers,
            OpenboxRequestErrorType.Internal,
            e,
            param.name,
          );
        }
      }
    }

    let body: unknown = request.body;

    if (
      bodySchema && request.body !== null && requestContentType.length > 0
    ) {
      try {
        if (requestContentType === MediaTypes.Json) {
          body = await request.json();
        } else if (requestContentType === MediaTypes.Text) {
          body = await request.text();
        } else if (requestContentType === MediaTypes.UrlEncoded) {
          body = await request.formData();
        } else if (requestContentType === MediaTypes.FormData) {
          if (bodySchema.schema[Kind] === OpenboxStreamingMultipartFormData.description) {
            const boundaryParam = requestContentTypeParts?.[1].trim();
            let boundary: string;

            if (
              boundaryParam === undefined || !boundaryParam.startsWith("boundary=") ||
              ((boundary = boundaryParam.substring("boundary=".length)) && boundary.length === 0)
            ) {
              return errorHandler(
                OpenboxRequestErrorSource.Headers,
                OpenboxRequestErrorType.ProtocolValidation,
                new Error("Invalid multipart/form-data boundary"),
                "content-type",
              );
            }

            const multipartReader = new StreamingMultipartReader(
              readerFromStreamReader(request.body.getReader()),
              boundary,
            );
            body = multipartReader.partReaders();
          } else {
            body = await request.formData();
          }
        }
      } catch (cause) {
        return errorHandler(
          OpenboxRequestErrorSource.Body,
          OpenboxRequestErrorType.ProtocolValidation,
          new Error(`Invalid body for content-type ${requestContentType}`, {
            cause,
          }),
        );
      }

      if (bodySchema.check) {
        try {
          if (bodySchema.form && body instanceof FormData) {
            body = parseForm(bodySchema.form, body);
          }

          body = bodySchema.check.Decode(body);
        } catch (e) {
          if (e instanceof TransformDecodeCheckError) {
            return errorHandler(
              OpenboxRequestErrorSource.Body,
              OpenboxRequestErrorType.SchemaValidation,
              e.error,
            );
          }
          return errorHandler(
            OpenboxRequestErrorSource.Body,
            OpenboxRequestErrorType.Internal,
            e,
          );
        }
      }
    }

    const ctx: OpenboxServerRequestContext<unknown, unknown, unknown, unknown> = {
      url,
      params: Object.fromEntries(validatedParams),
      query: Object.fromEntries(validatedQuery),
      headers: Object.fromEntries(validatedHeaders),
      body,
      request,
      connInfo,
    };

    const maybePromise = matchedRoute.handler(ctx, this.#responder);
    const typedResponse = (maybePromise instanceof Promise) ? await maybePromise : maybePromise;
    return typedResponse.toResponse();
  }

  complete(_: UnimplementedRoutes<Routes>) {
    return this;
  }
}

export class ServerResponse<S extends number, M extends string, D, H> implements TypedResponse<S, M, D, H> {
  constructor(readonly status: S, readonly mediaType: M, readonly data: D, readonly headers: H) {
  }

  toResponse(): Response {
    let body: BodyInit;

    if (this.mediaType === MediaTypes.Json) {
      body = JSON.stringify(this.data, null, 2);
    } else {
      // deno-lint-ignore no-explicit-any
      body = this.data as any;
    }

    const headersInit = this.headers ?? undefined as HeadersInit | undefined;
    const headers = new Headers(
      (typeof headersInit === "object" && headersInit !== null && !Array.isArray(headersInit))
        ? transformRecordToStringValues(headersInit as Record<string, unknown>)
        : headersInit,
    );

    if (!headers.get("content-type")) {
      headers.set("content-type", this.mediaType);
    }

    return new Response(body, {
      status: this.status,
      headers,
    });
  }
}
