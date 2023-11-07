// Derived from https://github.com/metadevpro/openapi3-ts

export interface ServerObject extends ISpecificationExtension {
  url: string;
  description?: string;
  variables?: { [v: string]: ServerVariableObject };
}
export interface ServerVariableObject extends ISpecificationExtension {
  enum?: string[] | boolean[] | number[];
  default: string | boolean | number;
  description?: string;
}

export function getExtension(obj: ISpecificationExtension | undefined, extensionName: string): unknown {
  if (!obj) {
    return undefined;
  }
  if (SpecificationExtension.isValidExtension(extensionName)) {
    return obj[extensionName as IExtensionName];
  }
  return undefined;
}
export function addExtension(
  obj: ISpecificationExtension | undefined,
  extensionName: string,
  extension: unknown,
): void {
  if (obj && SpecificationExtension.isValidExtension(extensionName)) {
    obj[extensionName as IExtensionName] = extension;
  }
}

export type IExtensionName = `x-${string}`;
// deno-lint-ignore no-explicit-any
export type IExtensionType = any;
export type ISpecificationExtension = {
  [extensionName: IExtensionName]: IExtensionType;
};

export class SpecificationExtension implements ISpecificationExtension {
  [extensionName: IExtensionName]: unknown;

  static isValidExtension(extensionName: string): boolean {
    return /^x-/.test(extensionName);
  }

  getExtension(extensionName: string): unknown {
    if (!SpecificationExtension.isValidExtension(extensionName)) {
      throw new Error(
        `Invalid specification extension: '${extensionName}'. Extensions must start with prefix 'x-`,
      );
    }
    if (this[extensionName as IExtensionName]) {
      return this[extensionName as IExtensionName];
    }
    return null;
  }
  addExtension(extensionName: string, payload: unknown): void {
    if (!SpecificationExtension.isValidExtension(extensionName)) {
      throw new Error(
        `Invalid specification extension: '${extensionName}'. Extensions must start with prefix 'x-`,
      );
    }
    this[extensionName as IExtensionName] = payload;
  }
  listExtensions(): string[] {
    const res: string[] = [];
    for (const propName in this) {
      if (Object.prototype.hasOwnProperty.call(this, propName)) {
        if (SpecificationExtension.isValidExtension(propName)) {
          res.push(propName);
        }
      }
    }
    return res;
  }
}

export interface OpenapiObject extends ISpecificationExtension {
  openapi: string;
  info: InfoObject;
  servers?: ServerObject[];
  paths?: PathsObject;
  components?: ComponentsObject;
  security?: SecurityRequirementObject[];
  tags?: TagObject[];
  externalDocs?: ExternalDocumentationObject;
  /** Webhooks added in v. 3.1.0 */
  webhooks?: PathsObject;
}
export interface InfoObject extends ISpecificationExtension {
  title: string;
  description?: string;
  termsOfService?: string;
  contact?: ContactObject;
  license?: LicenseObject;
  version: string;
}
export interface ContactObject extends ISpecificationExtension {
  name?: string;
  url?: string;
  email?: string;
}
export interface LicenseObject extends ISpecificationExtension {
  name: string;
  identifier?: string;
  url?: string;
}

export interface ComponentsObject extends ISpecificationExtension {
  schemas?: { [schema: string]: SchemaObject | ReferenceObject };
  responses?: { [response: string]: ResponseObject | ReferenceObject };
  parameters?: { [parameter: string]: ParameterObject | ReferenceObject };
  examples?: { [example: string]: ExampleObject | ReferenceObject };
  requestBodies?: { [request: string]: RequestBodyObject | ReferenceObject };
  headers?: { [header: string]: HeaderObject | ReferenceObject };
  securitySchemes?: { [securityScheme: string]: SecuritySchemeObject | ReferenceObject };
  links?: { [link: string]: LinkObject | ReferenceObject };
  callbacks?: { [callback: string]: CallbackObject | ReferenceObject };
}

/**
 * Rename it to Paths Object to be consistent with the spec
 * See https://github.com/OAI/Openapi-Specification/blob/main/versions/3.1.0.md#pathsObject
 */
export interface PathsObject extends ISpecificationExtension {
  // [path: string]: PathItemObject;
  [path: string]: PathItemObject;
}

/**
 * @deprecated
 * Create a type alias for backward compatibility
 */
export type PathObject = PathsObject;

