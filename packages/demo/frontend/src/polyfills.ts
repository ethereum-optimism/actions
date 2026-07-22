import { Buffer } from 'buffer'

// Privy's authorization-signature path expects Node's global Buffer.
export function installBuffer(target: { Buffer?: typeof Buffer }): void {
  if (typeof target.Buffer === 'undefined') target.Buffer = Buffer
}

installBuffer(globalThis)
