import type { IToken } from '@morpho-org/blue-sdk'
import type { Address, PublicClient } from 'viem'

import type {
  LendMarketInfo,
  LendOptions,
  LendProvider,
  LendTransaction,
  MorphoLendConfig,
} from '../../types/lend.js'

// Extended market config type for internal use
interface MarketConfig {
  id: string
  loanToken: IToken & { address: Address }
  collateralToken: IToken & { address: Address }
  oracle: Address
  irm: Address
  lltv: bigint
}

/**
 * Supported markets on Unichain for Morpho lending
 * @description Static configuration of supported markets for initial launch
 */
const SUPPORTED_MARKETS: MarketConfig[] = [
  {
    // Gauntlet USDC vault market - primary supported market
    id: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9',
    loanToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // USDC on Unichain (common address)
      symbol: 'USDC',
      decimals: 6n,
      name: 'USD Coin',
    },
    collateralToken: {
      address: '0x4200000000000000000000000000000000000006' as Address, // WETH on Unichain (standard L2 address)
      symbol: 'WETH',
      decimals: 18n,
      name: 'Wrapped Ether',
    },
    oracle: '0x0000000000000000000000000000000000000000' as Address, // Placeholder - to be updated
    irm: '0x0000000000000000000000000000000000000000' as Address, // Placeholder - to be updated
    lltv: BigInt(0.8 * 1e18), // 80% LLTV
  },
]

/**
 * Supported networks for Morpho lending
 * @description Networks where Morpho is deployed and supported
 */
const SUPPORTED_NETWORKS = {
  UNICHAIN: {
    chainId: 130,
    name: 'Unichain',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
    bundlerAddress: '0x23055618898e202386e6c13955a58D3C68200BFB' as Address,
  },
} as const

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class LendProviderMorpho implements LendProvider {
  /** Morpho protocol address for Unichain */
  private morphoAddress: Address
  /** Bundler address for transaction bundling on Unichain */
  private bundlerAddress: Address
  private defaultSlippage: number
  private publicClient: PublicClient

  /**
   * Create a new Morpho lending provider
   * @param config - Morpho lending configuration
   * @param publicClient - Viem public client for blockchain interactions
   */
  constructor(config: MorphoLendConfig, publicClient: PublicClient) {
    // Use Unichain as the default network for now
    // TODO: In the future, could determine network from publicClient
    const network = SUPPORTED_NETWORKS.UNICHAIN

    this.morphoAddress = network.morphoAddress
    this.bundlerAddress = network.bundlerAddress
    this.defaultSlippage = config.defaultSlippage || 50 // 0.5% default
    this.publicClient = publicClient
  }

  /**
   * Lend assets to a Morpho market
   * @description Supplies assets to a Morpho market using Blue_Supply operation
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  async lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    try {
      // 1. Find suitable market if marketId not provided
      const selectedMarketId =
        marketId || (await this.findBestMarketForAsset(asset))

      // 2. Get market information for APY calculation
      const marketInfo = await this.getMarketInfo(selectedMarketId)

      // 3. Create transaction data (mock implementation)
      const transactionData = {
        to: this.morphoAddress,
        data: '0x' + Math.random().toString(16).substring(2, 66), // Mock transaction data
        value: '0x0',
        slippage: options?.slippage || this.defaultSlippage,
      }

      // 4. Return transaction details (actual execution will be handled by wallet)
      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        hash: JSON.stringify(transactionData).slice(0, 66), // Use first 66 chars as placeholder hash
        amount,
        asset,
        marketId: selectedMarketId,
        apy: marketInfo.supplyApy,
        timestamp: currentTimestamp,
      }
    } catch (error) {
      throw new Error(
        `Failed to lend ${amount} of ${asset}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Withdraw assets from a Morpho market
   * @description Withdraws assets from a Morpho market using Blue_Withdraw operation
   * @param asset - Asset token address to withdraw
   * @param amount - Amount to withdraw (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // TODO: Implement withdrawal functionality
    // This would involve:
    // 1. Find suitable market if marketId not provided
    // 2. Check user's position and available balance
    // 3. Create withdrawal transaction data
    // 4. Return transaction details for wallet execution

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _unused = { asset, amount, marketId, options }

    throw new Error('Withdraw functionality not yet implemented')
  }

  /**
   * Get detailed market information
   * @description Retrieves comprehensive information about a specific market
   * @param marketId - Market identifier
   * @returns Promise resolving to detailed market information
   */
  async getMarketInfo(marketId: string): Promise<LendMarketInfo> {
    try {
      // 1. Fetch market configuration (mock)
      const marketConfigs = await this.fetchMarketConfigs()
      const config = marketConfigs.find((c) => c.id === marketId)

      if (!config) {
        throw new Error(`Market ${marketId} not found`)
      }

      // 2. Return market information with static mock data
      // TODO: In the future, this would fetch live market data from Morpho Blue SDK
      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        id: marketId,
        name: `${config.loanToken.symbol}/${config.collateralToken.symbol} Market`,
        loanToken: config.loanToken.address,
        collateralToken: config.collateralToken.address,
        supplyApy: 0.04, // 4% APY - static mock data
        utilization: 0.75, // 75% utilization - static mock data
        liquidity: BigInt('1250000000000000000000'), // 1250 ETH - static mock data
        oracle: config.oracle,
        irm: config.irm,
        lltv: Number(config.lltv) / 1e18, // Convert from BigInt to decimal
        totalSupply: BigInt('5000000000000000000000'), // 5000 ETH - static mock data
        totalBorrow: BigInt('3750000000000000000000'), // 3750 ETH - static mock data
        supplyRate: BigInt(Math.floor(0.04 * 1e18)), // 4% APY in wei format
        borrowRate: BigInt(Math.floor(0.05 * 1e18)), // 5% APY in wei format
        lastUpdate: currentTimestamp,
      }
    } catch (error) {
      throw new Error(
        `Failed to get market info for ${marketId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Find the best market for a given asset
   * @param asset - Asset token address
   * @returns Promise resolving to market ID
   */
  private async findBestMarketForAsset(asset: Address): Promise<string> {
    // Filter supported markets by asset
    const assetMarkets = SUPPORTED_MARKETS.filter(
      (market) => market.loanToken.address === asset,
    )

    if (assetMarkets.length === 0) {
      throw new Error(`No markets available for asset ${asset}`)
    }

    // For now, return the first (and likely only) supported market for the asset
    // TODO: In the future, this could compare APYs from live market data
    return assetMarkets[0].id
  }

  /**
   * Fetch market configurations from static supported markets
   * @returns Promise resolving to array of supported market configurations
   */
  private async fetchMarketConfigs(): Promise<MarketConfig[]> {
    // Return statically configured supported markets for Unichain
    // TODO: In the future, this could be enhanced to fetch live market data
    // from Morpho's subgraph or registry for additional validation
    return SUPPORTED_MARKETS
  }
}
