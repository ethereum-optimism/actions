/**
 * @description Deep-clones an object, replacing every `bigint` with its
 * decimal string form. Needed because `JSON.stringify` throws on `bigint`
 * but Actions SDK return types carry `bigint` amounts, balances, and ids.
 *
 * The returned object preserves the input type signature for ergonomics;
 * `bigint` fields are strings at runtime and callers must treat them as
 * such. Use only at serialization boundaries (HTTP responses, CLI stdout).
 * @param obj - Value to clone. Objects, arrays, and primitives are
 * supported; cycles, `Map`, `Set`, `Date`, and `undefined` follow standard
 * `JSON.stringify` semantics.
 * @returns A structurally identical clone with every `bigint` coerced to
 * its base-10 string representation.
 */
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  )
}
