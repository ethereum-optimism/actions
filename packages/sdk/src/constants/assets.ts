import {
  base,
  baseSepolia,
  bob,
  fraxtal,
  ink,
  lisk,
  mainnet,
  metalL2,
  mode,
  optimism,
  optimismSepolia,
  sepolia,
  soneium,
  swellchain,
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
    [worldchain.id]: 'native',
    // Standard OP Stack native asset — not separately listed on CoinGecko per chain
    [soneium.id]: 'native',
    [ink.id]: 'native',
    [mode.id]: 'native',
    [fraxtal.id]: 'native',
    [lisk.id]: 'native',
    [bob.id]: 'native',
    [swellchain.id]: 'native',
    [metalL2.id]: 'native',
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
 * @see https://www.coingecko.com/en/coins/weth
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
    // Standard OP Stack WETH deployment — not separately listed on CoinGecko per chain
    [soneium.id]: '0x4200000000000000000000000000000000000006',
    [ink.id]: '0x4200000000000000000000000000000000000006',
    [mode.id]: '0x4200000000000000000000000000000000000006',
    [fraxtal.id]: '0x4200000000000000000000000000000000000006',
    [lisk.id]: '0x4200000000000000000000000000000000000006',
    [bob.id]: '0x4200000000000000000000000000000000000006',
    [swellchain.id]: '0x4200000000000000000000000000000000000006',
    [metalL2.id]: '0x4200000000000000000000000000000000000006',
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
    [ink.id]: '0x2D270e6886d130D724215A266106e6832161EAEd',
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
 * @see https://www.coingecko.com/en/coins/tether
 */
export const USDT: Asset = {
  address: {
    [mainnet.id]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
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
 * @see https://www.coingecko.com/en/coins/dai
 */
export const DAI: Asset = {
  address: {
    [mainnet.id]: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
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
 * @see https://www.coingecko.com/en/coins/frax
 */
export const FRAX: Asset = {
  address: {
    [mainnet.id]: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    [optimism.id]: '0x2E3D870790dC77A83DD1d18184Acc7439A53f475',
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
 * @see https://www.coingecko.com/en/coins/ethena-usde
 */
export const USDE: Asset = {
  address: {
    [mainnet.id]: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
    [optimism.id]: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    [base.id]: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    [mode.id]: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    [fraxtal.id]: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    [swellchain.id]: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
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
 * @see https://www.coingecko.com/en/coins/paypal-usd
 */
export const PYUSD: Asset = {
  address: {
    [mainnet.id]: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
  },
  metadata: {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Sky (rebranded MakerDAO governance token)
 * @see https://www.coingecko.com/en/coins/sky
 */
export const SKY: Asset = {
  address: {
    [mainnet.id]: '0x56072C95FAA701256059aa122697B133aDEd9279',
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
 * @see https://www.coingecko.com/en/coins/wrapped-bitcoin
 */
export const WBTC: Asset = {
  address: {
    [mainnet.id]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    [optimism.id]: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
    [base.id]: '0x1ceA84203673764244E05693e42E6Ace62bE9BA5',
    [unichain.id]: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    [soneium.id]: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    [bob.id]: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    [swellchain.id]: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
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
 * @see https://www.coingecko.com/en/coins/coinbase-wrapped-btc
 */
export const CBBTC: Asset = {
  address: {
    [mainnet.id]: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    [base.id]: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
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
 * @see https://www.coingecko.com/en/coins/staked-ether
 */
export const STETH: Asset = {
  address: {
    [mainnet.id]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
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
 * @see https://www.coingecko.com/en/coins/wrapped-steth
 */
export const WSTETH: Asset = {
  address: {
    [mainnet.id]: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    [unichain.id]: '0xc02fE7317D4eb8753a02c35fe019786854A92001',
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
 * @see https://www.coingecko.com/en/coins/rocket-pool-eth
 */
export const RETH: Asset = {
  address: {
    [mainnet.id]: '0xae78736Cd615f374D3085123A210448E74Fc6393',
    [optimism.id]: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D',
    [base.id]: '0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c',
    [unichain.id]: '0x94Cac393f3444cEf63a651FfC18497E7e8bd036a',
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
 * @see https://www.coingecko.com/en/coins/coinbase-wrapped-staked-eth
 */
export const CBETH: Asset = {
  address: {
    [mainnet.id]: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
    [optimism.id]: '0xadDb6A0412DE1BA0F936DCaeb8Aaa24578dcF3B2',
    [base.id]: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
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
 * @see https://www.coingecko.com/en/coins/ether-fi-staked-eth
 */
export const EETH: Asset = {
  address: {
    [mainnet.id]: '0x35fA164735182de50811E8e2E824cFb9B6118ac2',
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
 * @see https://www.coingecko.com/en/coins/wrapped-eeth
 */
export const WEETH: Asset = {
  address: {
    [mainnet.id]: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
    [optimism.id]: '0x5A7fACB970D094B6C7FF1df0eA68D99E6e73CBFF',
    [base.id]: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A',
    [unichain.id]: '0x7DCC39B4d1C53CB31e1aBc0e358b43987FEF80f7',
    [ink.id]: '0xA3D68b74bF0528fdD07263c60d6488749044914b',
    [mode.id]: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A',
    [swellchain.id]: '0xA6cB988942610f6731e664379D15fFcfBf282b44',
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
 * @see https://www.coingecko.com/en/coins/ether-fi
 */
export const ETHFI: Asset = {
  address: {
    [mainnet.id]: '0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB',
    [base.id]: '0x6C240DDA6b5c336DF09A4D011139beAAa1eA2Aa2',
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
 * @see https://www.coingecko.com/en/coins/aave
 */
export const AAVE: Asset = {
  address: {
    [mainnet.id]: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    [optimism.id]: '0x76FB31fb4af56892A25e32cFC43De717950c9278',
    [base.id]: '0x63706e401c06ac8513145b7687A14804d17f814b',
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
 * @see https://www.coingecko.com/en/coins/uniswap
 */
export const UNI: Asset = {
  address: {
    [mainnet.id]: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    [optimism.id]: '0x6fd9d7AD17242c41f7131d257212c54A0e816691',
    [unichain.id]: '0x8f187aA05619a017077f5308904739877ce9eA21',
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
 * @see https://www.coingecko.com/en/coins/chainlink
 */
export const LINK: Asset = {
  address: {
    [mainnet.id]: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    [optimism.id]: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
    [base.id]: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    [unichain.id]: '0xEF66491eab4bbB582c57b14778afd8dFb70D8A1A',
    [worldchain.id]: '0x915b648e994d5f31059B38223b9fbe98ae185473',
    [soneium.id]: '0x32D8F819C8080ae44375F8d383Ffd39FC642f3Ec',
    [ink.id]: '0x71052BAe71C25C78E37fD12E5ff1101A71d9018F',
    [mode.id]: '0x183E3691EfF3524B2315D3703D94F922CbE51F54',
    [fraxtal.id]: '0xd6A6ba37fAaC229B9665E86739ca501401f5a940',
    [lisk.id]: '0x71052BAe71C25C78E37fD12E5ff1101A71d9018F',
    [bob.id]: '0x5aB885CDa7216b163fb6F813DEC1E1532516c833',
    [metalL2.id]: '0x587d19DDF735D6B536aAdB1a2A92938eB23B8d5C',
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
 * @see https://www.coingecko.com/en/coins/curve-dao-token
 */
export const CRV: Asset = {
  address: {
    [mainnet.id]: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    [optimism.id]: '0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53',
    [base.id]: '0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415',
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
 * @see https://www.coingecko.com/en/coins/havven
 */
export const SNX: Asset = {
  address: {
    [mainnet.id]: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    [optimism.id]: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',
    [base.id]: '0x22e6966B799c4D5B13BE962E1D117b56327FDa66',
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
 * @see https://www.coingecko.com/en/coins/compound-governance-token
 */
export const COMP: Asset = {
  address: {
    [mainnet.id]: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    [base.id]: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
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
 * @see https://www.coingecko.com/en/coins/balancer
 */
export const BAL: Asset = {
  address: {
    [mainnet.id]: '0xba100000625a3754423978a60c9317c58a424e3D',
    [optimism.id]: '0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921',
    [base.id]: '0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1',
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
 * @see https://www.coingecko.com/en/coins/sushi
 */
export const SUSHI: Asset = {
  address: {
    [mainnet.id]: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
    [base.id]: '0x7D49a065D17d6d4a55dc13649901fdBB98B2AFBA',
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
 * @description Named ONEINCH because JavaScript identifiers cannot start with a digit
 * @see https://www.coingecko.com/en/coins/1inch
 */
export const ONEINCH: Asset = {
  address: {
    [mainnet.id]: '0x111111111117dC0aa78b770fA6A738034120C302',
    [base.id]: '0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE',
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
 * @see https://www.coingecko.com/en/coins/pendle
 */
export const PENDLE: Asset = {
  address: {
    [mainnet.id]: '0x808507121B80c02388fAd14726482e061B8da827',
    [optimism.id]: '0xBC7B1Ff1c6989f006a1185318eD4E7b5796e66E1',
    [base.id]: '0xA99F6e6785Da0F5d6fB42495Fe424BCE029Eeb3E',
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
 * @see https://www.coingecko.com/en/coins/maker
 */
export const MKR: Asset = {
  address: {
    [mainnet.id]: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
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
 * @see https://www.coingecko.com/en/coins/lido-dao
 */
export const LDO: Asset = {
  address: {
    [mainnet.id]: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    [optimism.id]: '0xFdb794692724153d1488CcdBE0C56c252596735F',
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
 * @see https://www.coingecko.com/en/coins/rocket-pool
 */
export const RPL: Asset = {
  address: {
    [mainnet.id]: '0xD33526068D116cE69F19A9ee46F0bd304F21A51f',
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
 * @see https://www.coingecko.com/en/coins/the-graph
 */
export const GRT: Asset = {
  address: {
    [mainnet.id]: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
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
 * @see https://www.coingecko.com/en/coins/ethereum-name-service
 */
export const ENS: Asset = {
  address: {
    [mainnet.id]: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
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
 * @see https://www.coingecko.com/en/coins/optimism
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
 * @see https://www.coingecko.com/en/coins/arbitrum
 */
export const ARB: Asset = {
  address: {
    [mainnet.id]: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
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
 * @see https://www.coingecko.com/en/coins/matic-network
 */
export const POL: Asset = {
  address: {
    [mainnet.id]: '0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6',
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
 * @see https://www.coingecko.com/en/coins/render-token
 */
export const RENDER: Asset = {
  address: {
    [mainnet.id]: '0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24',
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
 * @see https://www.coingecko.com/en/coins/worldcoin-wld
 */
export const WLD: Asset = {
  address: {
    [mainnet.id]: '0x163f8C2467924be0ae7B5347228CABF260318753',
    [optimism.id]: '0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1',
    [worldchain.id]: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003',
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
 * @see https://www.coingecko.com/en/coins/ondo-finance
 */
export const ONDO: Asset = {
  address: {
    [mainnet.id]: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3',
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
 * @see https://www.coingecko.com/en/coins/ethena
 */
export const ENA: Asset = {
  address: {
    [mainnet.id]: '0x57e114B691Db790C35207b2e685D4A43181e6061',
    [optimism.id]: '0x58538e6A46E07434d7E7375Bc268D3cb839C0133',
    [base.id]: '0x58538e6A46E07434d7E7375Bc268D3cb839C0133',
    [mode.id]: '0x58538e6A46E07434d7E7375Bc268D3cb839C0133',
    [fraxtal.id]: '0x58538e6A46E07434d7E7375Bc268D3cb839C0133',
    [swellchain.id]: '0x58538e6A46E07434d7E7375Bc268D3cb839C0133',
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
 * @see https://www.coingecko.com/en/coins/shiba-inu
 */
export const SHIB: Asset = {
  address: {
    [mainnet.id]: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
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
 * @see https://www.coingecko.com/en/coins/pepe
 */
export const PEPE: Asset = {
  address: {
    [mainnet.id]: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
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
 * @see https://www.coingecko.com/en/coins/morpho
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
 * All natively supported assets
 */
export const NATIVELY_SUPPORTED_ASSETS: Asset[] = [
  ETH,
  WETH,
  USDC,
  USDT,
  DAI,
  FRAX,
  USDE,
  PYUSD,
  SKY,
  WBTC,
  CBBTC,
  STETH,
  WSTETH,
  RETH,
  CBETH,
  EETH,
  WEETH,
  ETHFI,
  AAVE,
  UNI,
  LINK,
  CRV,
  SNX,
  COMP,
  BAL,
  SUSHI,
  ONEINCH,
  PENDLE,
  MKR,
  LDO,
  RPL,
  GRT,
  ENS,
  OP,
  ARB,
  POL,
  RENDER,
  WLD,
  ONDO,
  ENA,
  SHIB,
  PEPE,
  MORPHO,
]

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
