import { IsEqual } from "../deps.test.ts";
import { ExtractUndefinedKeys, MakeUndefinedKeysOptional } from "./utils.ts";

const _testExtractUndefinedKeys: IsEqual<
  ExtractUndefinedKeys<{
    string: string;
    number: number;
    void: void;
    voidUnion: boolean | void;
    null: null;
    undefined: undefined;
    undefinedUnion: string | undefined;
    // deno-lint-ignore no-explicit-any
    any: any;
    // deno-lint-ignore no-explicit-any
    anyUnion: string | any;
  }>,
  "undefined" | "undefinedUnion" | "voidUnion" | "void"
> = true;

const _testMakeUndefinedKeysOptional: IsEqual<
  MakeUndefinedKeysOptional<{
    string: string;
    number: number;
    void: void;
    null: null;
    // deno-lint-ignore no-explicit-any
    any: any;
    // deno-lint-ignore no-explicit-any
    anyUnion: string | any;
    voidUnion: boolean | void;
    undefined: undefined;
    undefinedUnion: string | undefined;
  }>,
  {
    string: string;
    number: number;
    null: null;
    // deno-lint-ignore no-explicit-any
    any: any;
    // deno-lint-ignore no-explicit-any
    anyUnion: string | any;
    void?: void;
    voidUnion?: boolean | void;
    undefined?: undefined;
    undefinedUnion?: string | undefined;
  }
> = true;
