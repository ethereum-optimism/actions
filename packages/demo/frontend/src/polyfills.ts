import { Buffer } from 'buffer'

// Privy's wallet SDK expects Node's global `Buffer`, which the browser
// production bundle does not define. Set it before any wallet code runs.
const globalWithBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
}
if (!globalWithBuffer.Buffer) globalWithBuffer.Buffer = Buffer
