#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

/// A voting power checkpoint at a specific ledger sequence.
#[contracttype]
#[derive(Clone)]
pub struct Checkpoint {
    pub ledger: u32,
    pub votes: i128,
}

#[contracttype]
pub enum DataKey {
    Delegate(Address),    // delegator -> delegatee
    Checkpoints(Address), // account -> Vec<Checkpoint>
    TotalCheckpoints,     // Vec<Checkpoint> for total supply
    Token,                // underlying SEP-41 token address
    Admin,
}

#[contract]
pub struct TokenVotesContract;

#[contractimpl]
impl TokenVotesContract {
    /// Initialize with the underlying SEP-41 token.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Delegate voting power from caller to delegatee.
    /// TODO issue #8: move existing voting power to new delegatee's checkpoints.
    pub fn delegate(env: Env, delegator: Address, delegatee: Address) {
        delegator.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Delegate(delegator.clone()), &delegatee);
        env.events()
            .publish((symbol_short!("delegate"), delegator), delegatee);
    }

    /// Get the current delegatee of an account.
    pub fn delegates(env: Env, account: Address) -> Option<Address> {
        env.storage().persistent().get(&DataKey::Delegate(account))
    }

    /// Get current voting power of an account.
    /// TODO issue #8: sum power from all delegators pointing to account.
    pub fn get_votes(env: Env, account: Address) -> i128 {
        let checkpoints: soroban_sdk::Vec<Checkpoint> = env
            .storage()
            .persistent()
            .get(&DataKey::Checkpoints(account))
            .unwrap_or(soroban_sdk::Vec::new(&env));
        if checkpoints.is_empty() {
            return 0;
        }
        checkpoints.last().unwrap().votes
    }

    /// Get voting power at a past ledger sequence (snapshot).
    /// TODO issue #9: implement binary search over checkpoints.
    pub fn get_past_votes(env: Env, account: Address, ledger: u32) -> i128 {
        let checkpoints: soroban_sdk::Vec<Checkpoint> = env
            .storage()
            .persistent()
            .get(&DataKey::Checkpoints(account))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        // Linear search fallback — binary search in issue #9.
        let mut result: i128 = 0;
        for i in 0..checkpoints.len() {
            let cp = checkpoints.get(i).unwrap();
            if cp.ledger <= ledger {
                result = cp.votes;
            } else {
                break;
            }
        }
        result
    }

    /// Get total token supply at a past ledger sequence.
    /// TODO issue #10: implement efficiently with total supply checkpointing.
    pub fn get_past_total_supply(env: Env, ledger: u32) -> i128 {
        let checkpoints: soroban_sdk::Vec<Checkpoint> = env
            .storage()
            .persistent()
            .get(&DataKey::TotalCheckpoints)
            .unwrap_or(soroban_sdk::Vec::new(&env));

        let mut result: i128 = 0;
        for i in 0..checkpoints.len() {
            let cp = checkpoints.get(i).unwrap();
            if cp.ledger <= ledger {
                result = cp.votes;
            } else {
                break;
            }
        }
        result
    }

    /// Write a checkpoint for an account. Called internally after balance changes.
    /// TODO issue #9: enforce append-only ordering and merge same-ledger checkpoints.
    pub fn checkpoint(env: Env, account: Address, votes: i128) {
        let mut checkpoints: soroban_sdk::Vec<Checkpoint> = env
            .storage()
            .persistent()
            .get(&DataKey::Checkpoints(account.clone()))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        checkpoints.push_back(Checkpoint {
            ledger: env.ledger().sequence(),
            votes,
        });

        env.storage()
            .persistent()
            .set(&DataKey::Checkpoints(account), &checkpoints);
    }
}
