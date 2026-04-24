import { Contract, SorobanRpc, TransactionBuilder, Networks, BASE_FEE, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { GovernorEntry, Network, FactoryConfig } from "./types";

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

export class FactoryClient {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(config: FactoryConfig) {
    const rpcUrl = config.rpcUrl ?? RPC_URLS[config.network];
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.factoryAddress);
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
  }

  async getGovernorCount(): Promise<bigint> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(this.contract.contractId()),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase },
      )
        .addOperation(this.contract.call("governor_count"))
        .setTimeout(30)
        .build(),
    );

    if (SorobanRpc.Api.isSimulationError(result)) return 0n;
    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    return raw ? BigInt(scValToNative(raw)) : 0n;
  }

  async getGovernor(id: bigint): Promise<GovernorEntry> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        await this.server.getAccount(this.contract.contractId()),
        { fee: BASE_FEE, networkPassphrase: this.networkPassphrase },
      )
        .addOperation(
          this.contract.call("get_governor", nativeToScVal(id, { type: "u64" })),
        )
        .setTimeout(30)
        .build(),
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`Simulation error fetching governor ${id}`);
    }

    const raw = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    if (!raw) {
      throw new Error(`No return value when fetching governor ${id}`);
    }

    return scValToNative(raw) as GovernorEntry;
  }

  async getAllGovernors(): Promise<GovernorEntry[]> {
    const count = await this.getGovernorCount();
    if (count === 0n) return [];

    const entries: GovernorEntry[] = [];
    const pageSize = 20;
    for (let start = 1n; start <= count; start += BigInt(pageSize)) {
      const end = start + BigInt(pageSize) - 1n;
      const page = await Promise.all(
        Array.from({ length: Number(end - start + 1n) }, (_, index) => {
          const id = start + BigInt(index);
          return this.getGovernor(id);
        }),
      );
      entries.push(...page);
    }

    return entries;
  }
}
