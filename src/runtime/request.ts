import { TSchema, TypeCheck, TypeCompiler, TypeGuard } from "../deps.ts";
import { OpenboxRouteConfig } from "../types/spec.ts";
import { createOpenboxForm, OpenboxForm } from "./form.ts";
import { createOpenboxParamList, OpenboxParam } from "./param.ts";

export function extractRequestQuerySchema<C extends OpenboxRouteConfig>(
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.query;
  return createOpenboxParamList(record);
}

export function extractRequestParamsSchema<C extends OpenboxRouteConfig>(
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.params;
  return createOpenboxParamList(record);
}

export function extractRequestHeadersSchema<C extends OpenboxRouteConfig>(
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.headers;
  return createOpenboxParamList(record);
}

export type OpenboxBodySchema = {
  schema: TSchema;
  form?: OpenboxForm;
  check?: TypeCheck<TSchema>;
};

export type OpenboxBodySchemaMap = {
  [media: string]: OpenboxBodySchema;
};

export function extractRequestBodySchemaMap<C extends OpenboxRouteConfig>(
  config: C,
): OpenboxBodySchemaMap | undefined {
  const content = config.request?.body?.content;

  if (content) {
    return Object.fromEntries(
      Object.entries(content).map(([media, { schema }]) => {
        return [
          media,
          {
            schema,
            form: ((media === "multipart/form-data" || media === "application/x-www-form-urlencoded") &&
                TypeGuard.TObject(schema))
              ? createOpenboxForm(schema)
              : undefined,
            check: (TypeGuard.TSchema(schema)) ? TypeCompiler.Compile(schema) : undefined,
          } satisfies OpenboxBodySchema,
        ];
      }),
    );
  }
}
