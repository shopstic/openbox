import { TSchema, TypeCheck, TypeGuard } from "../deps.ts";
import { OpenboxSchemaRegistry } from "../registry.ts";
import { OpenboxRouteConfig } from "../types/spec.ts";
import { createOpenboxForm, OpenboxForm } from "./form.ts";
import { createOpenboxParamList, OpenboxParam } from "./param.ts";

export function extractRequestQuerySchema<C extends OpenboxRouteConfig>(
  registry: OpenboxSchemaRegistry,
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.query;
  return createOpenboxParamList(registry, record);
}

export function extractRequestParamsSchema<C extends OpenboxRouteConfig>(
  registry: OpenboxSchemaRegistry,
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.params;
  return createOpenboxParamList(registry, record);
}

export function extractRequestHeadersSchema<C extends OpenboxRouteConfig>(
  registry: OpenboxSchemaRegistry,
  config: C,
): OpenboxParam[] | undefined {
  const record = config.request?.headers;
  return createOpenboxParamList(registry, record);
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
  registry: OpenboxSchemaRegistry,
  config: C,
): OpenboxBodySchemaMap | undefined {
  const content = config.request?.body?.content;

  if (content) {
    return Object.fromEntries(
      Object.entries(content).map(([media, { schema }]) => {
        const derefedSchema = registry.deref(schema);

        return [
          media,
          {
            schema: derefedSchema,
            form: ((media === "multipart/form-data" || media === "application/x-www-form-urlencoded") &&
                TypeGuard.TObject(derefedSchema))
              ? createOpenboxForm(registry, derefedSchema)
              : undefined,
            check: (TypeGuard.TSchema(derefedSchema)) ? registry.compile(derefedSchema) : undefined,
          } satisfies OpenboxBodySchema,
        ];
      }),
    );
  }
}
