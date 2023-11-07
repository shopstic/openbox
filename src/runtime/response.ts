import { TypeGuard } from "../deps.ts";
import { OpenboxSchemaRegistry } from "../registry.ts";
import { OpenboxRouteConfig } from "../types/spec.ts";
import { createParamInfo, OpenboxParam } from "./param.ts";
import { OpenboxBodySchema } from "./request.ts";

export type OpenboxResponseSchemaMap = Map<
  number,
  Map<string, {
    body?: OpenboxBodySchema;
    headers?: OpenboxParam[];
  }>
>;

export function extractResponseSchemaMap<C extends OpenboxRouteConfig>(
  registry: OpenboxSchemaRegistry,
  config: C,
): OpenboxResponseSchemaMap | undefined {
  if (config.responses) {
    const responses = Object.entries(config.responses).flatMap(([statusCode, response]) => {
      if (response.content) {
        let headerParams: OpenboxParam[] | undefined = [];

        if (response.headers) {
          headerParams = [];
          for (const [name, schema] of Object.entries(response.headers)) {
            const derefedSchema = registry.deref(schema);

            const param: OpenboxParam = {
              name,
              schema: derefedSchema,
              info: createParamInfo(registry, name, derefedSchema),
              check: (TypeGuard.TSchema(derefedSchema)) ? registry.compile(derefedSchema) : undefined,
              isSetCookieHeader: name.toLowerCase() === "set-cookie",
            };

            headerParams.push(param);
          }
        }

        return Object.entries(response.content).map(([mediaType, media]) => {
          const derefedSchema = registry.deref(media.schema);

          return {
            statusCode: parseInt(statusCode),
            mediaType,
            bodySchema: {
              schema: derefedSchema,
              check: (TypeGuard.TSchema(derefedSchema)) ? registry.compile(derefedSchema) : undefined,
            },
            headerParams,
          };
        });
      }

      return [];
    });

    return responses.reduce(
      (map, { statusCode, mediaType, bodySchema, headerParams }) => {
        if (!map.has(statusCode)) {
          map.set(statusCode, new Map());
        }

        map.get(statusCode)!.set(mediaType, {
          body: bodySchema,
          headers: headerParams,
        });
        return map;
      },
      new Map() as OpenboxResponseSchemaMap,
    );
  }
}
