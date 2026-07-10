// C0/C1 include ANSI/OSC terminal controls; strip them from text output.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS, '')
}
