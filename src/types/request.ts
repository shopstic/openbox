import { OpenboxRouteConfig } from "./spec.ts";
import { MakeUndefinedKeysOptional, TypeboxInfer } from "./utils.ts";

type FromRecord<T> = {
  [M in Extract<keyof T, string>]: TypeboxInfer<T[M]>;
};

export type ExtractRequestParamsType<C extends OpenboxRouteConfig> = C extends {
  request: {
    params: infer P;
  };
} ? MakeUndefinedKeysOptional<FromRecord<P>>
  : never;

export type ExtractRequestQueryType<C extends OpenboxRouteConfig> = C extends {
  request: {
    query: infer Q;
  };
} ? MakeUndefinedKeysOptional<FromRecord<Q>>
  : never;

export type ExtractRequestHeadersType<C extends OpenboxRouteConfig> = C extends {
  request: {
    headers: infer H;
  };
} ? MakeUndefinedKeysOptional<FromRecord<H>>
  : never;

type ExtractRequestBodyMap<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypeboxInfer<Z>
    : never;
};

export type ExtractRequestBodyByMediaMapType<C extends OpenboxRouteConfig> = C extends {
  request: {
    body: {
      content: infer B;
    };
  };
} ? ExtractRequestBodyMap<B>
  : never;
