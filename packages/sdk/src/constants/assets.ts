import {
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  sepolia,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

import type { Asset } from '@/types/asset.js'

export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [sepolia.id]: 'native',
    [optimism.id]: 'native',
    [optimismSepolia.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
    [unichain.id]: 'native',
    [unichainSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

/**
 * Wrapped ETH token definition
 * @description WETH is the ERC-20 wrapped version of native ETH
 */
export const WETH: Asset = {
  address: {
    [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    [sepolia.id]: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    [optimism.id]: '0x4200000000000000000000000000000000000006',
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
    [base.id]: '0x4200000000000000000000000000000000000006',
    [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
    [unichain.id]: '0x4200000000000000000000000000000000000006',
    [unichainSepolia.id]: '0x4200000000000000000000000000000000000006',
    [worldchain.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * USDC stablecoin definition
 * @description Official Circle USDC addresses for Superchain networks
 * @see https://developers.circle.com/stablecoins/usdc-contract-addresses
 */
export const USDC: Asset = {
  address: {
    [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [sepolia.id]: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    [optimismSepolia.id]: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    [unichain.id]: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    [unichainSepolia.id]: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    [worldchain.id]: '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1',
  },
  metadata: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Tether USD stablecoin
 * @description USDT is currently only deployed on Ethereum mainnet for supported chains
 */
export const USDT: Asset = {
  address: {
    [mainnet.id]: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  },
  metadata: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Dai stablecoin
 * @description DAI is currently only deployed on Ethereum mainnet for supported chains
 */
export const DAI: Asset = {
  address: {
    [mainnet.id]: '0x6b175474e89094c44da98b954eedeac495271d0f',
  },
  metadata: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Frax stablecoin
 */
export const FRAX: Asset = {
  address: {
    [mainnet.id]: '0x853d955acef822db058eb8505911ed77f175b99e',
    [optimism.id]: '0x2e3d870790dc77a83dd1d18184acc7439a53f475',
  },
  metadata: {
    symbol: 'FRAX',
    name: 'Frax',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Ethena USDe stablecoin
 */
export const USDE: Asset = {
  address: {
    [mainnet.id]: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
    [optimism.id]: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    [base.id]: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
  },
  metadata: {
    symbol: 'USDe',
    name: 'Ethena USDe',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * PayPal USD stablecoin
 */
export const PYUSD: Asset = {
  address: {
    [mainnet.id]: '0x6c3ea9036406852006290770bedfcaba0e23a0e8',
  },
  metadata: {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Sky (formerly MakerDAO governance token rebranded)
 */
export const SKY: Asset = {
  address: {
    [mainnet.id]: '0x56072c95faa701256059aa122697b133aded9279',
  },
  metadata: {
    symbol: 'SKY',
    name: 'Sky',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Wrapped Bitcoin
 * @description Canonical bridge deployments; third-party bridged versions exist but are not listed here
 */
export const WBTC: Asset = {
  address: {
    [mainnet.id]: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    [optimism.id]: '0x68f180fcce6836688e9084f035309e29bf0a2095',
    [base.id]: '0x1cea84203673764244e05693e42e6ace62be9ba5',
    [unichain.id]: '0x0555e30da8f98308edb960aa94c0db47230d2b9c',
  },
  metadata: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
  },
  type: 'erc20',
}

/**
 * Coinbase Wrapped Bitcoin
 * @description cbBTC uses the same address on mainnet and Base
 */
export const CBBTC: Asset = {
  address: {
    [mainnet.id]: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
    [base.id]: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  },
  metadata: {
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped Bitcoin',
    decimals: 8,
  },
  type: 'erc20',
}

/**
 * Lido Staked Ether
 * @description stETH is a rebasing token available only on Ethereum mainnet
 */
export const STETH: Asset = {
  address: {
    [mainnet.id]: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  },
  metadata: {
    symbol: 'stETH',
    name: 'Lido Staked Ether',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Wrapped Lido Staked Ether
 * @description Non-rebasing wrapper around stETH
 */
export const WSTETH: Asset = {
  address: {
    [mainnet.id]: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    [unichain.id]: '0xc02fe7317d4eb8753a02c35fe019786854a92001',
  },
  metadata: {
    symbol: 'wstETH',
    name: 'Wrapped liquid staked Ether 2.0',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Rocket Pool ETH
 */
export const RETH: Asset = {
  address: {
    [mainnet.id]: '0xae78736cd615f374d3085123a210448e74fc6393',
    [optimism.id]: '0x9bcef72be871e61ed4fbbc7630889bee758eb81d',
    [base.id]: '0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c',
    [unichain.id]: '0x94cac393f3444cef63a651ffc18497e7e8bd036a',
  },
  metadata: {
    symbol: 'rETH',
    name: 'Rocket Pool ETH',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Coinbase Wrapped Staked ETH
 */
export const CBETH: Asset = {
  address: {
    [mainnet.id]: '0xbe9895146f7af43049ca1c1ae358b0541ea49704',
    [optimism.id]: '0xaddb6a0412de1ba0f936dcaeb8aaa24578dcf3b2',
    [base.id]: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22',
  },
  metadata: {
    symbol: 'cbETH',
    name: 'Coinbase Wrapped Staked ETH',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * ether.fi Staked ETH (eETH)
 * @description Restaked ETH liquid staking token from ether.fi
 */
export const EETH: Asset = {
  address: {
    [mainnet.id]: '0x35fa164735182de50811e8e2e824cfb9b6118ac2',
  },
  metadata: {
    symbol: 'eETH',
    name: 'ether.fi Staked ETH',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * ether.fi Wrapped eETH
 * @description Non-rebasing wrapper around eETH; canonical bridge deployments
 */
export const WEETH: Asset = {
  address: {
    [mainnet.id]: '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee',
    [optimism.id]: '0x5a7facb970d094b6c7ff1df0ea68d99e6e73cbff',
    [base.id]: '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a',
    [unichain.id]: '0x7dcc39b4d1c53cb31e1abc0e358b43987fef80f7',
  },
  metadata: {
    symbol: 'weETH',
    name: 'Wrapped eETH',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * ether.fi Governance Token
 */
export const ETHFI: Asset = {
  address: {
    [mainnet.id]: '0xfe0c30065b384f05761f15d0cc899d4f9f9cc0eb',
    [base.id]: '0x6c240dda6b5c336df09a4d011139beaaa1ea2aa2',
  },
  metadata: {
    symbol: 'ETHFI',
    name: 'ether.fi',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Aave governance token
 */
export const AAVE: Asset = {
  address: {
    [mainnet.id]: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    [optimism.id]: '0x76fb31fb4af56892a25e32cfc43de717950c9278',
    [base.id]: '0x63706e401c06ac8513145b7687a14804d17f814b',
  },
  metadata: {
    symbol: 'AAVE',
    name: 'Aave',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Uniswap governance token
 */
export const UNI: Asset = {
  address: {
    [mainnet.id]: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    [optimism.id]: '0x6fd9d7ad17242c41f7131d257212c54a0e816691',
    [unichain.id]: '0x8f187aa05619a017077f5308904739877ce9ea21',
  },
  metadata: {
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Chainlink token
 */
export const LINK: Asset = {
  address: {
    [mainnet.id]: '0x514910771af9ca656af840dff83e8264ecf986ca',
    [optimism.id]: '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6',
    [base.id]: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196',
    [unichain.id]: '0xef66491eab4bbb582c57b14778afd8dfb70d8a1a',
    [worldchain.id]: '0x915b648e994d5f31059b38223b9fbe98ae185473',
  },
  metadata: {
    symbol: 'LINK',
    name: 'Chainlink',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Curve DAO token
 */
export const CRV: Asset = {
  address: {
    [mainnet.id]: '0xd533a949740bb3306d119cc777fa900ba034cd52',
    [optimism.id]: '0x0994206dfe8de6ec6920ff4d779b0d950605fb53',
    [base.id]: '0x8ee73c484a26e0a5df2ee2a4960b789967dd0415',
  },
  metadata: {
    symbol: 'CRV',
    name: 'Curve DAO Token',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Synthetix network token
 */
export const SNX: Asset = {
  address: {
    [mainnet.id]: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    [optimism.id]: '0x8700daec35af8ff88c16bdf0418774cb3d7599b4',
    [base.id]: '0x22e6966b799c4d5b13be962e1d117b56327fda66',
  },
  metadata: {
    symbol: 'SNX',
    name: 'Synthetix Network Token',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Compound governance token
 */
export const COMP: Asset = {
  address: {
    [mainnet.id]: '0xc00e94cb662c3520282e6f5717214004a7f26888',
    [base.id]: '0x9e1028f5f1d5ede59748ffcee5532509976840e0',
  },
  metadata: {
    symbol: 'COMP',
    name: 'Compound',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Balancer governance token
 */
export const BAL: Asset = {
  address: {
    [mainnet.id]: '0xba100000625a3754423978a60c9317c58a424e3d',
    [optimism.id]: '0xfe8b128ba8c78aabc59d4c64cee7ff28e9379921',
    [base.id]: '0x4158734d47fc9692176b5085e0f52ee0da5d47f1',
  },
  metadata: {
    symbol: 'BAL',
    name: 'Balancer',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * SushiSwap token
 */
export const SUSHI: Asset = {
  address: {
    [mainnet.id]: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
    [base.id]: '0x7d49a065d17d6d4a55dc13649901fdbb98b2afba',
  },
  metadata: {
    symbol: 'SUSHI',
    name: 'SushiSwap',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * 1inch network token
 * @description Named ONEINCH because identifiers cannot start with a digit
 */
export const ONEINCH: Asset = {
  address: {
    [mainnet.id]: '0x111111111117dc0aa78b770fa6a738034120c302',
    [base.id]: '0xc5fecc3a29fb57b5024eec8a2239d4621e111cbe',
  },
  metadata: {
    symbol: '1INCH',
    name: '1inch',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Pendle governance token
 */
export const PENDLE: Asset = {
  address: {
    [mainnet.id]: '0x808507121b80c02388fad14726482e061b8da827',
    [optimism.id]: '0xbc7b1ff1c6989f006a1185318ed4e7b5796e66e1',
    [base.id]: '0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e',
  },
  metadata: {
    symbol: 'PENDLE',
    name: 'Pendle',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Maker governance token
 */
export const MKR: Asset = {
  address: {
    [mainnet.id]: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  },
  metadata: {
    symbol: 'MKR',
    name: 'Maker',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Lido DAO token
 */
export const LDO: Asset = {
  address: {
    [mainnet.id]: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    [optimism.id]: '0xfdb794692724153d1488ccdbe0c56c252596735f',
  },
  metadata: {
    symbol: 'LDO',
    name: 'Lido DAO',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Rocket Pool governance token
 */
export const RPL: Asset = {
  address: {
    [mainnet.id]: '0xd33526068d116ce69f19a9ee46f0bd304f21a51f',
  },
  metadata: {
    symbol: 'RPL',
    name: 'Rocket Pool',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * The Graph protocol token
 */
export const GRT: Asset = {
  address: {
    [mainnet.id]: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
  },
  metadata: {
    symbol: 'GRT',
    name: 'The Graph',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Ethereum Name Service token
 */
export const ENS: Asset = {
  address: {
    [mainnet.id]: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
  },
  metadata: {
    symbol: 'ENS',
    name: 'Ethereum Name Service',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Optimism governance token
 * @description OP is native to Optimism; not deployed on mainnet
 */
export const OP: Asset = {
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000042',
  },
  metadata: {
    symbol: 'OP',
    name: 'Optimism',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Arbitrum governance token
 */
export const ARB: Asset = {
  address: {
    [mainnet.id]: '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1',
  },
  metadata: {
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Polygon (POL) token
 */
export const POL: Asset = {
  address: {
    [mainnet.id]: '0x455e53cbb86018ac2b8092fdcd39d8444affc3f6',
  },
  metadata: {
    symbol: 'POL',
    name: 'POL (ex-MATIC)',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Render token
 */
export const RENDER: Asset = {
  address: {
    [mainnet.id]: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
  },
  metadata: {
    symbol: 'RENDER',
    name: 'Render',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Worldcoin token
 */
export const WLD: Asset = {
  address: {
    [mainnet.id]: '0x163f8c2467924be0ae7b5347228cabf260318753',
    [optimism.id]: '0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1',
    [worldchain.id]: '0x2cfc85d8e48f8eab294be644d9e25c3030863003',
  },
  metadata: {
    symbol: 'WLD',
    name: 'Worldcoin',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Ondo Finance token
 */
export const ONDO: Asset = {
  address: {
    [mainnet.id]: '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3',
  },
  metadata: {
    symbol: 'ONDO',
    name: 'Ondo',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Ethena governance token
 */
export const ENA: Asset = {
  address: {
    [mainnet.id]: '0x57e114b691db790c35207b2e685d4a43181e6061',
    [optimism.id]: '0x58538e6a46e07434d7e7375bc268d3cb839c0133',
    [base.id]: '0x58538e6a46e07434d7e7375bc268d3cb839c0133',
  },
  metadata: {
    symbol: 'ENA',
    name: 'Ethena',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Shiba Inu meme token
 */
export const SHIB: Asset = {
  address: {
    [mainnet.id]: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
  },
  metadata: {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Pepe meme token
 */
export const PEPE: Asset = {
  address: {
    [mainnet.id]: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  },
  metadata: {
    symbol: 'PEPE',
    name: 'Pepe',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Morpho Token
 */
export const MORPHO: Asset = {
  address: {
    [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
  },
  metadata: {
    symbol: 'MORPHO',
    name: 'Morpho Token',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * Demo USDC token for testing
 */
export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839',
  },
  metadata: {
    symbol: 'USDC_DEMO',
    name: 'USDC',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Demo OP token for testing
 */
export const OP_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0xD6169405013E92387b78457Fa77d377cE8cD3EE8',
  },
  metadata: {
    symbol: 'OP_DEMO',
    name: 'OP',
    decimals: 18,
  },
  type: 'erc20',
}