export function getPath(
  pathsObject: PathsObject | undefined,
  path: string,
): PathItemObject | undefined {
  if (SpecificationExtension.isValidExtension(path)) {
    return undefined;
  }
  return pathsObject ? (pathsObject[path] as PathItemObject) : undefined;
}

export interface PathItemObject extends ISpecificationExtension {
  $ref?: string;
  summary?: string;
  description?: string;
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
  trace?: OperationObject;
  servers?: ServerObject[];
  parameters?: (ParameterObject | ReferenceObject)[];
}
export interface OperationObject extends ISpecificationExtension {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: ExternalDocumentationObject;
  operationId?: string;
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses: ResponsesObject;
  callbacks?: CallbacksObject;
  deprecated?: boolean;
  security?: SecurityRequirementObject[];
  servers?: ServerObject[];
}
export interface ExternalDocumentationObject extends ISpecificationExtension {
  description?: string;
  url: string;
}

/**
 * The location of a parameter.
 * Possible values are "query", "header", "path" or "cookie".
 * Specification:
 * https://github.com/OAI/Openapi-Specification/blob/main/versions/3.1.0.md#parameter-locations
 */
export type ParameterLocation = "query" | "header" | "path" | "cookie";

/**
 * The style of a parameter.
 * Describes how the parameter value will be serialized.
 * (serialization is not implemented yet)
 * Specification:
 * https://github.com/OAI/Openapi-Specification/blob/main/versions/3.1.0.md#style-values
 */
export type ParameterStyle =
  | "matrix"
  | "label"
  | "form"
  | "simple"
  | "spaceDelimited"
  | "pipeDelimited"
  | "deepObject";

export interface BaseParameterObject extends ISpecificationExtension {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;

  style?: ParameterStyle; // "matrix" | "label" | "form" | "simple" | "spaceDelimited" | "pipeDelimited" | "deepObject";
  explode?: boolean;
  allowReserved?: boolean;
  schema?: SchemaObject | ReferenceObject;
  examples?: { [param: string]: ExampleObject | ReferenceObject };
  example?: unknown;
  content?: ContentObject;
}

export interface ParameterObject extends BaseParameterObject {
  name: string;
  in: ParameterLocation; // "query" | "header" | "path" | "cookie";
}
export interface RequestBodyObject extends ISpecificationExtension {
  description?: string;
  content: ContentObject;
  required?: boolean;
}
export interface ContentObject {
  [mediatype: string]: MediaTypeObject;
}
export interface MediaTypeObject extends ISpecificationExtension {
  schema?: SchemaObject | ReferenceObject;
  examples?: ExamplesObject;
  example?: unknown;
  encoding?: EncodingObject;
}
export interface EncodingObject extends ISpecificationExtension {
  // [property: string]: EncodingPropertyObject;
  [property: string]: EncodingPropertyObject | unknown; // Hack for allowing ISpecificationExtension
}
export interface EncodingPropertyObject {
  contentType?: string;
  headers?: { [key: string]: HeaderObject | ReferenceObject };
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  [key: string]: unknown; // (unknown) = Hack for allowing ISpecificationExtension
}
export interface ResponsesObject extends ISpecificationExtension {
  default?: ResponseObject | ReferenceObject;

