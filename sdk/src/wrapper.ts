import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
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

export interface WrapperConfig {
  wrapperAddress: string;
  network: Network;
  rpcUrl?: string;
}

/**
 * WrapperClient — interact with a deployed token-votes-wrapper contract.
 *
 * The wrapper allows any SEP-41 token to be used for governance by providing
 * a 1:1 deposit/withdraw mechanism with checkpoint-based voting power.
 */
export class WrapperClient {
  private readonly config: WrapperConfig;
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(config: WrapperConfig) {
    this.config = config;
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.wrapperAddress);
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  /**
   * Deposit underlying SEP-41 tokens and receive 1:1 wrapped voting tokens.
   */
  async deposit(signer: Keypair, amount: bigint): Promise<string> {
    const account = await this.server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "deposit",
          nativeToScVal(signer.publicKey(), { type: "address" }),
          nativeToScVal(amount, { type: "i128" })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const result = await this.server.sendTransaction(prepared);
    return result.hash;
  }

  /**
   * Burn wrapped voting tokens and reclaim the underlying SEP-41 tokens.
   */
  async withdraw(signer: Keypair, amount: bigint): Promise<string> {
    const account = await this.server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "withdraw",
          nativeToScVal(signer.publicKey(), { type: "address" }),
          nativeToScVal(amount, { type: "i128" })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const result = await this.server.sendTransaction(prepared);
    return result.hash;
  }

  /**
   * Delegate wrapped voting power to another address.
   */
  async delegate(signer: Keypair, delegatee: string): Promise<string> {
    const account = await this.server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "delegate",
          nativeToScVal(signer.publicKey(), { type: "address" }),
          nativeToScVal(delegatee, { type: "address" })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const result = await this.server.sendTransaction(prepared);
    return result.hash;
  }

  /**
   * Get current voting power for an address.
   */
  async getVotes(address: string): Promise<bigint> {
    const account = await this.server.getAccount(address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          "get_votes",
          nativeToScVal(address, { type: "address" })
        )
      )
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
      throw new Error("Simulation failed");
    }
    const val = sim.result?.retval;
    if (!val) return 0n;
    return BigInt((val as any).value ?? 0);
  }
}
