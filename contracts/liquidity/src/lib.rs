#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const MIN_LIQUIDITY: i128 = 1000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pool {
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_lp_supply: i128,
    pub fee_bps: u32, // basis points (100 = 1%)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LPPosition {
    pub lp_tokens: i128,
}

#[contract]
pub struct LiquidityContract;

#[contractimpl]
impl LiquidityContract {
    /// Add liquidity to a pool
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        outcome_a: u32,
        outcome_b: u32,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        provider.require_auth();

        if amount_a <= 0 || amount_b <= 0 {
            panic!("amounts must be positive");
        }

        if amount_a < MIN_LIQUIDITY || amount_b < MIN_LIQUIDITY {
            panic!("below minimum liquidity");
        }

        let pool_key = (outcome_a, outcome_b);
        let mut pool: Pool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .unwrap_or(Pool {
                reserve_a: 0,
                reserve_b: 0,
                total_lp_supply: 0,
                fee_bps: 30, // 0.3% default
            });

        let lp_tokens = if pool.total_lp_supply == 0 {
            // First deposit
            amount_a
        } else {
            // Subsequent deposits
            (amount_a * pool.total_lp_supply) / pool.reserve_a
        };

        pool.reserve_a += amount_a;
        pool.reserve_b += amount_b;
        pool.total_lp_supply += lp_tokens;

        env.storage().persistent().set(&pool_key, &pool);

        // Update LP position
        let position_key = (provider.clone(), outcome_a, outcome_b);
        let mut position: LPPosition = env
            .storage()
            .persistent()
            .get(&position_key)
            .unwrap_or(LPPosition { lp_tokens: 0 });

        position.lp_tokens += lp_tokens;
        env.storage().persistent().set(&position_key, &position);

        lp_tokens
    }

    /// Remove liquidity from a pool
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        outcome_a: u32,
        outcome_b: u32,
        lp_tokens: i128,
    ) -> (i128, i128) {
        provider.require_auth();

        if lp_tokens <= 0 {
            panic!("lp_tokens must be positive");
        }

        let pool_key = (outcome_a, outcome_b);
        let mut pool: Pool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .expect("pool not found");

        let position_key = (provider.clone(), outcome_a, outcome_b);
        let mut position: LPPosition = env
            .storage()
            .persistent()
            .get(&position_key)
            .expect("no LP position");

        if position.lp_tokens < lp_tokens {
            panic!("insufficient LP tokens");
        }

        let amount_a = (lp_tokens * pool.reserve_a) / pool.total_lp_supply;
        let amount_b = (lp_tokens * pool.reserve_b) / pool.total_lp_supply;

        pool.reserve_a -= amount_a;
        pool.reserve_b -= amount_b;
        pool.total_lp_supply -= lp_tokens;
        position.lp_tokens -= lp_tokens;

        env.storage().persistent().set(&pool_key, &pool);
        env.storage().persistent().set(&position_key, &position);

        (amount_a, amount_b)
    }

    /// Swap tokens
    pub fn swap(
        env: Env,
        trader: Address,
        outcome_in: u32,
        outcome_out: u32,
        amount_in: i128,
        min_amount_out: i128,
    ) -> i128 {
        trader.require_auth();

        if amount_in <= 0 {
            panic!("amount_in must be positive");
        }

        let pool_key = (outcome_in, outcome_out);
        let mut pool: Pool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .expect("pool not found");

        // Calculate output using constant product formula
        let amount_out = (amount_in * pool.reserve_b) / (pool.reserve_a + amount_in);

        // Apply fee
        let fee = (amount_out * pool.fee_bps as i128) / 10000;
        let amount_out_with_fee = amount_out - fee;

        if amount_out_with_fee < min_amount_out {
            panic!("slippage exceeded");
        }

        pool.reserve_a += amount_in;
        pool.reserve_b -= amount_out_with_fee;

        env.storage().persistent().set(&pool_key, &pool);

        amount_out_with_fee
    }

    /// Get pool info
    pub fn get_pool(env: Env, outcome_a: u32, outcome_b: u32) -> Pool {
        let pool_key = (outcome_a, outcome_b);
        env.storage()
            .persistent()
            .get(&pool_key)
            .expect("pool not found")
    }

    /// Get LP position
    pub fn get_lp_position(env: Env, provider: Address, outcome_a: u32, outcome_b: u32) -> i128 {
        let position_key = (provider, outcome_a, outcome_b);
        let position: LPPosition = env
            .storage()
            .persistent()
            .get(&position_key)
            .unwrap_or(LPPosition { lp_tokens: 0 });
        position.lp_tokens
    }

    /// Calculate price
    pub fn get_price(env: Env, outcome_a: u32, outcome_b: u32) -> i128 {
        let pool: Pool = Self::get_pool(env, outcome_a, outcome_b);
        if pool.reserve_a == 0 {
            return 0;
        }
        (pool.reserve_b * 10000) / pool.reserve_a
    }
}
