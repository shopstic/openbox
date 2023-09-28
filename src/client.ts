import { IsEmptyObject } from "./deps.test.ts";
import { TransformDecodeCheckError, ValueError } from "./deps.ts";
import {
  ExtractRequestBodyByMediaMap,
  OpenboxEndpoint,
  OpenboxEndpointResponseByStatusMap,
  OpenboxEndpoints,
  OpenboxEndpointTypeBag,
  transformRecordToStringValues,
} from "./endpoint.ts";
import { MediaTypes } from "./runtime/media_type.ts";
import { parseParam } from "./runtime/param.ts";
import { OpenboxRouteMethod } from "./types/spec.ts";
import {
  EmptyObject,
  ExtractEndpointsByPath,
  MaybeRecord,
  NotLiterallyString,
  OmitUndefinedValues,
  TypedResponse,
} from "./types/utils.ts";

interface OpenboxClientRequestContext<
  P extends MaybeRecord = MaybeRecord,
  Q extends MaybeRecord = MaybeRecord,
  H extends MaybeRecord = MaybeRecord,
  B extends unknown = unknown,
> {
  params: P;
  query: Q;
  headers: H;
  body: B;
}

export class ClientResponse<S extends number = number, M extends string = string, D = unknown, H = unknown>
  implements TypedResponse<S, M, D, H> {
  readonly ok: boolean;

  constructor(
    readonly status: S,
    readonly mediaType: M,
    readonly data: D,
    readonly response: Response,
    readonly headers: H,
  ) {
    this.ok = response.ok;
  }
}