  // [statuscode: string]: ResponseObject | ReferenceObject;
  [statuscode: string]: ResponseObject | ReferenceObject | unknown; // (unknown) = Hack for allowing ISpecificationExtension
}
export interface ResponseObject extends ISpecificationExtension {
  description: string;
  headers?: HeadersObject;
  content?: ContentObject;
  links?: LinksObject;
}
export interface CallbacksObject extends ISpecificationExtension {
  // [name: string]: CallbackObject | ReferenceObject;
  [name: string]: CallbackObject | ReferenceObject | unknown; // Hack for allowing ISpecificationExtension
}
export interface CallbackObject extends ISpecificationExtension {
  // [name: string]: PathItemObject;
  [name: string]: PathItemObject | unknown; // Hack for allowing ISpecificationExtension
}
export interface HeadersObject {
  [name: string]: HeaderObject | ReferenceObject;
}
export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: unknown;
  externalValue?: string;
  [property: string]: unknown; // Hack for allowing ISpecificationExtension
}
export interface LinksObject {
  [name: string]: LinkObject | ReferenceObject;
}
export interface LinkObject extends ISpecificationExtension {
  operationRef?: string;
  operationId?: string;
  parameters?: LinkParametersObject;
  requestBody?: unknown | string;
  description?: string;
  server?: ServerObject;
  [property: string]: unknown; // Hack for allowing ISpecificationExtension
}
export interface LinkParametersObject {
  [name: string]: unknown | string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HeaderObject extends BaseParameterObject {
  $ref?: string;
}
export interface TagObject extends ISpecificationExtension {
  name: string;
  description?: string;
  externalDocs?: ExternalDocumentationObject;
  [extension: string]: unknown; // Hack for allowing ISpecificationExtension
}
export interface ExamplesObject {
  [name: string]: ExampleObject | ReferenceObject;
}

export interface ReferenceObject {
  $ref: string;
  summary?: string;
  description?: string;
}

/**
 * A type guard to check if the given value is a `ReferenceObject`.
 * See https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types
 *
 * @param obj The value to check.
 */
export function isReferenceObject(obj: unknown): obj is ReferenceObject {
  return Object.prototype.hasOwnProperty.call(obj, "$ref");
}

export type SchemaObjectType =
  | "integer"
  | "number"
  | "string"
  | "boolean"
  | "object"
  | "null"
  | "array";

export interface SchemaObject extends ISpecificationExtension {
  discriminator?: DiscriminatorObject;
  readOnly?: boolean;
  writeOnly?: boolean;
  xml?: XmlObject;
  externalDocs?: ExternalDocumentationObject;
  /** @deprecated use examples instead */
  example?: unknown;
  examples?: ExamplesObject;
  deprecated?: boolean;

  type?: SchemaObjectType | SchemaObjectType[];
  format?:
    | "int32"
    | "int64"
    | "float"
    | "double"
    | "byte"
    | "binary"
    | "date"
    | "date-time"
    | "password"
    | string;
  allOf?: (SchemaObject | ReferenceObject)[];
  oneOf?: (SchemaObject | ReferenceObject)[];
  unknownOf?: (SchemaObject | ReferenceObject)[];
  not?: SchemaObject | ReferenceObject;
  items?: SchemaObject | ReferenceObject;
  properties?: { [propertyName: string]: SchemaObject | ReferenceObject };
  additionalProperties?: SchemaObject | ReferenceObject | boolean;
  propertyNames?: SchemaObject | ReferenceObject;
  description?: string;
  default?: unknown;

  title?: string;
  multipleOf?: number;
  maximum?: number;
  /** @desc In Openapi 3.1: number */
  exclusiveMaximum?: number;
  minimum?: number;
  /** @desc In Openapi 3.1: number */
  exclusiveMinimum?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  enum?: unknown[];
  prefixItems?: (SchemaObject | ReferenceObject)[];
}

/**
 * A type guard to check if the given object is a `SchemaObject`.
 * Useful to distinguish from `ReferenceObject` values that can be used
 * in most places where `SchemaObject` is allowed.
 *
 * See https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types
 *
 * @param schema The value to check.
 */
export function isSchemaObject(schema: SchemaObject | ReferenceObject): schema is SchemaObject {
  return !Object.prototype.hasOwnProperty.call(schema, "$ref");
}

export interface SchemasObject {
  [schema: string]: SchemaObject;
}

export interface DiscriminatorObject {
  propertyName: string;
  mapping?: { [key: string]: string };
}

export interface XmlObject extends ISpecificationExtension {
  name?: string;
  namespace?: string;
  prefix?: string;
  attribute?: boolean;
  wrapped?: boolean;
}
export type SecuritySchemeType = "apiKey" | "http" | "oauth2" | "openIdConnect";

export interface SecuritySchemeObject extends ISpecificationExtension {
  type: SecuritySchemeType;
  description?: string;
  name?: string; // required only for apiKey
  in?: string; // required only for apiKey
  scheme?: string; // required only for http
  bearerFormat?: string;
  flows?: OAuthFlowsObject; // required only for oauth2
  openIdConnectUrl?: string; // required only for openIdConnect
}
export interface OAuthFlowsObject extends ISpecificationExtension {
  implicit?: OAuthFlowObject;
  password?: OAuthFlowObject;
  clientCredentials?: OAuthFlowObject;
  authorizationCode?: OAuthFlowObject;
}
export interface OAuthFlowObject extends ISpecificationExtension {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: ScopesObject;
}
export interface ScopesObject extends ISpecificationExtension {
  [scope: string]: unknown; // Hack for allowing ISpecificationExtension
}
export interface SecurityRequirementObject {
  [name: string]: string[];
}
