import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { Network } from "./types";

const RPC_URLS: Record<Network, string> = {
  mainnet: "https://soroban-rpc.mainnet.stellar.gateway.fm",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

const NETWORK_PASSPHRASES: Record<Network, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
};

/**
 * WrapperClient — interact with the token-votes-wrapper contract.
 * Provides withdrawal locking and enhanced voting features.
 */
export class WrapperClient {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(wrapperAddress: string, network: Network, rpcUrl?: string) {
    const url = rpcUrl ?? RPC_URLS[network];
    this.server = new SorobanRpc.Server(url, { allowHttp: false });
    this.contract = new Contract(wrapperAddress);
    this.networkPassphrase = NETWORK_PASSPHRASES[network];
  }

  /**
   * Get the locked until timestamp for a user's withdrawal.
   * Returns 0 if not locked.
   */
  async getLockedUntil(account: string): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(account),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }
      )
        .addOperation(
          this.contract.call(
            "get_locked_until",
            nativeToScVal(account, { type: "address" })
          )
        )
        .setTimeout(30)
        .build()
    );

    if (SorobanRpc.Api.isSimulationError(result)) return 0n;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? BigInt(scValToNative(raw)) : 0n;
  }
}