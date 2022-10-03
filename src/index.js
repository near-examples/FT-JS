import { NearBindgen, call, view, initialize, near, LookupMap, assert } from "near-sdk-js";

// TODO: assert one yocto implementation


@NearBindgen({ initRequired: true })
export class FungibleToken {
  accounts = new LookupMap("a");
  accountRegistrants = new LookupMap("r");
  accountDeposits = new LookupMap("c");
  totalSupply = "0";

  @initialize({})
  init({ total_supply: totalSupply }) {
    assert(BigInt(totalSupply) > BigInt(0), "Total supply should be a positive number");
    assert(this.totalSupply === "0", "Contract is already initialized");
    this.totalSupply = totalSupply;
    this.accounts.set(near.signerAccountId(), this.totalSupply);
  }

  internalGetMaxAccountStorageUsage() {
    const initialStorageUsage = near.storageUsage();
    const tempAccountId = "a".repeat(64);
    this.accounts.set(tempAccountId, "0");
    const maxAccountStorageUsage = near.storageUsage() - initialStorageUsage;
    this.accounts.remove(tempAccountId);
    return maxAccountStorageUsage * BigInt(3); // we create an entry in 3 maps
  }

  internalRegisterAccount({ registrantAccountId, accountId, amountStr }) {
    assert(!this.accounts.containsKey(accountId), "Account is already registered");
    this.accounts.set(accountId, "0");
    this.accountRegistrants.set(accountId, registrantAccountId);
    this.accountDeposits.set(accountId, amountStr);
  }

  internalUnregisterAccount({ accountId }) {
    assert(this.accounts.containsKey(accountId), "Account is not registered");
    assert(this.internalGetBalance(accountId) === "0", "Account has a balance");
    this.accounts.remove(accountId);
    const registrantAccountId = this.accountRegistrants.get(accountId);
    this.accountRegistrants.remove(accountId);
    const deposit = this.accountDeposits.get(accountId);
    this.accountDeposits.remove(accountId);
    this.internalSendNEAR(registrantAccountId, BigInt(deposit));
    near.log("Unregistered account " + accountId + " and refunded " + deposit + " yoctoNEAR to " + registrantAccountId);
  }

  internalSendNEAR(receivingAccountId, amountBigInt) {
    assert(amountBigInt > BigInt("0"), "The amount should be a positive number");
    assert(receivingAccountId != near.currentAccountId(), "Can't transfer to the contract itself");
    assert(amountBigInt < near.accountBalance(), `Not enough balance ${near.accountBalance()} to cover transfer of ${amountBigInt} yoctoNEAR`);
    const transferPromiseId = near.promiseBatchCreate(receivingAccountId);
    near.promiseBatchActionTransfer(transferPromiseId, amountBigInt);
    near.promiseReturn(transferPromiseId);
  }

  internalGetBalance({ accountId }) {
    assert(this.accounts.containsKey(accountId), "Account is not registered");
    return this.accounts.get(accountId);
  }

  internalDeposit({ accountId, amount }) {
    let balance = this.internalGetBalance({ accountId });
    let newBalance = BigInt(balance) + BigInt(amount);
    this.accounts.set(accountId, newBalance.toString());
    let newSupply = BigInt(this.totalSupply) + BigInt(amount);
    this.totalSupply = newSupply.toString();
  }

  internalWithdraw({ accountId, amount }) {
    let balance = this.internalGetBalance({ accountId });
    let newBalance = BigInt(balance) - BigInt(amount);
    assert(newBalance >= BigInt(0), "The account doesn't have enough balance");
    this.accounts.set(accountId, newBalance.toString());
    let newSupply = BigInt(this.totalSupply) - BigInt(amount);
    assert(newSupply >= BigInt(0), "Total supply overflow");
    this.totalSupply = newSupply.toString();
  }

  internalTransfer({ senderId, receiverId, amount, memo: _ }) {
    assert(senderId != receiverId, "Sender and receiver should be different");
    let amountInt = BigInt(amount);
    assert(amountInt > BigInt(0), "The amount should be a positive number");
    this.internalWithdraw({ accountId: senderId, amount });
    this.internalDeposit({ accountId: receiverId, amount });
    const remainingBalance = this.internalGetBalance({ accountId: senderId });
    if (remainingBalance === "0") {
      this.internalUnregisterAccount({ accountId: senderId });
    }
  }

  @call({ payableFunction: true })
  storage_deposit({ account_id }) {
    const accountId = account_id || near.predecessorAccountId();
    let attachedDeposit = near.attachedDeposit();
    if (this.accounts.containsKey(accountId)) {
      if (attachedDeposit > 0) {
        this.internalSendNEAR(near.predecessorAccountId(), attachedDeposit);
        return { message: "Account is already registered, deposit refunded to predecessor" };
      }
      return { message: "Account is already registered" };
    }
    let storageCost = this.internalGetMaxAccountStorageUsage();
    if (attachedDeposit < storageCost) {
      this.internalSendNEAR(near.predecessorAccountId(), attachedDeposit);
      return { message: `Not enough attached deposit to cover storage cost. Required: ${storageCost.toString()}` };
    }
    this.internalRegisterAccount({
      registrantAccountId: near.predecessorAccountId(),
      accountId: accountId,
      amountStr: storageCost.toString(),
    });
    let refund = attachedDeposit - storageCost;
    if (refund > 0) {
      near.log("Storage registration refunding " + refund + " yoctoNEAR to " + near.predecessorAccountId());
      this.internalSendNEAR(near.predecessorAccountId(), refund);
    }
    return { message: `Account ${accountId} registered with storage deposit of ${storageCost.toString()}` };
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
    near.promiseBatchActionFunctionCall(promise, "ft_on_transfer", JSON.stringify(params), 0, 30000000000000);
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
