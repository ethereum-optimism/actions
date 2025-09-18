import { createVerbs, type VerbsConfig, type LendMarketConfig, type Asset } from '@eth-optimism/verbs-sdk/react'
import type { Address } from 'viem'

import { baseSepolia, mainnet, unichain } from 'viem/chains'

import { env } from '../envVars.js'

export const USDC: Asset = {
    address: {
      [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
      [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    metadata: {
      decimals: 6,
      name: 'USDC',
      symbol: 'USDC',
    },
    type: 'erc20',
  }
  
  export const USDC_DEMO: Asset = {
    address: {
      [baseSepolia.id]: '0x87c25229afbc30418d0144e8dfb2bcf8efd92c6c',
    },
    metadata: {
      decimals: 6,
      name: 'USDC Demo',
      symbol: 'USDC_DEMO',
    },
    type: 'erc20',
  }

export const GauntletUSDC: LendMarketConfig = {
    address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
    chainId: unichain.id,
    name: 'Gauntlet USDC',
    asset: USDC,
    lendProvider: 'morpho',
  }
  
  export const MetaMorphoUSDC: LendMarketConfig = {
    address: '0x99067e5D73b1d6F1b5856E59209e12F5a0f86DED' as Address,
    chainId: baseSepolia.id,
    name: 'MetaMorpho USDC Vault (Base Sepolia)',
    asset: USDC,
    lendProvider: 'morpho',
  }
  
  export const USDCDemoVault: LendMarketConfig = {
    address: '0x297E324C46309E93112610ebf35559685b4E3547' as Address,
    chainId: baseSepolia.id,
    name: 'USDC Demo Vault (Base Sepolia)',
    asset: USDC_DEMO,
    lendProvider: 'morpho',
  }
  

export function createVerbsConfig(): VerbsConfig<'dynamic'> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: 'dynamic',
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default',
          // converts to '0xee4a2159c53ceed04edf4ce23cc97c5c'
          attributionSuffix: 'verbs',
        },
      },
    },
    lend: {
      provider: 'morpho',
      marketAllowlist: [GauntletUSDC, MetaMorphoUSDC, USDCDemoVault],
    },
    chains: [
      {
        chainId: unichain.id,
        rpcUrls: env.VITE_UNICHAIN_RPC_URL ? [env.VITE_UNICHAIN_RPC_URL] : undefined,
        bundler: {
          type: 'pimlico',
          url: env.VITE_UNICHAIN_BUNDLER_URL,
          sponsorshipPolicyId: env.VITE_UNICHAIN_BUNDLER_SPONSORSHIP_POLICY,
        },
      },
      {
        chainId: baseSepolia.id,
        rpcUrls: env.VITE_BASE_SEPOLIA_RPC_URL
          ? [env.VITE_BASE_SEPOLIA_RPC_URL]
          : undefined,
        bundler: {
          type: 'simple',
          url: env.VITE_BASE_SEPOLIA_BUNDER_URL,
        },
      },
    ],
  }
}

export function initializeVerbs() {
  return createVerbs(createVerbsConfig())
}

export function getVerbs() {
  return initializeVerbs()
}

initializeVerbs()
