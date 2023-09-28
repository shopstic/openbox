import { MakeUndefinedKeysOptional, ToStatusCode, TypeboxInfer } from "./utils.ts";

type HeadersFromSchemas<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypeboxInfer<Z, unknown>
    : never;
};

type BodyFromMediaTypeMap<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypeboxInfer<Z, BodyInit | null>
    : never;
};

type BodyFromStatusContentMap<T> = T extends {
  content: infer M;
} ? BodyFromMediaTypeMap<M>
  : never;

type HeadersFromStatus<T> = T extends {
  headers: infer H;
} ? MakeUndefinedKeysOptional<HeadersFromSchemas<H>>
  : never;

type FromResponses<T> = {
  [S in Extract<keyof T, string | number> as ToStatusCode<S>]: {
    headers: HeadersFromStatus<T[S]>;
  } & {
    body: BodyFromStatusContentMap<T[S]>;
  };
};

export type ResponseByStatusMap<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : never;
