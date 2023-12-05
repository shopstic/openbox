import {
  extractRequestBodySchemaMap,
  extractRequestHeadersSchema,
  extractRequestParamsSchema,
  extractRequestQuerySchema,
  OpenboxBodySchemaMap,
} from "./runtime/request.ts";
import { extractResponseSchemaMap, OpenboxResponseSchemaMap } from "./runtime/response.ts";
import type {
  ExtractRequestBodyByMediaMapType,
  ExtractRequestHeadersType,
  ExtractRequestParamsType,
  ExtractRequestQueryType,
} from "./types/request.ts";
import { IsEmptyObject, MaybeRecord, OmitEmptyObjectValues, OmitNeverValues, Simplify } from "./types/utils.ts";
import { TypedResponseUnion } from "./types/typed_response.ts";
import { OpenboxRouteConfig, OpenboxRouteMethod } from "./types/spec.ts";
import { OpenboxParam } from "./runtime/param.ts";
import { ResponseByStatusMap } from "./types/response.ts";
import { OpenboxSchemaRegistry } from "./registry.ts";
import { TSchema } from "./deps/typebox.ts";

export type OpenboxJsonRouteConfig<P extends string = string> =
  & Pick<OpenboxRouteConfig, "method" | "summary" | "tags" | "description">
  & {
    path: P;
    request?: Omit<NonNullable<OpenboxRouteConfig["request"]>, "body"> & {
      body?: TSchema;
    };
    response: {
      description: string;
      body?: TSchema;
    };
  };

export type OpenboxJsonRouteConfigToRouteConfig<P extends string, C extends OpenboxJsonRouteConfig<P>> =
  & Omit<C, "request" | "response">
  & {
    request: Omit<NonNullable<C["request"]>, "body"> & {
      body: undefined extends NonNullable<C["request"]>["body"] ? undefined
        : {
          content: {
            "application/json": {
              schema: NonNullable<NonNullable<C["request"]>["body"]>;
            };
          };
        };
    };
    responses: {
      200:
        & Omit<C["response"], "body">
        & (undefined extends C["response"]["body"] ? undefined : {
          content: {
            "application/json": {
              schema: NonNullable<C["response"]["body"]>;
            };
          };
        });
    };
  };

export function jsonRouteConfigToRouteConfig(config: OpenboxJsonRouteConfig): OpenboxRouteConfig {
  const { method, path, request, response: { body: responseBody, ...response } } = config;

  return {
    method,
    path,
    request: request
      ? {
        ...request,
        body: request.body
          ? {
            content: {
              "application/json": {
                schema: request.body,
              },
            },
          }
          : undefined,
      }
      : undefined,
    responses: responseBody
      ? {
        200: {
          ...response,
          content: {
            "application/json": {
              schema: responseBody,
            },
          },
        },
      }
      : undefined,
  };
}

export interface OpenboxEndpoint {
  config: OpenboxRouteConfig<string>;
  request: {
    query?: OpenboxParam[];
    params?: OpenboxParam[];
    headers?: OpenboxParam[];
    body?: OpenboxBodySchemaMap;
  };
  response: {
    body?: OpenboxResponseSchemaMap;
  };
}

export type OpenboxEndpointResponse = {
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};

export type OpenboxEndpointResponseByStatusMap = Record<number, OpenboxEndpointResponse>;

export type OpenboxEndpointTypeBag<
  QP extends MaybeRecord = MaybeRecord,
  QQ extends MaybeRecord = MaybeRecord,
  QH extends MaybeRecord = MaybeRecord,
  QB = unknown,
  RU = unknown,
  RM extends OpenboxEndpointResponseByStatusMap = OpenboxEndpointResponseByStatusMap,
> = {
  requestParams: QP;
  requestQuery: QQ;
  requestHeaders: QH;
  requestBody: QB;
  responseUnion: RU;
  responseByStatusMap: RM;
};

