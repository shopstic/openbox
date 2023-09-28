import { GenericHeaders, ToStatusCode, TypeboxInfer, TypedResponse } from "./utils.ts";

type ExtractBodySchemaType<T> = TypeboxInfer<T, BodyInit | null>;
type ExtractHeaderSchemaType<T> = TypeboxInfer<T, unknown>;

type FromHeaders<T> =
  & {
    [M in Extract<keyof T, string>]: T[M] extends {
      schema: infer Z;
    } ? ExtractHeaderSchemaType<Z>
      : never;
  }
  // deno-lint-ignore ban-types
  & {};

type FromStatus<S extends number, T> = T extends {
  content: infer M;
} ? (
    T extends {
      headers: infer H;
    } ? FromMediaMap<S, M, FromHeaders<H>>
      : FromMediaMap<S, M, GenericHeaders>
  )
  : never;

type FromMediaMap<
  S extends number,
  T,
  H,
  K extends Extract<keyof T, string> = Extract<keyof T, string>,
> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypedResponse<S, M, ExtractBodySchemaType<Z>, H>
    : never;
}[K];

type FromResponses<
  T,
  K extends Extract<keyof T, string | number> = Extract<keyof T, string | number>,
> = {
  [S in Extract<keyof T, string | number>]: FromStatus<ToStatusCode<S>, T[S]>;
}[K];

export type TypedResponseUnion<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : TypedResponse<number, string, unknown, GenericHeaders>;
