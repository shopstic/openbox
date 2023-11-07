import { TRef, TSchema, Type, TypeCompiler, TypeGuard, Value } from "./deps.ts";

const PREFIX = "#/components/schemas/";

function prefixId(id: string) {
  return `${PREFIX}${id}`;
}

function unprefixId(id: string) {
  return id.slice(PREFIX.length);
}

export class OpenboxSchemaRegistry {
  constructor(readonly map: Map<string, TSchema> = new Map<string, TSchema>()) {}

  merge(registry: OpenboxSchemaRegistry) {
    return new OpenboxSchemaRegistry(
      new Map<string, TSchema>([
        ...this.map,
        ...registry.map,
      ]),
    );
  }

  register<T extends TSchema>(id: string, schema: T): TRef<T> {
    const transformedId = prefixId(id);

    if (this.map.has(transformedId)) {
      throw new Error(`Schema with id "${id}" already exists.`);
    }

    const refed = {
      ...schema,
      $id: transformedId,
    };

    const ref = Type.Ref(refed);

    this.map.set(transformedId, refed);

    return ref;
  }

  compile(schema: TSchema) {
    return TypeCompiler.Compile(schema, Array.from(this.map.values()));
  }

  check(schema: TSchema, value: unknown) {
    return Value.Check(schema, Array.from(this.map.values()), value);
  }

  deref(schema: TSchema) {
    if (TypeGuard.TRef(schema)) {
      const derefed = this.map.get(schema.$ref);

      if (derefed === undefined) {
        throw new Error("Missing schema reference: " + schema.$ref);
      }

      return derefed;
    }

    return schema;
  }

  toSpecSchemas() {
    return {
      schemas: Object.fromEntries(Array.from(this.map).map(([id, { $id: _, ...schema }]) => [unprefixId(id), schema])),
    };
  }
}
