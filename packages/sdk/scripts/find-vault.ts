import { createPublicClient, http, parseAbiItem } from 'viem'
import { baseSepolia } from 'viem/chains'

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia
const FACTORY = '0x2c3FE6D71F8d54B063411Abb446B49f13725F784' // MetaMorpho Factory v1.1 on Base Sepolia

async function findUSDCVaults() {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  })

  const createEvt = parseAbiItem(
    'event CreateMetaMorpho(address indexed metaMorpho, address indexed caller, address initialOwner, uint256 initialTimelock, address indexed asset, string name, string symbol, bytes32 salt)',
  )

  console.log('Searching for USDC vaults on Base Sepolia...')
  console.log(`USDC address: ${USDC}`)
  console.log(`Factory address: ${FACTORY}`)

  try {
    // Get latest block number
    const latestBlock = 28898281n

    const CHUNK_SIZE = 10000n // Search in chunks of 10k blocks
    const MAX_CHUNKS = 100 // Only search the last 100k blocks
    const usdcVaults: any[] = []

    for (let i = 0; i < MAX_CHUNKS && usdcVaults.length < 5; i++) {
      const toBlock = latestBlock - BigInt(i) * CHUNK_SIZE
      const fromBlock = toBlock - CHUNK_SIZE + 1n

      if (fromBlock < 0n) break

      console.log(`Searching blocks ${fromBlock} to ${toBlock}...`)

      try {
        const logs = await client.getLogs({
          address: FACTORY,
          event: createEvt,
          fromBlock,
          toBlock,
        })

        const chunkUsdcVaults = logs.filter(
          (l) => l.args.asset?.toLowerCase() === USDC.toLowerCase(),
        )
        usdcVaults.push(...chunkUsdcVaults)

        if (chunkUsdcVaults.length > 0) {
          console.log(
            `Found ${chunkUsdcVaults.length} USDC vaults in this chunk`,
          )
        }
      } catch (chunkError) {
        console.log(
          `Error searching chunk ${fromBlock}-${toBlock}:`,
          chunkError.message,
        )
        continue
      }
    }

    console.log(`\nTotal found: ${usdcVaults.length} USDC vaults:`)
    usdcVaults.forEach((vault, index) => {
      console.log(`${index + 1}. ${vault.args.metaMorpho}`)
      console.log(`   Name: ${vault.args.name}`)
      console.log(`   Symbol: ${vault.args.symbol}`)
      console.log(`   Creator: ${vault.args.creator}`)
      console.log(`   Block: ${vault.blockNumber}`)
      console.log('')
    })

    if (usdcVaults.length === 0) {
      console.log('No USDC vaults found in recent blocks.')
    }
  } catch (error) {
    console.error('Error fetching vault data:', error)
  }
}

findUSDCVaults().catch(console.error)
