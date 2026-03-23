#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

/// Registry entry for a deployed governor.
#[contracttype]
#[derive(Clone)]
pub struct GovernorEntry {
    pub id: u64,
    pub governor: Address,
    pub timelock: Address,
    pub token: Address,
    pub deployer: Address,
}

#[contracttype]
pub enum DataKey {
    GovernorCount,
    Governor(u64),
    GovernorWasm,
    TimelockWasm,
    TokenVotesWasm,
    Admin,
}

#[contract]
pub struct GovernorFactoryContract;

#[contractimpl]
impl GovernorFactoryContract {
    /// Initialize factory with contract WASM hashes.
    /// TODO issue #21: integrate deployer::deploy() with stored wasm hashes.
    pub fn initialize(
        env: Env,
        admin: Address,
        governor_wasm: BytesN<32>,
        timelock_wasm: BytesN<32>,
        token_votes_wasm: BytesN<32>,
    ) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GovernorWasm, &governor_wasm);
        env.storage()
            .instance()
            .set(&DataKey::TimelockWasm, &timelock_wasm);
        env.storage()
            .instance()
            .set(&DataKey::TokenVotesWasm, &token_votes_wasm);
        env.storage().instance().set(&DataKey::GovernorCount, &0u64);
    }

    /// Deploy a new governor + timelock pair and register it.
    /// TODO issue #21: implement actual wasm deployment via env.deployer().
    pub fn deploy(
        env: Env,
        deployer: Address,
        token: Address,
        voting_delay: u32,
        voting_period: u32,
        quorum_numerator: u32,
        proposal_threshold: i128,
        timelock_delay: u64,
    ) -> u64 {
        deployer.require_auth();

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::GovernorCount)
            .unwrap_or(0);
        let id = count + 1;

        // TODO: use env.deployer().with_wasm_hash().deploy() for each contract.
        // Placeholder addresses until issue #21 is implemented.
        let governor_placeholder = env.current_contract_address();
        let timelock_placeholder = env.current_contract_address();

        let entry = GovernorEntry {
            id,
            governor: governor_placeholder,
            timelock: timelock_placeholder,
            token,
            deployer,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Governor(id), &entry);
        env.storage().instance().set(&DataKey::GovernorCount, &id);

        env.events().publish((symbol_short!("deploy"),), id);

        id
    }

    /// Get a registered governor by ID.
    pub fn get_governor(env: Env, id: u64) -> GovernorEntry {
        env.storage()
            .persistent()
            .get(&DataKey::Governor(id))
            .expect("governor not found")
    }

    /// Get total number of deployed governors.
    pub fn governor_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::GovernorCount)
            .unwrap_or(0)
    }
}
