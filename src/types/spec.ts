import { TSchema } from "../deps.ts";
import { EncodingObject, ExamplesObject, LinksObject, OperationObject } from "./openapi_spec.ts";

export type OpenboxRouteMethod = "get" | "post" | "put" | "delete" | "patch";

export interface OpenboxMediaTypeObject {
  schema: TSchema;
  examples?: ExamplesObject;
  example?: unknown;
  encoding?: EncodingObject;
}

export interface OpenboxResponseHeaderObject {
  description?: string;
  schema: TSchema;
}

export interface OpenboxResponseHeaderRecord {
  [headerName: string]: OpenboxResponseHeaderObject;
}

export interface OpenboxContentObject {
  [mediaType: string]: OpenboxMediaTypeObject;
}

export interface OpenboxRequestBody {
  description?: string;
  content: OpenboxContentObject;
  required?: boolean;
}

export interface OpenboxResponseConfig {
  description: string;
  headers?: {
    [headerName: string]: OpenboxResponseHeaderObject;
  };
  links?: LinksObject;
  content: OpenboxContentObject;
}

export type OpenboxRouteConfig<P extends string = string> =
  & Pick<OperationObject, "summary" | "tags" | "description">
  & {
    method: OpenboxRouteMethod;
    path: P;
    request?: {
      body?: OpenboxRequestBody;
      params?: Record<string, TSchema>;
      query?: Record<string, TSchema>;
      headers?: Record<string, TSchema>;
    };
    responses?: {
      [statusCode: string]: OpenboxResponseConfig;
    };
  };
