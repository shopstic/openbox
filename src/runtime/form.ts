import { TObject, TSchema, TypeGuard } from "../deps.ts";
import { OpenboxSchemaRegistry } from "../registry.ts";
import { createParamInfo, OpenboxParam, parseParam } from "./param.ts";

export interface OpenboxForm<T extends TSchema = TSchema> {
  schema: T;
  paramNames: string[];
  params: Record<string, OpenboxParam>;
  defaultValue: Record<string, unknown>;
}

export function createOpenboxForm<T extends TObject>(
  registry: OpenboxSchemaRegistry,
  schema: T,
): OpenboxForm<T> {
  const paramNames = Object.keys(schema.properties);
  const params: Record<string, OpenboxParam> = Object.fromEntries(
    paramNames.map((name) => {
      const paramSchema = registry.deref(schema.properties[name]);

      return [
        name,
        {
          name,
          schema: paramSchema,
          info: createParamInfo(registry, name, paramSchema),
          check: (TypeGuard.TSchema(paramSchema)) ? registry.compile(paramSchema) : undefined,
        } satisfies OpenboxParam,
      ];
    }),
  );

  const defaultValue: Record<string, unknown> = Object.fromEntries(
    paramNames.map((name) => [name, params[name].info.defaultValue]),
  );

  return {
    schema,
    paramNames,
    params,
    defaultValue,
  };
}

export function parseForm(
  form: OpenboxForm,
  data?: FormData,
) {
  if (!data) {
    return form.defaultValue;
  }

  return Object.fromEntries(
    form.paramNames.map((name) => {
      const param = form.params[name];
      const value = parseParam(param, data.getAll(name));
      return [name, value];
    }),
  );
}
