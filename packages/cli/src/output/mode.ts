let jsonMode = false

/**
 * @description Sets the process-wide output mode. Called once from the
 * commander `preAction` hook after parsing the root `--json` flag.
 * @param value - `true` to emit JSON on stdout and stderr; `false` for
 * human-readable text.
 */
export function setJsonMode(value: boolean): void {
  jsonMode = value
}

/**
 * @description Reports whether the CLI should emit JSON. Handlers and
 * error sinks gate their formatter choice on this.
 * @returns `true` when `--json` was set.
 */
export function isJsonMode(): boolean {
  return jsonMode
}
