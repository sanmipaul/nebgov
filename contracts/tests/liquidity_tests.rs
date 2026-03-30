use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env,
};

// Import the liquidity contract
use sorogov_liquidity::{LiquidityContract, LiquidityContractClient, Pool};

const MIN_LIQUIDITY: i128 = 1000;

// ============================================================================
// Test Helper Functions
// ============================================================================

fn setup_test() -> (Env, LiquidityContractClient, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LiquidityContract, ());
    let client = LiquidityContractClient::new(&env, &contract_id);

    let provider1 = Address::generate(&env);
    let provider2 = Address::generate(&env);

    (env, client, provider1, provider2)
}

// ============================================================================
// Liquidity Management Tests
// ============================================================================

#[test]
fn test_add_liquidity_creates_pool() {
    let (env, client, provider, _) = setup_test();

    let lp_tokens = client.add_liquidity(&provider, &0, &1, &10000, &10000);

    assert_eq!(lp_tokens, 10000);

    let pool = client.get_pool(&0, &1);
    assert_eq!(pool.reserve_a, 10000);
    assert_eq!(pool.reserve_b, 10000);
    assert_eq!(pool.total_lp_supply, 10000);
}

#[test]
fn test_lp_tokens_minted_correctly() {
    let (env, client, provider, _) = setup_test();

    // First deposit
    let lp1 = client.add_liquidity(&provider, &0, &1, &10000, &10000);
    assert_eq!(lp1, 10000);

    // Second deposit (same ratio)
    let lp2 = client.add_liquidity(&provider, &0, &1, &5000, &5000);
    assert_eq!(lp2, 5000);

    let position = client.get_lp_position(&provider, &0, &1);
    assert_eq!(position, 15000);
}

#[test]
fn test_multiple_providers() {
    let (env, client, provider1, provider2) = setup_test();

    let lp1 = client.add_liquidity(&provider1, &0, &1, &10000, &10000);
    let lp2 = client.add_liquidity(&provider2, &0, &1, &5000, &5000);

    assert_eq!(lp1, 10000);
    assert_eq!(lp2, 5000);

    let pos1 = client.get_lp_position(&provider1, &0, &1);
    let pos2 = client.get_lp_position(&provider2, &0, &1);

    assert_eq!(pos1, 10000);
    assert_eq!(pos2, 5000);
}

#[test]
#[should_panic(expected = "below minimum liquidity")]
fn test_below_minimum_fails() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &500, &500);
}

#[test]
fn test_remove_liquidity_burns_tokens() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let (amount_a, amount_b) = client.remove_liquidity(&provider, &0, &1, &5000);

    assert_eq!(amount_a, 5000);
    assert_eq!(amount_b, 5000);

    let pool = client.get_pool(&0, &1);
    assert_eq!(pool.reserve_a, 5000);
    assert_eq!(pool.reserve_b, 5000);
    assert_eq!(pool.total_lp_supply, 5000);
}

#[test]
fn test_remove_liquidity_proportional_share() {
    let (env, client, provider1, provider2) = setup_test();

    client.add_liquidity(&provider1, &0, &1, &10000, &10000);
    client.add_liquidity(&provider2, &0, &1, &10000, &10000);

    let (amount_a, amount_b) = client.remove_liquidity(&provider1, &0, &1, &10000);

    assert_eq!(amount_a, 10000);
    assert_eq!(amount_b, 10000);
}

#[test]
fn test_full_withdrawal() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);
    let (amount_a, amount_b) = client.remove_liquidity(&provider, &0, &1, &10000);

    assert_eq!(amount_a, 10000);
    assert_eq!(amount_b, 10000);

    let position = client.get_lp_position(&provider, &0, &1);
    assert_eq!(position, 0);
}

#[test]
#[should_panic(expected = "insufficient LP tokens")]
fn test_insufficient_tokens_fails() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);
    client.remove_liquidity(&provider, &0, &1, &15000);
}

// ============================================================================
// Trading Tests
// ============================================================================

#[test]
fn test_basic_swap() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let amount_out = client.swap(&trader, &0, &1, &1000, &0);

    assert!(amount_out > 0);
    assert!(amount_out < 1000); // Due to slippage and fees
}

