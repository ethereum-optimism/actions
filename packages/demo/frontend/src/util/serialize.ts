/**
 * Recursively converts all bigint fields to string. Useful for API
 * responses where bigints are serialized as strings.
 *
 * Written as a distributive conditional (T is a naked type parameter) so
 * it handles union members independently: optional/nullable bigints like
 * `bigint | undefined` become `string | undefined`, and discriminated
 * unions keep their shape. Arrays and nested objects recurse.
 */
export type Serialized<T> = T extends bigint
  ? string
  : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T
