#![no_std]

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, Address, Bytes, Env,
    Symbol, Vec,
};

const DEFAULT_PENDING_EXPIRY_LEDGERS: u32 = 17_280;

/// A treasury transaction proposal.
#[contracttype]
#[derive(Clone)]
pub struct TxProposal {
    pub id: u64,
    pub proposer: Address,
    pub target: Address,
    pub fn_name: Symbol,
    pub data: Bytes,
    pub created_ledger: u32,
    pub approvals: u32,
    pub executed: bool,
    pub cancelled: bool,
}

#[contracttype]
pub enum DataKey {
    TxCount,
    Tx(u64),
    Owners,
    Threshold,
    PendingExpiryLedgers,
    IsExecuting,
    HasApproved(u64, Address),
    Governor,
}

#[contractclient(name = "TreasuryClient")]
pub trait TreasuryTrait {
    fn approve(env: Env, approver: Address, tx_id: u64);
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// Initialize with owners, threshold, and governor address.
    pub fn initialize(env: Env, owners: Vec<Address>, threshold: u32, governor: Address) {
        assert!(!owners.is_empty(), "no owners");
        assert!(
            threshold > 0 && threshold <= owners.len() as u32,
            "bad threshold"
        );
        env.storage().instance().set(&DataKey::Owners, &owners);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        env.storage().instance().set(
            &DataKey::PendingExpiryLedgers,
            &DEFAULT_PENDING_EXPIRY_LEDGERS,
        );
        env.storage().instance().set(&DataKey::IsExecuting, &false);
        env.storage().instance().set(&DataKey::Governor, &governor);
        env.storage().instance().set(&DataKey::TxCount, &0u64);
    }

    /// Submit a new transaction for approval.
    /// TODO issue #22: add owner-only guard and event emission.
    pub fn submit(
        env: Env,
        proposer: Address,
        target: Address,
        fn_name: Symbol,
        data: Bytes,
    ) -> u64 {
        proposer.require_auth();
        Self::require_not_executing(&env);
        Self::require_owner(&env, &proposer);

        let count: u64 = env.storage().instance().get(&DataKey::TxCount).unwrap_or(0);
        let id = count + 1;

        let tx = TxProposal {
            id,
            proposer,
            target,
            fn_name,
            data,
            created_ledger: env.ledger().sequence(),
            approvals: 0,
            executed: false,
            cancelled: false,
        };

        env.storage().persistent().set(&DataKey::Tx(id), &tx);
        env.storage().instance().set(&DataKey::TxCount, &id);
        env.events().publish((symbol_short!("submit"),), id);

        id
    }

    /// Approve a pending transaction. Executes automatically when threshold reached.
    pub fn approve(env: Env, approver: Address, tx_id: u64) {
        Self::require_not_executing(&env);
        approver.require_auth();
        Self::require_owner(&env, &approver);

        let already: bool = env
            .storage()
            .persistent()
            .get(&DataKey::HasApproved(tx_id, approver.clone()))
            .unwrap_or(false);
        assert!(!already, "already approved");

        let mut tx: TxProposal = env
            .storage()
            .persistent()
            .get(&DataKey::Tx(tx_id))
            .expect("tx not found");
        assert!(!tx.executed && !tx.cancelled, "invalid state");
        Self::require_not_expired(&env, &tx);

        tx.approvals += 1;
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(1);

        env.storage()
            .persistent()
            .set(&DataKey::HasApproved(tx_id, approver.clone()), &true);

        if tx.approvals >= threshold {
            // State-first: commit executed before making any external call.
            tx.executed = true;
            env.storage().persistent().set(&DataKey::Tx(tx_id), &tx);

            // Lock execution path to reject reentrant approve/cancel/submit.
            env.storage().instance().set(&DataKey::IsExecuting, &true);
            env.invoke_contract::<()>(&tx.target, &tx.fn_name, Vec::new(&env));
            env.storage().instance().set(&DataKey::IsExecuting, &false);
            env.events().publish((symbol_short!("execute"),), tx_id);
        } else {
            env.storage().persistent().set(&DataKey::Tx(tx_id), &tx);
        }

        env.events()
            .publish((symbol_short!("approve"), approver), tx_id);
    }

    /// Cancel a pending transaction. Owner or governor only.
    pub fn cancel(env: Env, caller: Address, tx_id: u64) {
        Self::require_not_executing(&env);
        caller.require_auth();
        let governor: Address = env
            .storage()
            .instance()
            .get(&DataKey::Governor)
            .expect("not initialized");
        let is_owner = Self::is_owner(&env, &caller);
        assert!(is_owner || caller == governor, "not authorized");

        let mut tx: TxProposal = env
            .storage()
            .persistent()
            .get(&DataKey::Tx(tx_id))
            .expect("tx not found");
        assert!(!tx.executed && !tx.cancelled, "invalid state");
        tx.cancelled = true;
        env.storage().persistent().set(&DataKey::Tx(tx_id), &tx);
        env.events().publish((symbol_short!("cancel"),), tx_id);
    }

    pub fn get_tx(env: Env, tx_id: u64) -> TxProposal {
        env.storage()
            .persistent()
            .get(&DataKey::Tx(tx_id))
            .expect("tx not found")
    }

