import { Static, TSchema } from "../deps/typebox.ts";

export type TypeboxInfer<T, Else = never> = T extends TSchema ? Static<T> : Else;

export type ToStatusCode<T extends string | number> = T extends string
  ? T extends `${infer N extends number}` ? N : never
  : T extends number ? T
  : never;

export interface TypedResponse<S extends number, M extends string, D, H> {
  readonly status: S;
  readonly mediaType: M;
  readonly data: D;
  readonly headers: H;
}

export type Coalesce<T, D> = [T] extends [never] ? D : T;

export type ExtractEndpointsByPath<P extends string, E> = P extends keyof E ? E[P] : never;

export type StripEmptyObjectType<T> = keyof T extends never ? Record<never, never> : T;

// deno-lint-ignore ban-types
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type GenericHeaders = HeadersInit;

export type MaybeRecord = Record<string, unknown> | undefined;

type NotAny<T> = 0 extends (1 & T) ? never : T;

export type ExtractUndefinedKeys<T> = {
  [K in keyof T]: undefined extends NotAny<T[K]> ? K : never;
}[keyof T];

type MakeKeysOptional<T, K extends keyof T> =
  & Omit<T, K>
  & {
    [P in K]?: T[P];
  };

export type MakeUndefinedKeysOptional<T> = MakeKeysOptional<T, ExtractUndefinedKeys<T>>;

declare const emptyObjectSymbol: unique symbol;

export type EmptyObject = { [emptyObjectSymbol]?: never };

export type IsEmptyObject<T> = T extends EmptyObject ? true : false;

export type NotLiterallyString<T> = string extends T ? never : T;

export type OmitUndefinedValues<O> =
  & {
    [K in keyof O as (O[K] extends undefined ? never : K)]: O[K];
  }
  // deno-lint-ignore ban-types
  & {};

export type OmitNeverValues<O> =
  & {
    [K in keyof O as O[K] extends never ? never : K]: O[K];
  }
  // deno-lint-ignore ban-types
  & {};

export type OmitEmptyObjectValues<O> =
  & {
    [K in keyof O as IsEmptyObject<O[K]> extends true ? never : K]: O[K];
  }
  // deno-lint-ignore ban-types
  & {};