export class OpenboxClientUnexpectedResponseError extends Error {
  readonly name = OpenboxClientUnexpectedResponseError.name;
  constructor(readonly body: unknown, readonly response: Response) {
    super(`Received an unexpected response with status=${response.status} ${response.statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OpenboxClientResponseHeaderValidationError extends Error {
  readonly name = OpenboxClientResponseHeaderValidationError.name;
  constructor(readonly headerName: string, readonly headerValue: unknown, readonly error: ValueError) {
    super(`Header with name '${headerName}' and value '${headerValue}' failed schema validation`);
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "message", {
      get() {
        return JSON.stringify(error);
      },
      enumerable: false,
      configurable: false,
    });
  }
}

export class OpenboxClientResponseValidationError extends Error {
  readonly name = OpenboxClientResponseValidationError.name;
  constructor(readonly response: Response, readonly data: string, readonly error: ValueError) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "message", {
      get() {
        return JSON.stringify(error);
      },
      enumerable: false,
      configurable: false,
    });
  }
}

type ExtractClientResponseArg<Bag> = Bag extends OpenboxEndpointTypeBag<
  MaybeRecord,
  MaybeRecord,
  MaybeRecord,
  MaybeRecord,
  infer R,
  OpenboxEndpointResponseByStatusMap
> ? TypedResponseToClientResponse<R>
  : ClientResponse<number, string, unknown, HeadersInit>;

type TypedResponseToClientResponse<R> = R extends TypedResponse<infer S, infer M, infer D, infer H>
  ? ClientResponse<S, M, D, H>
  : never;

function renderPath(template: string, params?: Record<string, string>) {
  if (params) {
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(
          `Expected path key ${key} doesnt exist in payload: ${JSON.stringify(params)}`,
        );
      }
      return encodeURIComponent(params[key]);
    });
  }

  return template;
}

const acceptHeaderValueByEndpointMap = new WeakMap<OpenboxEndpoint, string>();

function toFormValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function toUrlSearchParams(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, String(toFormValue(v)));
      }
    } else {
      params.append(key, String(toFormValue(value)));
    }
  }

  return params;
}

function toFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        // deno-lint-ignore no-explicit-any
        formData.append(key, toFormValue(v) as any);
      }
    } else {
      // deno-lint-ignore no-explicit-any
      formData.append(key, toFormValue(value) as any);
    }
  }

  return formData;
}

async function openapiFetch({ baseUrl, pathTemplate, method, request, mediaType, endpoint, fetchImpl = fetch }: {
  baseUrl: string;
  pathTemplate: string;
  method: OpenboxRouteMethod;
  endpoint: OpenboxEndpoint;
  fetchImpl?: typeof fetch;
  mediaType?: string;
  request?: OpenboxClientRequestContext;
}): Promise<ClientResponse> {
  const requestParams = request?.params !== undefined ? transformRecordToStringValues(request.params) : undefined;
  const searchParams = request?.query !== undefined ? toUrlSearchParams(request.query) : undefined;
  const requestPath = requestParams ? renderPath(pathTemplate, requestParams) : pathTemplate;
  const requestUrl = new URL(
    `${baseUrl}${requestPath}${searchParams !== undefined ? `?${searchParams}` : ""}`,
  );
  const requestHeaders = new Headers(
    request?.headers !== undefined ? transformRecordToStringValues(request.headers) : undefined,
  );

  let requestBody = request?.body;

  if (requestBody !== undefined) {
    if (!mediaType) {
      throw new Error("Defect: mediaType is required when requestBody is defined");
    }

    if (mediaType === MediaTypes.FormData) {
      // Don't set content-type header, let the underlying fetch implementation handle it with proper boundary
      requestBody = toFormData(requestBody as Record<string, unknown>);
    } else {
      requestHeaders.set("content-type", mediaType);

      if (mediaType === MediaTypes.Json) {
        requestBody = JSON.stringify(requestBody);
      } else if (mediaType === MediaTypes.UrlEncoded) {
        requestBody = toUrlSearchParams(requestBody as Record<string, unknown>);
      }
    }
  }

  const responseBodyMap = endpoint.response.body;

  if (responseBodyMap !== undefined) {
    let acceptHeaderValue = acceptHeaderValueByEndpointMap.get(endpoint);

    if (acceptHeaderValue === undefined) {
      acceptHeaderValue = Array.from(
        new Set(Array.from(responseBodyMap.values()).flatMap((m) => Array.from(m.keys()))),
      ).join(", ");
      acceptHeaderValueByEndpointMap.set(endpoint, acceptHeaderValue);
    }

    requestHeaders.set("accept", acceptHeaderValue);
  }

  const response = await fetchImpl(requestUrl, {
    method: method.toUpperCase(),
    headers: requestHeaders,
    // deno-lint-ignore no-explicit-any
    body: requestBody as any,
  });

  const { status: responseStatus, headers: responseHeaders } = response;
  const responseContentType = response.headers.get("content-type");

  if (responseBodyMap === undefined) {
    response.body?.cancel();
    return new ClientResponse(responseStatus, "", undefined, response, responseHeaders);
  }

  let responseBody;

  if (responseContentType === MediaTypes.Json) {
    responseBody = await response.json();
  } else if (responseContentType?.startsWith("text/")) {
    responseBody = await response.text();
  } else {
    responseBody = response.body;
  }

  if (responseContentType === null) {
    throw new OpenboxClientUnexpectedResponseError(responseBody, response);
  }

  const schemas = responseBodyMap.get(responseStatus)?.get(responseContentType);

  if (schemas === undefined) {
    throw new OpenboxClientUnexpectedResponseError(responseBody, response);
  }

  const { body: responseBodySchema, headers: responseHeaderParams } = schemas;

  const validatedResponseHeaders = responseHeaderParams
    ? Object.fromEntries(
      responseHeaderParams.map((param) => {
        const headerName = param.name;
        const headerValue = parseParam(
          param,
          param.isSetCookieHeader ? responseHeaders.getSetCookie() : responseHeaders.get(headerName),
        );

        try {
          return [headerName, param.check ? param.check.Decode(headerValue) : headerValue];
        } catch (e) {
          if (e instanceof TransformDecodeCheckError) {
            throw new OpenboxClientResponseHeaderValidationError(
              headerName,
              headerValue,
              e.error,
            );
          }
          throw e;
        }
      }),
    )
    : responseHeaders;

  if (responseBodySchema && responseBodySchema.check) {
    try {
      return new ClientResponse(
        responseStatus,
        responseContentType,
        responseBodySchema.check.Decode(responseBody),
        response,
        validatedResponseHeaders,
      );
    } catch (e) {
      throw new OpenboxClientResponseValidationError(
        response,
        responseBody,
        (e instanceof TransformDecodeCheckError) ? e.error : e,
      );
    }
  }

  return new ClientResponse(responseStatus, responseContentType, responseBody, response, responseHeaders);
}

export const createRequester = <Req extends OpenboxClientRequestContext | undefined, Res extends ClientResponse>(
  baseUrl: string,
  pathTemplate: string,
  method: OpenboxRouteMethod,
  mediaType: string | undefined,
  endpoint: OpenboxEndpoint,
) => {
  return (request: Req) =>
    openapiFetch({
      baseUrl,
      pathTemplate,
      method,
      request,
      endpoint,
      mediaType,
    }) as Promise<Res>;
};

type ExtractClientRequestArg<Bag, Body> = Bag extends
  OpenboxEndpointTypeBag<infer P, infer Q, infer H, unknown, unknown, OpenboxEndpointResponseByStatusMap>
  ? OmitUndefinedValues<OpenboxClientRequestContext<P, Q, H, Body>>
  : undefined;

class ClientApi {
  constructor(
    readonly baseUrl: string,
    readonly endpoints: OpenboxEndpoints<unknown>,
    readonly fetchImpl?: typeof fetch,
  ) {}

  path(path: string) {
    return new ClientWithPathApi(this, path);
  }
}

class ClientWithPathApi {
  constructor(readonly client: ClientApi, readonly path: string) {}

  get get() {
    return new ClientWithPathWithMethodApi(this, "get").empty;
  }

  get post() {
    return new ClientWithPathWithMethodApi(this, "post");
  }
  get put() {
    return new ClientWithPathWithMethodApi(this, "put");
  }
  get patch() {
    return new ClientWithPathWithMethodApi(this, "patch");
  }
  get delete() {
    return new ClientWithPathWithMethodApi(this, "delete");
  }
}

class ClientWithPathWithMethodWithMediaTypeApi {
  constructor(
    readonly clientWithPathWithMethod: ClientWithPathWithMethodApi,
    readonly mediaType?: string,
  ) {}

  send(request?: OpenboxClientRequestContext) {
    const { method, clientWithPath: { path, client: { baseUrl, endpoints } } } = this.clientWithPathWithMethod;
    const endpoint = endpoints.get(path, method);

    if (!endpoint) {
      throw new Error(`Defect: no endpoint found for path=${method} method=${path}`);
    }

    const mediaType = this.mediaType;
    if (mediaType !== undefined && !endpoint.request.body?.[mediaType]) {
      throw new Error(`Defect: no endpoint found for path=${method} method=${path} mediaType=${mediaType}`);
    }

    return openapiFetch({
      baseUrl,
      pathTemplate: path,
      method,
      request,
      endpoint,
      mediaType,
    });
  }
}

class ClientWithPathWithMethodApi {
  constructor(readonly clientWithPath: ClientWithPathApi, readonly method: OpenboxRouteMethod) {}

  contentType(mediaType?: string) {
    const api = new ClientWithPathWithMethodWithMediaTypeApi(this, mediaType);
    return api.send.bind(api);
  }

  get empty() {
    return this.contentType();
  }

  get json() {
    return this.contentType(MediaTypes.Json);
  }

  get form() {
    return this.contentType(MediaTypes.FormData);
  }

  get urlEncoded() {
    return this.contentType(MediaTypes.UrlEncoded);
  }

  get text() {
    return this.contentType(MediaTypes.Text);
  }
}

function withRoutes<Routes>() {
  function withPath<
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
      type MediaTypes = Extract<keyof ReqBodyMap, string>;
      type Res = ExtractClientResponseArg<TypeBag>;
      type SendWithOptionalArg<P, R> = IsEmptyObject<P> extends true ? (request?: P) => R : (request: P) => R;

      type WithCustom = Method extends "get" ? EmptyObject : {
        contentType: <T extends Extract<MediaTypes, string>>(
          mediaType: T,
        ) => SendWithOptionalArg<ExtractClientRequestArg<TypeBag, ReqBodyMap[T]>, Promise<Res>>;
      };

      type WithMedia<M, K extends string> = NotLiterallyString<MediaTypes> extends never ? EmptyObject
        : M extends MediaTypes ? {
            [key in K]: (request: ExtractClientRequestArg<TypeBag, ReqBodyMap[M]>) => Promise<Res>;
          }
        : EmptyObject;

      type WithoutBody = Method extends "get"
        ? SendWithOptionalArg<ExtractClientRequestArg<TypeBag, undefined>, Promise<Res>>
        : EmptyObject;

      return {} as
        & WithoutBody
        & WithCustom
        & WithMedia<typeof MediaTypes.Json, "json">
        & WithMedia<typeof MediaTypes.FormData, "form">
        & WithMedia<typeof MediaTypes.UrlEncoded, "urlEncoded">
        & WithMedia<typeof MediaTypes.Text, "text">;
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

  return withPath;
}

export function createOpenboxClient<Routes>(
  { baseUrl, endpoints, fetchImpl }: { baseUrl: string; endpoints: OpenboxEndpoints<Routes>; fetchImpl?: typeof fetch },
): ReturnType<typeof withRoutes<Routes>> {
  const api = new ClientApi(baseUrl, endpoints, fetchImpl);
  // deno-lint-ignore no-explicit-any
  return api.path.bind(api) as any;
}
