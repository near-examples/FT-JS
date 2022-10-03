import {
  NearBindgen,
  call,
  view,
  initialize,
  near,
  LookupMap,
  assert,
} from "near-sdk-js";

// TODO: assert one yocto implementation
// TODO: storage management

@NearBindgen({ initRequired: true })
export class FungibleToken {
  constructor() {
    this.accounts = new LookupMap("a");
    this.accountRegistrants = new LookupMap("r");
    this.accountDeposits = new LookupMap("c");
    this.totalSupply = BigInt(0);
  }

  @initialize({})
  init({ prefix, total_supply: totalSupply }) {
    this.accounts = new LookupMap(prefix);
    this.totalSupply = BigInt(totalSupply);
    this.accounts.set(near.signerAccountId(), this.totalSupply);
  }

  internalGetMaxAccountStorageUsage() {
    const initialStorageUsage = near.storageUsage();
    const tempAccountId = "a".repeat(64);
    this.accounts.insert(tempAccountId, 0n);
    const maxAccountStorageUsage = near.storageUsage() - initialStorageUsage;
    this.accounts.remove(tempAccountId);
    return maxAccountStorageUsage;
  }

  internalRegisterAccount({ registrantAccountId, accountId, amount }) {
    assert(
      !this.accounts.containsKey(accountId),
      "Account is already registered"
    );
    this.accounts.set(accountId, BigInt(0));
    this.accountRegistrants.set(accountId, registrantAccountId);
    this.accountDeposits.set(accountId, amount);
  }

  internalUnregisterAccount({ accountId }) {
    assert(this.accounts.containsKey(accountId), "Account is not registered");
    assert(this.internalGetBalance(accountId) == 0n, "Account has a balance");
    this.accounts.remove(accountId);
    const registrantAccountId = this.accountRegistrants.get(accountId);
    this.accountRegistrants.remove(accountId);
    const deposit = this.accountDeposits.get(accountId);
    this.accountDeposits.remove(accountId);
    near.transfer(registrantAccountId, deposit);
  }

  internalGetBalance({ accountId }) {
    assert(this.accounts.containsKey(accountId), "Account is not registered");
    return this.accounts.get(accountId);
  }

  internalDeposit({ accountId, amount }) {
    let balance = this.internalGetBalance({ accountId });
    let newBalance = balance + BigInt(amount);
    this.accounts.set(accountId, newBalance);
    this.totalSupply += BigInt(amount);
  }

  internalWithdraw({ accountId, amount }) {
    let balance = this.internalGetBalance({ accountId });
    let newBalance = balance - BigInt(amount);
    assert(newBalance >= BigInt(0), "The account doesn't have enough balance");
    this.accounts.set(accountId, newBalance);
    let newSupply = this.totalSupply - BigInt(amount);
    assert(newSupply >= BigInt(0), "Total supply overflow");
    this.totalSupply = newSupply;
  }

  internalTransfer({ senderId, receiverId, amount, memo: _ }) {
    assert(senderId != receiverId, "Sender and receiver should be different");
    let amountInt = BigInt(amount);
    assert(amountInt > BigInt(0), "The amount should be a positive number");
    this.internalWithdraw({ accountId: senderId, amount });
    this.internalDeposit({ accountId: receiverId, amount });
    const remainingBalance = this.internalGetBalance({ accountId: senderId });
    if (remainingBalance === BigInt(0)) {
      this.internalUnregisterAccount({ accountId: senderId });
    }
  }

  @call({ payableFunction: true })
  storage_deposit({ account_id: accountId }) {
    const accountId = accountId || near.predecessorAccountId();
    let attachedDeposit = near.attachedDeposit();
    if (this.accounts.containsKey(accountId)) {
      if (attachedDeposit > 0) {
        near.transfer(near.predecessorAccountId(), attachedDeposit);
        return { message: "Account is already registered, deposit refunded to predecessor" };
      }
      return { message: "Account is already registered" };
    }
    let storageCost = this.internalGetMaxAccountStorageUsage();
    if (attachedDeposit < storageCost) {
      near.transfer(near.predecessorAccountId(), attachedDeposit);
      return { message: "Not enough attached deposit to cover storage cost" };
    } 
    this.internalRegisterAccount({ accountId });
    let refund = attachedDeposit - storageCost;
    if (refund > 0) {
      near.log("Storage registration refunding " + refund + " yoctoNEAR to " + near.predecessorAccountId());
      near.transfer(near.predecessorAccountId(), refund);
    }
    return { message: `Account ${accountId} registered with storage deposit of ${storageCost}` };
  }

  @call({})
  ft_transfer({ received_id: receiverId, amount, memo }) {
    let senderId = near.predecessorAccountId();
    this.internalTransfer({ senderId, receiverId, amount, memo });
  }

  @call({})
  ft_transfer_call({ receiver_id: receiverId, amount, memo, msg }) {
    let senderId = near.predecessorAccountId();
    this.internalTransfer({ senderId, receiverId, amount, memo });
    const promise = near.promiseBatchCreate(receiverId);
    const params = {
      senderId: senderId,
      amount: amount,
      msg: msg,
      receiverId: receiverId,
    };
    near.promiseBatchActionFunctionCall(
      promise,
      "ft_on_transfer",
      JSON.stringify(params),
      0,
      30000000000000
    );
    return near.promiseReturn();
  }

  @view({})
  ft_total_supply() {
    return this.totalSupply;
  }

  @view({})
  ft_balance_of({ account_id: accountId }) {
    return this.internalGetBalance({ accountId });
  }
}