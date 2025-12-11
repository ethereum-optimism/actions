import { WalletProviderOption } from './WalletProviderOption'
import { WALLET_PROVIDER_CONFIGS } from '@/constants/walletProviders'
import { trackEvent } from '@/utils/analytics'

const WALLET_PROVIDERS_LIST = Object.values(WALLET_PROVIDER_CONFIGS)

export function WelcomeWalletPicker() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ height: '100vh' }}
      >
        <div className="shadow-none rounded-3xl inline-flex flex-col items-center py-8 px-6 gap-5 border border-[#E0E2EB] w-[361px]">
          <img
            src="/Optimism.svg"
            alt="Optimism"
            className="w-[120px] h-auto"
          />
          <div className="flex flex-col gap-1 items-center max-w-[275px]">
            <div className="text-2xl font-semibold leading-8 text-black text-center">
              Welcome to Actions
            </div>
            <div className="text-base font-normal leading-6 text-[#404454] text-center">
              Select which wallet integration to use for this demo.
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full">
            {WALLET_PROVIDERS_LIST.map((provider) => (
              <WalletProviderOption
                key={provider.name}
                name={provider.name}
                logoSrc={provider.logoSrc}
                isSelected={false}
                onClick={() => {
                  trackEvent('wallet_provider_select', {
                    provider: provider.name,
                  })
                  window.location.href = `/earn?walletProvider=${provider.queryParam}`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
