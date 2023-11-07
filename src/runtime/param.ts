// Inspired by https://github.com/jtlapp/typebox-form-parser

import { TArray, TSchema, TUnion, TypeCheck, TypeGuard } from "../deps.ts";
import { OpenboxSchemaRegistry } from "../registry.ts";

/**
 * JavaScript types to which TypeBox types correspond.
 */
enum JavaScriptType {
  Array = "array",
  BigInt = "bigint",
  Boolean = "boolean",
  Date = "Date",
  Integer = "integer",
  Null = "null",
  Number = "number",
  Object = "object",
  String = "string",
  Symbol = "symbol",
  Undefined = "undefined",
}

interface ParamInfo {
  name: string | null; // null for array and union members
  type: JavaScriptType;
  memberType: JavaScriptType | null;
  isNullable: boolean;
  isOptional: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
}

export type Data = {
  getAll: (FormData | URLSearchParams)["getAll"];
};

export interface OpenboxParam<T extends TSchema = TSchema> {
  name: string;
  schema: T;
  info: ParamInfo;
  check?: TypeCheck<T>;
  isSetCookieHeader?: boolean;
}

export function createParamInfo(
  schemaRegistry: OpenboxSchemaRegistry,
  name: string | null,
  schema: TSchema,
  withinArray = false,
): ParamInfo {
  const derefedSchema = schemaRegistry.deref(schema);

  let type = derefedSchema.type as JavaScriptType;
  let memberType: JavaScriptType | null = null;
  let isNullable = false;
  const isOptional = TypeGuard.TOptional(derefedSchema);
  let defaultValue = derefedSchema.default;
  const hasDefault = defaultValue !== undefined;

  if (TypeGuard.TUnion(derefedSchema)) {
    [type, isNullable, memberType] = getUnionInfo(
      schemaRegistry,
      derefedSchema,
      withinArray,
    );
  } else if (TypeGuard.TNull(derefedSchema)) {
    isNullable = true;
  } else if (TypeGuard.TLiteral(derefedSchema)) {
    type = derefedSchema.type as JavaScriptType;
  } else if (TypeGuard.TDate(derefedSchema)) {
    if (hasDefault) {
      defaultValue = new Date(derefedSchema.default as string);
    }
  } else if (TypeGuard.TArray(derefedSchema)) {
    if (withinArray) {
      throw Error("Form arrays can't themselves contain arrays");
    }
    memberType = getArrayMemberType(schemaRegistry, derefedSchema);
  }

  if (isNullable || isOptional) {
    if (hasDefault) {
      throw Error("Optional and nullable form types can't have default values");
    }
    if (isOptional && isNullable) {
      throw Error("Form types can't be both optional and nullable");
    }
  }

  return {
    name,
    type,
    memberType,
    isNullable,
    isOptional,
    hasDefault,
    defaultValue,
  };
}

export function createOpenboxParamList(
  registry: OpenboxSchemaRegistry,
  record: Record<string, TSchema> | undefined,
): OpenboxParam[] | undefined {
  return record
    ? Object.entries(record).map(([name, schema]) => {
      const derefSchema = registry.deref(schema);

      return {
        name,
        schema: derefSchema,
        isHeaderSetCookie: false,
        info: createParamInfo(registry, name, derefSchema),
        check: (TypeGuard.TSchema(derefSchema)) ? registry.compile(derefSchema) : undefined,
      };
    })
    : undefined;
}

function getArrayMemberType(registry: OpenboxSchemaRegistry, schema: TArray) {
  const memberInfo = createParamInfo(registry, null, schema.items, true);
  if (memberInfo.isNullable || memberInfo.isOptional) {
    throw Error("Form arrays can't contain nullable or optional members");
  }
  return memberInfo.type;
}

function getUnionInfo(
  schemaRegistry: OpenboxSchemaRegistry,
  schema: TUnion,
  withinArray: boolean,
): [JavaScriptType, boolean, JavaScriptType | null] {
  let fieldType: JavaScriptType | undefined = undefined;
  let isNullable = false;
  let memberType: JavaScriptType | null = null;

  for (const memberSchema of schema.anyOf) {
    // allows nested unions
    const derefedMemberSchema = schemaRegistry.deref(memberSchema);
    const fieldInfo = createParamInfo(schemaRegistry, null, derefedMemberSchema, withinArray);

    if (fieldInfo.isNullable) {
      isNullable = true;
    } else if (!TypeGuard.TUndefined(derefedMemberSchema) && !TypeGuard.TNull(derefedMemberSchema)) {
      if (fieldType === undefined) {
        fieldType = fieldInfo.type;
      } else if (fieldType !== fieldInfo.type) {
        throw Error(
          "All non-null members of a union type must have the same JavaScript type",
        );
      }

      if (TypeGuard.TArray(derefedMemberSchema)) {
        const nextMemberType = getArrayMemberType(schemaRegistry, derefedMemberSchema);
        if (memberType === null) {
          memberType = nextMemberType;
        } else if (memberType !== nextMemberType) {
          throw Error(
            "All members of arrays in unions must have the same JavaScript type",
          );
        }
      }
    }
  }

  if (fieldType === undefined) {
    throw Error("Union type must have at least one non-null member");
  }
  return [fieldType, isNullable, memberType];
}

function parseParamValue(
  value: unknown,
  type: JavaScriptType,
  info: ParamInfo,
) {
  return typeof value === "string" ? parseStringValue(value, type, info) : value;
}

function parseStringValue(
  value: string,
  type: JavaScriptType,
  info: ParamInfo,
): unknown {
  if (value === "") {
    if (info.isNullable) {
      return null;
    } else if (info.hasDefault) {
      return info.defaultValue;
    }
  }
  if (type === JavaScriptType.String) {
    return value;
  } else if (type === JavaScriptType.Integer) {
    return parseInt(value);
  } else if (type === JavaScriptType.Number) {
    return parseFloat(value);
  } else if (type === JavaScriptType.Boolean) {
    return !["", "false", "off"].includes(value);
  } else if (type === JavaScriptType.Date) {
    return new Date(value);
  } else if (type === JavaScriptType.Array) {
    return parseStringValue(value, info.memberType!, info);
  } else if (type === JavaScriptType.BigInt) {
    try {
      return BigInt(value);
    } catch {
      return NaN;
    }
  } else {
    throw Error(`Unsupported field type: ${type}`);
  }
}

function getDefaultValue(info: ParamInfo): unknown {
  return info.hasDefault ? info.defaultValue : info.isNullable ? null : undefined;
}

export function parseParam(
  param: OpenboxParam,
  values: (FormDataEntryValue | undefined)[] | (FormDataEntryValue | undefined),
) {
  const info = param.info;
  const type = info.type;

  let value: unknown;

  if (Array.isArray(values)) {
    if (values.length === 1) {
      value = parseParamValue(values[0], info.type, info);

      if (info.type === JavaScriptType.Array) {
        value = [value];
      }
    } else if (values.length !== 0) {
      value = values.map((value) => parseParamValue(value, info.memberType ?? type, info));
    }
  } else {
    value = parseParamValue(values, info.type, info);
  }

  if (value === undefined) {
    value = getDefaultValue(info);
  }

  return value;
}
