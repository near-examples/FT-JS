import { Worker, NEAR } from "near-workspaces";
import test from "ava";

test.beforeEach(async (t) => {
  const worker = await Worker.init();
  
  const totalSupply = 1000;
  const yoctoAccountStorage = "330";

  const root = worker.rootAccount;
  const contract = await root.devDeploy("./build/contract.wasm", {
    initialBalance: NEAR.parse("300 N").toJSON(),
    method: "init",
    args: {
      total_supply: totalSupply.toString(),
    },
  });
  const alice = await root.createSubAccount("alice", { initialBalance: NEAR.parse("10 N").toJSON() });

  t.context.worker = worker;
  t.context.accounts = { root, contract, alice };
  t.context.variables = { totalSupply, yoctoAccountStorage };
});

test.afterEach.always(async (t) => {
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to tear down the worker:", error);
  });
});

test("should register account and pay for storage", async (t) => {
  const { contract, alice } = t.context.accounts;
  const { yoctoAccountStorage } = t.context.variables;
  const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("1 N").toJSON() });
  const aliceAfterBalance = await alice.balance();
  const expected = {
    message: `Account ${alice.accountId} registered with storage deposit of ${yoctoAccountStorage}`,
  };
  t.deepEqual(result, expected);
  t.true(aliceAfterBalance.total > NEAR.parse("9 N").toJSON(), "alice should have received a refund");
});

test("should return message when account is already registered and not refund when no deposit is attached", async (t) => {
  const { contract, alice } = t.context.accounts;
  const { yoctoAccountStorage } = t.context.variables;
  const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("1 N").toJSON() });
  const expected = {
    message: `Account ${alice.accountId} registered with storage deposit of ${yoctoAccountStorage}`,
  };
  t.deepEqual(result, expected);
  const result2 = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("0 N").toJSON() });
  t.is(result2.message, "Account is already registered");
});

test("should return message and refund predecessor caller when trying to pay for storage for an account that is already registered", async (t) => {
    const { contract, alice } = t.context.accounts;
    const { yoctoAccountStorage } = t.context.variables;
    const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("1 N").toJSON() });
    const expected = {
        message: `Account ${alice.accountId} registered with storage deposit of ${yoctoAccountStorage}`,
    };
    t.deepEqual(result, expected);
    const result2 = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("1 N").toJSON() });
    t.is(result2.message, "Account is already registered, deposit refunded to predecessor");
    const aliceBalance = await alice.balance();
    t.is(aliceBalance.total > NEAR.parse("9 N"), true, "alice should have received a refund");
});

test("should return message when trying to pay for storage with less than the required amount and refund predecessor caller", async (t) => {
    const { contract, alice } = t.context.accounts;
    const { yoctoAccountStorage } = t.context.variables;
    const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.from("100").toJSON() });
    t.is(result.message, `Not enough attached deposit to cover storage cost. Required: ${yoctoAccountStorage}`);
});

test.todo("should throw when trying to transfer for an unregistered account");
test.todo("should unregister account and refund storage deposit once an account has no balance left after transfer");