export type ExtractRequestBodyByMediaMap<Bag> = Bag extends
  OpenboxEndpointTypeBag<MaybeRecord, MaybeRecord, MaybeRecord, infer B, unknown, OpenboxEndpointResponseByStatusMap>
  ? B
  : undefined;

type PathKey = string;

export type OpenboxExtractEndpointTypeBag<
  E,
  M extends OpenboxRouteConfig["method"],
  P extends OpenboxRouteConfig["path"],
> = E extends OpenboxEndpoints<infer R>
  ? M extends keyof R ? (P extends keyof R[M] ? (R[M][P] extends OpenboxEndpointTypeBag ? R[M][P] : never) : never)
  : never
  : never;

export type OpenboxExtractRequestMediaTypes<Bag> = Bag extends
  OpenboxEndpointTypeBag<MaybeRecord, MaybeRecord, MaybeRecord, infer B, unknown, OpenboxEndpointResponseByStatusMap>
  ? Extract<keyof B, string>
  : never;

export type OpenboxExtractRequestBodyTypeByMedia<B, M> = M extends keyof B ? B[M] : never;

export class OpenboxEndpoints<R> {
  static merge<A, B>(left: OpenboxEndpoints<A>, right: OpenboxEndpoints<B>): OpenboxEndpoints<A & B> {
    const leftMap = left.endpointByPathByMethodMap;
    const rightMap = right.endpointByPathByMethodMap;
    const mergedMap = new Map<string, Map<OpenboxRouteMethod, OpenboxEndpoint>>();

    for (const [path, methodMap] of leftMap) {
      if (!mergedMap.has(path)) {
        mergedMap.set(path, new Map());
      }

      for (const [method, endpoint] of methodMap) {
        mergedMap.get(path)!.set(method, endpoint);
      }
    }

    for (const [path, methodMap] of rightMap) {
      if (!mergedMap.has(path)) {
        mergedMap.set(path, new Map());
      }

      for (const [method, endpoint] of methodMap) {
        mergedMap.get(path)!.set(method, endpoint);
      }
    }

    const mergedSchemaRegistry = (left.schemaRegistry !== right.schemaRegistry)
      ? left.schemaRegistry.merge(right.schemaRegistry)
      : left.schemaRegistry;

    return new OpenboxEndpoints(mergedSchemaRegistry, mergedMap);
  }

  merge<E>(other: OpenboxEndpoints<E>): OpenboxEndpoints<R & E> {
    return OpenboxEndpoints.merge(this, other);
  }

  constructor(
    public readonly schemaRegistry: OpenboxSchemaRegistry,
    public readonly endpointByPathByMethodMap: Map<PathKey, Map<OpenboxRouteMethod, OpenboxEndpoint>> = new Map(),
  ) {
  }

  get(path: PathKey, method: OpenboxRouteMethod): OpenboxEndpoint | undefined {
    return this.endpointByPathByMethodMap.get(path)?.get(method);
  }

  jsonEndpoint<P extends string, J extends OpenboxJsonRouteConfig<P>>(
    jsonConfig: J,
  ) {
    const config = jsonRouteConfigToRouteConfig(jsonConfig) as OpenboxJsonRouteConfigToRouteConfig<P, J>;
    return this.endpoint(config);
  }

  endpoint<P extends string, C extends OpenboxRouteConfig<P>>(
    config: C,
  ): OpenboxEndpoints<
    & R
    & {
      [p in C["path"]]: {
        [m in C["method"]]: OpenboxEndpointTypeBag<
          Simplify<ExtractRequestParamsType<C>>,
          Simplify<ExtractRequestQueryType<C>>,
          Simplify<ExtractRequestHeadersType<C>>,
          ExtractRequestBodyByMediaMapType<C>,
          TypedResponseUnion<C>,
          ResponseByStatusMap<C>
        >;
      };
    }
  > {
    const endpoint: OpenboxEndpoint = {
      config,
      request: {
        query: extractRequestQuerySchema(this.schemaRegistry, config),
        params: extractRequestParamsSchema(this.schemaRegistry, config),
        headers: extractRequestHeadersSchema(this.schemaRegistry, config),
        body: extractRequestBodySchemaMap(this.schemaRegistry, config),
      },
      response: {
        body: extractResponseSchemaMap(this.schemaRegistry, config),
      },
    };

    const endpointByPathByMethodMap = this.endpointByPathByMethodMap;

    if (!endpointByPathByMethodMap.has(config.path)) {
      endpointByPathByMethodMap.set(config.path, new Map());
    }

    endpointByPathByMethodMap.get(config.path)!.set(config.method, endpoint);

    return this;
  }
}

