import { Buffer } from 'buffer'

// Privy's wallet SDK expects Node's global `Buffer`, which the browser
// production bundle does not define. Set it before any wallet code runs.
export function installBuffer(target: { Buffer?: typeof Buffer }): void {
  if (typeof target.Buffer === 'undefined') target.Buffer = Buffer
}

installBuffer(globalThis)
