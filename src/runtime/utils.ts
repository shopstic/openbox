import { AssertionError } from "../deps.test.ts";

export function memoizePromise<T>(create: () => Promise<T>): typeof create {
  let memoized: Promise<T> | null = null;

  return () => {
    if (!memoized) {
      memoized = create();
    }
    return memoized;
  };
}

export function assertUnreachable(value: never): never {
  throw new AssertionError("Expected matching to be exhaustive, but got: " + value);
}
