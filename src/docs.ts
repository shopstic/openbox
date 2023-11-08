import { TSchema, TypeGuard } from "./deps.ts";
import { OpenboxEndpoints } from "./endpoint.ts";
import { OPENBOX_REGISTRY_ID_PREFIX, OpenboxSchemaRegistry } from "./registry.ts";
import {
  ContentObject,
  ParameterLocation,
  ParameterObject,
  PathItemObject,
  PathsObject,
  ResponsesObject,
} from "./types/openapi_spec.ts";

function toParameters(
  schemaRegistry: OpenboxSchemaRegistry,
  params: Record<string, TSchema>,
  location: ParameterLocation,
): ParameterObject[] {
  return Object.entries(params).map(([name, { description, ...schema }]) => {
    let updatedSchema: TSchema = schema;
    let required = true;

    if (TypeGuard.TUnion(schemaRegistry.deref(schema))) {
      const anyOf: TSchema[] = [];

      for (const memberSchema of schema.anyOf) {
        if (TypeGuard.TUndefined(memberSchema)) {
          required = false;
        } else {
          anyOf.push(memberSchema);
        }
      }

      if (anyOf.length === 1) {
        updatedSchema = anyOf[0];
      }
    }

    return {
      name,
      in: location,
      schema: updatedSchema,
      description,
      required,
    } satisfies ParameterObject;
  });
}

export function toOpenapiSpecSchemas(registry: OpenboxSchemaRegistry) {
  return {
    schemas: Object.fromEntries(
      Array.from(registry.map).map((
        [id, { $id: _, ...schema }],
      ) => [id.slice(OPENBOX_REGISTRY_ID_PREFIX.length), schema]),
    ),
  };
}
export function toOpenapiSpecPaths(
  schemaRegistry: OpenboxSchemaRegistry,
  endpoints: OpenboxEndpoints<unknown>,
): PathsObject {
  return Object.fromEntries(
    Array.from(endpoints.endpointByPathByMethodMap).map(([path, endpointByMethodMap]) => {
      const pathItem: PathItemObject = {};

      for (const [method, endpoint] of endpointByMethodMap) {
        const config = endpoint.config;
        const pathParams: ParameterObject[] = config.request?.params
          ? toParameters(schemaRegistry, config.request.params, "path")
          : [];
        const headerParams: ParameterObject[] = config.request?.headers
          ? toParameters(schemaRegistry, config.request.headers, "header")
          : [];
        const queryParams: ParameterObject[] = config.request?.query
          ? toParameters(schemaRegistry, config.request.query, "query")
          : [];
        const responses: ResponsesObject = config.responses
          ? Object.fromEntries(
            Object.entries(config.responses).map(([statusCode, { headers, ...response }]) => {
              return [statusCode, {
                ...response,
                ...(headers
                  ? {
                    headers: Object.fromEntries(
                      Object.entries(headers).map(([name, { description, ...schema }]) => {
                        return [name, {
                          schema,
                          description,
                        }];
                      }),
                    ),
                  }
                  : {}),
              }];
            }),
          )
          : {};

        pathItem[method] = {
          summary: config.summary,
          description: config.description,
          operationId: config.operationId,
          tags: config.tags,
          parameters: [
            ...pathParams,
            ...headerParams,
            ...queryParams,
          ],
          ...config.request?.body
            ? {
              requestBody: {
                description: config.request.body.description,
                content: Object.fromEntries(
                  Object.entries(config.request.body.content).map(([mediaType, mediaTypeObject]) => [
                    mediaType,
                    {
                      ...mediaTypeObject,
                    } as ContentObject,
                  ]),
                ),
                required: true,
              },
            }
            : {},
          responses,
        };
      }

      return [path, pathItem];
    }),
  );
}