    pub fn threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(1)
    }

    /// Current pending transaction expiry window measured in ledgers.
    pub fn pending_expiry_ledgers(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::PendingExpiryLedgers)
            .unwrap_or(DEFAULT_PENDING_EXPIRY_LEDGERS)
    }

    /// Update pending transaction expiry. Only governor may update.
    pub fn update_pending_expiry(env: Env, caller: Address, ledgers: u32) {
        caller.require_auth();
        let governor: Address = env
            .storage()
            .instance()
            .get(&DataKey::Governor)
            .expect("not initialized");
        assert!(caller == governor, "only governor");
        assert!(ledgers > 0, "expiry must be > 0");
        env.storage()
            .instance()
            .set(&DataKey::PendingExpiryLedgers, &ledgers);
    }

    /// Returns true when a pending tx exceeded the configured expiry window.
    pub fn is_expired(env: Env, tx_id: u64) -> bool {
        let tx: TxProposal = env
            .storage()
            .persistent()
            .get(&DataKey::Tx(tx_id))
            .expect("tx not found");
        Self::is_tx_expired(&env, &tx)
    }

    // --- Internal helpers ---

    fn require_owner(env: &Env, addr: &Address) {
        assert!(Self::is_owner(env, addr), "not an owner");
    }

    fn require_not_executing(env: &Env) {
        let is_executing: bool = env
            .storage()
            .instance()
            .get(&DataKey::IsExecuting)
            .unwrap_or(false);
        assert!(!is_executing, "reentrant execution blocked");
    }

    fn require_not_expired(env: &Env, tx: &TxProposal) {
        assert!(!Self::is_tx_expired(env, tx), "tx expired");
    }

    fn is_tx_expired(env: &Env, tx: &TxProposal) -> bool {
        let ttl: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PendingExpiryLedgers)
            .unwrap_or(DEFAULT_PENDING_EXPIRY_LEDGERS);
        env.ledger().sequence() > tx.created_ledger.saturating_add(ttl)
    }

    fn is_owner(env: &Env, addr: &Address) -> bool {
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Owners)
            .unwrap_or(Vec::new(env));
        for i in 0..owners.len() {
            if owners.get(i).unwrap() == *addr {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        contract,
        testutils::{Address as _, Ledger},
    };

    #[contract]
    struct NoopTarget;

    #[contractimpl]
    impl NoopTarget {
        pub fn ping(_env: Env) {}
    }

    #[contract]
    struct ReentrantTarget;

    #[contracttype]
    enum ReentrantKey {
        Treasury,
        Approver,
        TxId,
    }

    #[contractimpl]
    impl ReentrantTarget {
        pub fn configure(env: Env, treasury: Address, approver: Address, tx_id: u64) {
            env.storage()
                .instance()
                .set(&ReentrantKey::Treasury, &treasury);
            env.storage()
                .instance()
                .set(&ReentrantKey::Approver, &approver);
            env.storage().instance().set(&ReentrantKey::TxId, &tx_id);
        }

        pub fn attack(env: Env) {
            let treasury: Address = env
                .storage()
                .instance()
                .get(&ReentrantKey::Treasury)
                .expect("treasury missing");
            let approver: Address = env
                .storage()
                .instance()
                .get(&ReentrantKey::Approver)
                .expect("approver missing");
            let tx_id: u64 = env
                .storage()
                .instance()
                .get(&ReentrantKey::TxId)
                .expect("tx missing");
            TreasuryClient::new(&env, &treasury).approve(&approver, &tx_id);
        }
    }

    #[test]
    #[should_panic]
    fn approve_rejects_reentrant_call() {
        let env = Env::default();
        env.mock_all_auths();

        let treasury_id = env.register(TreasuryContract, ());
        let treasury = TreasuryContractClient::new(&env, &treasury_id);
        let owner_1 = Address::generate(&env);
        let owner_2 = Address::generate(&env);
        let governor = Address::generate(&env);
        let owners = Vec::from_array(&env, [owner_1.clone(), owner_2.clone()]);
        treasury.initialize(&owners, &1, &governor);

        let noop_id = env.register(NoopTarget, ());
        let noop_fn = Symbol::new(&env, "ping");
        let tx2 = treasury.submit(&owner_2, &noop_id, &noop_fn, &Bytes::new(&env));

        let reentrant_id = env.register(ReentrantTarget, ());
        let reentrant = ReentrantTargetClient::new(&env, &reentrant_id);
        reentrant.configure(&treasury_id, &owner_2, &tx2);

        let attack_fn = Symbol::new(&env, "attack");
        let tx1 = treasury.submit(&owner_1, &reentrant_id, &attack_fn, &Bytes::new(&env));
        treasury.approve(&owner_1, &tx1);
    }

    #[test]
    #[should_panic(expected = "tx expired")]
    fn approve_rejects_expired_pending_tx() {
        let env = Env::default();
        env.mock_all_auths();

        let treasury_id = env.register(TreasuryContract, ());
        let treasury = TreasuryContractClient::new(&env, &treasury_id);
        let owner = Address::generate(&env);
        let governor = Address::generate(&env);
        let owners = Vec::from_array(&env, [owner.clone()]);
        treasury.initialize(&owners, &1, &governor);
        treasury.update_pending_expiry(&governor, &5);

        env.ledger().set_sequence_number(10);
        let noop_id = env.register(NoopTarget, ());
        let noop_fn = Symbol::new(&env, "ping");
        let tx = treasury.submit(&owner, &noop_id, &noop_fn, &Bytes::new(&env));

        env.ledger().set_sequence_number(16);
        treasury.approve(&owner, &tx);
    }
}