export function defineOpenboxEndpoint<P extends string, C extends OpenboxRouteConfig<P>>(endpoint: C): C {
  return endpoint;
}

export function defineOpenboxJsonEndpoint<P extends string, J extends OpenboxJsonRouteConfig<P>>(
  jsonConfig: J,
): OpenboxJsonRouteConfigToRouteConfig<P, J> {
  return jsonRouteConfigToRouteConfig(jsonConfig) as OpenboxJsonRouteConfigToRouteConfig<P, J>;
}

export function transformRecordToStringValues(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (value instanceof Date) {
        return [key, value.toISOString()];
      }

      return [key, String(value)];
    }),
  );
}

function eraseRoute<Routes, Path extends string, Method extends OpenboxRouteMethod, ReqMediaType extends string>() {
  /* type Routes = {
    "/alivez": {
      get: OpenboxEndpointTypeBag<never, never, never, {
        "text/plain": "OK";
        // "application/json": {
        //   isOk: boolean;
        // };
      }>;
      post: OpenboxEndpointTypeBag<never, never, never, {
        "text/plain": "OK";
        "application/json": {
          isOk: boolean;
        };
      }>;
    };
  };
  type Path = "/alivez";
  type M = "get";
  type ReqMediaType = "text/plain"; */

  function eraseRequestMediaType<
    TypeBag,
  >() {
    type ReqBodyByMediaMap = ExtractRequestBodyByMediaMap<TypeBag>;
    type NewTypeBag = TypeBag extends OpenboxEndpointTypeBag<
      infer QP,
      infer QQ,
      infer QH,
      unknown,
      infer RU,
      infer RM
    > ? IsEmptyObject<Omit<ReqBodyByMediaMap, ReqMediaType>> extends true ? never
      : OpenboxEndpointTypeBag<QP, QQ, QH, Simplify<Omit<ReqBodyByMediaMap, ReqMediaType>>, RU, RM>
      : never;

    type NewRoute = {
      [m in Method]: NewTypeBag;
    };

    return {} as NewRoute;
  }

  type ReplaceRoute<TypeBag> = ReturnType<typeof eraseRequestMediaType<TypeBag>>;

  type NewRoutes = OmitEmptyObjectValues<
    {
      [P in keyof Routes]: P extends Path
        ? (Method extends keyof Routes[P] ? OmitNeverValues<Omit<Routes[P], Method> & (ReplaceRoute<Routes[P][Method]>)>
          : Routes[P])
        : Routes[P];
    }
  >;

  return {} as NewRoutes;
}

export type OpenboxEraseRoute<
  Routes,
  Path extends string,
  Method extends OpenboxRouteMethod,
  ReqMediaType extends string,
> = ReturnType<typeof eraseRoute<Routes, Path, Method, ReqMediaType>>;

/* type Debug = {
  "/users/{id}": {
    post: OpenboxEndpointTypeBag<
      never,
      never,
      never,
      {
        "application/json": string;
      },
      TypedResponse<200, "application/json", string, HeadersInit>,
      Record<200, {
        body: {
          "application/json": string;
        };
        headers: {
          foo: string;
        };
      }>
    >;
  };
};

type D = OpenboxEraseRoute<Debug, "/users/{id}", "post", typeof MediaTypes.Json>; */
