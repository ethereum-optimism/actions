/**
 * Recursively converts all bigint fields to string
 * Useful for API responses where bigints are serialized as strings
 */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends bigint
    ? string
    : T[K] extends object
      ? Serialized<T[K]>
      : T[K]
}