#[test]
fn test_price_impact() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let price_before = client.get_price(&0, &1);

    client.swap(&trader, &0, &1, &1000, &0);

    let price_after = client.get_price(&0, &1);

    assert!(price_after < price_before); // Price of outcome_b decreased
}

#[test]
fn test_multiple_consecutive_swaps() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let out1 = client.swap(&trader, &0, &1, &1000, &0);
    let out2 = client.swap(&trader, &0, &1, &1000, &0);

    assert!(out2 < out1); // Second swap gets worse rate due to price impact
}

#[test]
fn test_fee_collection() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let pool_before = client.get_pool(&0, &1);

    client.swap(&trader, &0, &1, &1000, &0);

    let pool_after = client.get_pool(&0, &1);

    // Reserves should reflect fee collection
    assert!(pool_after.reserve_a > pool_before.reserve_a);
}

#[test]
fn test_slippage_protection() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let amount_out = client.swap(&trader, &0, &1, &1000, &0);

    // This should work with reasonable slippage
    assert!(amount_out > 800);
}

#[test]
#[should_panic(expected = "slippage exceeded")]
fn test_slippage_exceeded_fails() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    // Demand unrealistic output
    client.swap(&trader, &0, &1, &1000, &10000);
}

// ============================================================================
// Price Discovery Tests
// ============================================================================

#[test]
fn test_equal_reserves_price() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    let price = client.get_price(&0, &1);

    assert_eq!(price, 10000); // 1:1 ratio scaled by 10000
}

#[test]
fn test_price_after_swap() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);

    client.swap(&trader, &0, &1, &1000, &0);

    let price = client.get_price(&0, &1);

    assert!(price < 10000); // Price shifted
}

#[test]
fn test_price_precision() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &20000, &10000);

    let price = client.get_price(&0, &1);

    assert_eq!(price, 5000); // 2:1 ratio
}

// ============================================================================
// Integration Tests
// ============================================================================

#[test]
fn test_full_liquidity_lifecycle() {
    let (env, client, provider, trader) = setup_test();

    // Add liquidity
    let lp_tokens = client.add_liquidity(&provider, &0, &1, &10000, &10000);
    assert_eq!(lp_tokens, 10000);

    // Perform swap
    let amount_out = client.swap(&trader, &0, &1, &1000, &0);
    assert!(amount_out > 0);

    // Remove liquidity
    let (amount_a, amount_b) = client.remove_liquidity(&provider, &0, &1, &lp_tokens);
    assert!(amount_a > 0);
    assert!(amount_b > 0);
}

// ============================================================================
// Security Tests
// ============================================================================

#[test]
#[should_panic(expected = "amounts must be positive")]
fn test_zero_amount_operations_fail() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &0, &10000);
}

#[test]
fn test_minimum_liquidity_enforcement() {
    let (env, client, provider, _) = setup_test();

    // Should succeed with minimum
    client.add_liquidity(&provider, &0, &1, &MIN_LIQUIDITY, &MIN_LIQUIDITY);

    let pool = client.get_pool(&0, &1);
    assert_eq!(pool.reserve_a, MIN_LIQUIDITY);
}

// ============================================================================
// Edge Cases
// ============================================================================

#[test]
fn test_very_large_trades() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &1_000_000, &1_000_000);

    let amount_out = client.swap(&trader, &0, &1, &100_000, &0);

    assert!(amount_out > 0);
    assert!(amount_out < 100_000);
}

#[test]
fn test_very_small_trades() {
    let (env, client, provider, trader) = setup_test();

    client.add_liquidity(&provider, &0, &1, &1_000_000, &1_000_000);

    let amount_out = client.swap(&trader, &0, &1, &10, &0);

    assert!(amount_out > 0);
}

#[test]
#[should_panic(expected = "pool not found")]
fn test_pool_depletion() {
    let (env, client, provider, _) = setup_test();

    client.add_liquidity(&provider, &0, &1, &10000, &10000);
    client.remove_liquidity(&provider, &0, &1, &10000);

    // Pool should be empty, this should fail
    client.get_pool(&0, &1);
}
