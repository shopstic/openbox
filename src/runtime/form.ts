import { TObject, TSchema, TypeCompiler, TypeGuard } from "../deps.ts";
import { createParamInfo, OpenboxParam, parseParam } from "./param.ts";

export interface OpenboxForm<T extends TSchema = TSchema> {
  schema: T;
  paramNames: string[];
  params: Record<string, OpenboxParam>;
  defaultValue: Record<string, unknown>;
}

export function createOpenboxForm<T extends TObject>(
  schema: T,
): OpenboxForm<T> {
  const paramNames = Object.keys(schema.properties);
  const params: Record<string, OpenboxParam> = Object.fromEntries(
    paramNames.map((name) => {
      const paramSchema = schema.properties[name];

      return [
        name,
        {
          name,
          schema: paramSchema,
          info: createParamInfo(name, paramSchema),
          check: (TypeGuard.TSchema(paramSchema)) ? TypeCompiler.Compile(paramSchema) : undefined,
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
