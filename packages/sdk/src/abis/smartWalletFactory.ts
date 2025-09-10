export const smartWalletFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'implementation_', type: 'address', internalType: 'address' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'createAccount',
    inputs: [
      { name: 'owners', type: 'bytes[]', internalType: 'bytes[]' },
      { name: 'nonce', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'contract CoinbaseSmartWallet',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getAddress',
    inputs: [
      { name: 'owners', type: 'bytes[]', internalType: 'bytes[]' },
      { name: 'nonce', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'implementation',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initCodeHash',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'owners',
        type: 'bytes[]',
        indexed: false,
        internalType: 'bytes[]',
      },
      {
        name: 'nonce',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  { type: 'error', name: 'ImplementationUndeployed', inputs: [] },
  { type: 'error', name: 'OwnerRequired', inputs: [] },
] as const
