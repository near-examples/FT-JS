import { Worker, NEAR } from "near-workspaces";
import test from "ava";

test.beforeEach(async (t) => {
  const worker = await Worker.init();

  const root = worker.rootAccount;
  const totalSupply = 1000;
  const contract = await root.devDeploy(
    "./build/contract.wasm", 
    { 
        initialBalance: NEAR.parse("300 N").toJSON(),
        method: "init",
        args: {
            total_supply: totalSupply.toString(),
        }
    }
);
  const alice = await root.createSubAccount("alice", { initialBalance: NEAR.parse("10 N").toJSON() });

  t.context.worker = worker;
  t.context.accounts = { root, contract, alice };
  t.context.variables = { totalSupply };
});

test.afterEach.always(async (t) => {
    await t.context.worker.tearDown().catch(error => {
        console.log('Failed to tear down the worker:', error);
      });
});

test.only("should register account and pay for storage", async (t) => {
    const { contract, alice } = t.context.accounts;
    const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("1 N").toJSON() });
    const expected = {
        message: `Account ${alice.accountId} registered with storage deposit of 330`,
    };
    t.deepEqual(result, expected);
});

test.skip("should return message when account is already registered and not refund when no deposit is attached", async (t) => {
    const { contract, alice } = t.context.accounts;
    const { totalSupply } = t.context.variables;
    const result = await alice.call(contract, "storage_deposit", { account_id: alice.accountId }, { attachedDeposit: NEAR.parse("10 N").toJSON() });
    t.is(result.message, "Account is already registered");
    t.is(await contract.view("ft_total_supply"), totalSupply.toString());
});

test.todo("should return message and refund predecessor caller when trying to pay for storage for an account that is already registered");
test.todo("should return message when trying to pay for storage with less than the required amount and refund predecessor caller");
test.todo("should throw when trying to transfer for an unregistered account");
test.todo("should unregister account and refund storage deposit once an account has no balance left after transfer");
