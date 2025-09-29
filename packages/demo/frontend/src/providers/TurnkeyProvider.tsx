import {
    TurnkeyProvider,
    type TurnkeyProviderConfig,
  } from "@turnkey/react-wallet-kit";
import { env } from "../envVars";
  
  const turnkeyConfig: TurnkeyProviderConfig = {
    organizationId: env.VITE_TURNKEY_ORGANIZATION_ID,
    authProxyConfigId: env.VITE_TURNKEY_AUTH_ID,
    // ui: {
    //     supressMissingStylesError: true, // Disable styles check. Only do this if you are sure that the styles are being applied correctly.
    //   },
  };

  export function Turnkey({ children }: { children: React.ReactNode }) {
    return <TurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: (error) => console.error("Turnkey error:", error),
      }}
    >{children}</TurnkeyProvider>;
  }