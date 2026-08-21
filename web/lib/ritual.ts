import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type EIP1193Provider,
} from "viem";

export const ritualChain = defineChain({
  id: 1979,
  name: "Ritual Chain",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RITUAL_RPC_URL ?? "https://rpc.ritualfoundation.org"] },
  },
  blockExplorers: {
    default: { name: "Ritual Explorer", url: "https://explorer.ritualfoundation.org" },
  },
});

export const predictAddress = /^0x[a-fA-F0-9]{40}$/.test(
  process.env.NEXT_PUBLIC_PREDICT_ADDRESS ?? "",
)
  ? (process.env.NEXT_PUBLIC_PREDICT_ADDRESS as Address)
  : undefined;

export const publicClient = createPublicClient({
  chain: ritualChain,
  transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL),
});

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No browser wallet found");

  const wallet = createWalletClient({
    chain: ritualChain,
    transport: custom(window.ethereum),
  });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error("Wallet connection was not approved");

  try {
    await wallet.switchChain({ id: ritualChain.id });
  } catch {
    await wallet.addChain({ chain: ritualChain });
    await wallet.switchChain({ id: ritualChain.id });
  }

  return { wallet, account };
}

export function explorerAddress(address: string) {
  return `${ritualChain.blockExplorers.default.url}/address/${address}`;
}
