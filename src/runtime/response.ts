import { TypeCompiler, TypeGuard } from "../deps.ts";
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
  config: C,
): OpenboxResponseSchemaMap | undefined {
  if (config.responses) {
    const responses = Object.entries(config.responses).flatMap(([statusCode, response]) => {
      if (response.content) {
        let headerParams: OpenboxParam[] | undefined = [];

        if (response.headers) {
          headerParams = [];
          for (const [name, { schema }] of Object.entries(response.headers)) {
            const param: OpenboxParam = {
              name,
              schema,
              info: createParamInfo(name, schema),
              check: TypeCompiler.Compile(schema),
              isSetCookieHeader: name.toLowerCase() === "set-cookie",
            };

            headerParams.push(param);
          }
        }

        return Object.entries(response.content).map(([mediaType, media]) => {
          return {
            statusCode: parseInt(statusCode),
            mediaType,
            bodySchema: {
              schema: media.schema,
              check: (TypeGuard.TSchema(media.schema)) ? TypeCompiler.Compile(media.schema) : undefined,
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
