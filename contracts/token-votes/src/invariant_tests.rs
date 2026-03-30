//! Property-based tests for token-votes checkpointing correctness.
//!
//! These tests verify critical invariants that must hold for all possible
//! delegation operation sequences.

#[cfg(test)]
mod invariant_tests {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{testutils::Address as _, token, Env};

    /// Setup a token-votes contract with a test token.
    fn setup(env: &Env) -> (Address, Address, Address) {
        let admin = Address::generate(env);
        let token_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let contract_id = env.register(TokenVotesContract, ());
        let client = TokenVotesContractClient::new(env, &contract_id);
        client.initialize(&admin, &token_addr);
        (contract_id, token_addr, admin)
    }

    /// Generate a random delegation operation.
    fn delegation_operation() -> impl Strategy<Value = (Address, Address, i128)> {
        (
            any::<[u8; 32]>(),
            any::<[u8; 32]>(),
            1..1000i128,
        )
            .prop_map(|(delegator_bytes, delegatee_bytes, balance)| {
                let env = Env::default();
                let delegator = Address::from_string_bytes(
                    &soroban_sdk::Bytes::from_array(&env, &delegator_bytes),
                );
                let delegatee = Address::from_string_bytes(
                    &soroban_sdk::Bytes::from_array(&env, &delegatee_bytes),
                );
                (delegator, delegatee, balance)
            })
    }

    proptest! {
        /// Invariant 1: Monotonicity — checkpoint ledgers are strictly non-decreasing.
        #[test]
        fn checkpoint_ledgers_are_monotonic(
            ops in vec(delegation_operation(), 1..20)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, token_addr, admin) = setup(&env);
            let client = TokenVotesContractClient::new(&env, &contract_id);
            let sac_client = token::StellarAssetClient::new(&env, &token_addr);

            for (delegator, delegatee, balance) in ops {
                sac_client.mint(&delegator, &balance);
                client.delegate(&delegator, &delegatee);
                env.ledger().with_mut(|l| l.sequence_number += 1);
            }

            // Verify monotonicity for all accounts
            let checkpoints: soroban_sdk::Vec<Checkpoint> = env.as_contract(&contract_id, || {
                env.storage().persistent().get(&DataKey::TotalCheckpoints).unwrap_or(soroban_sdk::Vec::new(&env))
            });

            let mut prev_ledger = 0u32;
            for i in 0..checkpoints.len() {
                let cp = checkpoints.get(i).unwrap();
                assert!(cp.ledger >= prev_ledger, "Checkpoint ledger must be non-decreasing");
                prev_ledger = cp.ledger;
            }
        }

        /// Invariant 2: Conservation — total delegated supply = sum of all delegate balances.
        #[test]
        fn total_supply_equals_sum_of_delegates(
            ops in vec(delegation_operation(), 1..20)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, token_addr, admin) = setup(&env);
            let client = TokenVotesContractClient::new(&env, &contract_id);
            let sac_client = token::StellarAssetClient::new(&env, &token_addr);

            let mut delegate_balances: std::collections::HashMap<Address, i128> = std::collections::HashMap::new();

            for (delegator, delegatee, balance) in ops {
                sac_client.mint(&delegator, &balance);
                client.delegate(&delegator, &delegatee);
                
                // Track delegate balances
                *delegate_balances.entry(delegatee.clone()).or_insert(0) += balance;
                env.ledger().with_mut(|l| l.sequence_number += 1);
            }

            // Verify conservation
            let total_supply = client.get_past_total_supply(&env.ledger().sequence());
            let sum_of_delegates: i128 = delegate_balances.values().sum();
            assert_eq!(total_supply, sum_of_delegates, "Total supply must equal sum of delegate balances");
        }

        /// Invariant 3: Snapshot isolation — get_past_votes(addr, L) is immutable once ledger L has passed.
        #[test]
        fn snapshot_isolation(
            ops in vec(delegation_operation(), 1..10)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, token_addr, admin) = setup(&env);
            let client = TokenVotesContractClient::new(&env, &contract_id);
            let sac_client = token::StellarAssetClient::new(&env, &token_addr);

            let mut snapshots: std::collections::HashMap<(Address, u32), i128> = std::collections::HashMap::new();

            for (delegator, delegatee, balance) in ops {
                sac_client.mint(&delegator, &balance);
                let current_ledger = env.ledger().sequence();
                client.delegate(&delegator, &delegatee);
                
                // Record snapshot
                let votes = client.get_past_votes(&delegatee, &current_ledger);
                snapshots.insert((delegatee.clone(), current_ledger), votes);
                
                env.ledger().with_mut(|l| l.sequence_number += 1);
            }

            // Verify snapshot isolation
            for ((addr, ledger), expected_votes) in snapshots {
                let current_votes = client.get_past_votes(&addr, &ledger);
                assert_eq!(current_votes, expected_votes, "Snapshot must be immutable once ledger has passed");
            }
        }

        /// Invariant 4: Zero before delegation — result is 0 for any ledger before first delegation.
        #[test]
        fn zero_before_delegation(
            ops in vec(delegation_operation(), 1..10)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, token_addr, admin) = setup(&env);
            let client = TokenVotesContractClient::new(&env, &contract_id);
            let sac_client = token::StellarAssetClient::new(&env, &token_addr);

            for (delegator, delegatee, balance) in ops {
                sac_client.mint(&delegator, &balance);
                let current_ledger = env.ledger().sequence();
                
                // Check votes before delegation
                let votes_before = client.get_past_votes(&delegatee, &current_ledger);
                assert_eq!(votes_before, 0, "Votes must be 0 before first delegation");
                
                client.delegate(&delegator, &delegatee);
                env.ledger().with_mut(|l| l.sequence_number += 1);
            }
        }

        /// Invariant 5: Self-delegation — gives voting power equal to token balance.
        #[test]
        fn self_delegation_gives_voting_power(
            balances in vec(1..1000i128, 1..10)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (contract_id, token_addr, admin) = setup(&env);
            let client = TokenVotesContractClient::new(&env, &contract_id);
            let sac_client = token::StellarAssetClient::new(&env, &token_addr);

            for balance in balances {
                let delegator = Address::generate(&env);
                sac_client.mint(&delegator, &balance);
                client.delegate(&delegator, &delegator);
                
                let votes = client.get_votes(&delegator);
                assert_eq!(votes, balance, "Self-delegation must give voting power equal to token balance");
                
                env.ledger().with_mut(|l| l.sequence_number += 1);
            }
        }
    }
}
