import { serializeBigInt } from '@eth-optimism/actions-sdk'

/**
 * @description Writes a JSON-serialised document to stdout, terminated by a
 * newline. Any `bigint` values are coerced to decimal strings via
 * `serializeBigInt` so the output is parseable by any JSON consumer.
 *
 * The CLI's stdout contract is "one bare JSON document per invocation" -
 * use this helper as the single stdout sink for successful command output.
 * Error output goes to stderr via `writeError`, never here.
 * @param doc - Any JSON-coercible value. Objects, arrays, and primitives are
 * supported; `bigint` fields are stringified.
 */
export function writeJson(doc: unknown): void {
  process.stdout.write(JSON.stringify(serializeBigInt(doc), null, 2) + '\n')
}
