import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther, type Address, type Hex } from "viem";

const SCHEDULER = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B";
const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
const HTTP_PRECOMPILE = "0x0000000000000000000000000000000000000801";
const JQ_PRECOMPILE = "0x0000000000000000000000000000000000000803";

const { viem, networkHelpers } = await network.create();
const publicClient = await viem.getPublicClient();

async function installRuntime(contractName: string, address: Address) {
  const source = await viem.deployContract(contractName);
  const code = await publicClient.getCode({ address: source.address });
  assert.ok(code);
  await networkHelpers.setCode(address, code as Hex);
}

async function deployFixture() {
  const [owner, alice, bob, carol] = await viem.getWalletClients();

  await installRuntime("MockScheduler", SCHEDULER);
  await installRuntime("MockRitualWallet", RITUAL_WALLET);
  await installRuntime("MockTEERegistry", TEE_REGISTRY);
  await installRuntime("MockHttpPrecompile", HTTP_PRECOMPILE);
  await installRuntime("MockJqPrecompile", JQ_PRECOMPILE);

  const scheduler = await viem.getContractAt("MockScheduler", SCHEDULER);
  const registry = await viem.getContractAt("MockTEERegistry", TEE_REGISTRY);
  const http = await viem.getContractAt("MockHttpPrecompile", HTTP_PRECOMPILE);
  const jq = await viem.getContractAt("MockJqPrecompile", JQ_PRECOMPILE);

  await registry.write.setResult([owner.account.address, true]);
  await http.write.setResponse([200, "0x7b227072696365223a343230307d", ""]);
  await jq.write.setResult([4200n, false]);

  const predict = await viem.deployContract("RitualPredict", [1000n]);
  const asAlice = await viem.getContractAt("RitualPredict", predict.address, {
    client: { wallet: alice },
  });
  const asBob = await viem.getContractAt("RitualPredict", predict.address, {
    client: { wallet: bob },
  });
  const asCarol = await viem.getContractAt("RitualPredict", predict.address, {
    client: { wallet: carol },
  });

  return {
    owner,
    alice,
    bob,
    carol,
    predict,
    asAlice,
    asBob,
    asCarol,
    scheduler,
    registry,
    http,
    jq,
  };
}

async function createMarket(
  predict: Awaited<ReturnType<typeof deployFixture>>["predict"],
  overrides: Partial<{
    question: string;
    target: bigint;
    comparator: number;
  }> = {},
) {
  await predict.write.createMarket([
    {
      question: overrides.question ?? "Will ETH be above $4,000?",
      oracleUrl: "http://localhost:3000/api/oracle/eth",
      jsonPath: ".price",
      target: overrides.target ?? 4000n,
      comparator: overrides.comparator ?? 1,
      bettingSeconds: 30n,
      resolveDelaySeconds: 15n,
    },
  ]);
  return predict.read.getMarket([1n]);
}

async function mineToResolve(resolveBlock: bigint) {
  const current = await publicClient.getBlockNumber();
  if (current < resolveBlock) await networkHelpers.mineUpTo(resolveBlock);
}

describe("RitualPredict", function () {
  it("creates a market and books all resolution attempts", async function () {
    const { owner, predict, scheduler } = await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);
    const scheduled = await scheduler.read.getCall([market.scheduleId]);

    assert.equal(market.id, 1n);
    assert.equal(market.creator.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(market.state, 0);
    assert.equal(scheduled.startBlock, Number(market.resolveBlock));
    assert.equal(scheduled.numCalls, 3);
    assert.equal(scheduled.frequency, 200);
    assert.equal(scheduled.ttl, 150);
    assert.equal(scheduled.gasLimit, 2_000_000);
    assert.equal(scheduled.payer.toLowerCase(), predict.address.toLowerCase());
  });

  it("rejects empty market rules and short durations", async function () {
    const { predict } = await networkHelpers.loadFixture(deployFixture);

    await assert.rejects(
      predict.write.createMarket([
        {
          question: "",
          oracleUrl: "https://example.com",
          jsonPath: ".price",
          target: 1n,
          comparator: 0,
          bettingSeconds: 30n,
          resolveDelaySeconds: 15n,
        },
      ]),
      /EmptyString/,
    );
    await assert.rejects(
      predict.write.createMarket([
        {
          question: "Too fast",
          oracleUrl: "https://example.com",
          jsonPath: ".price",
          target: 1n,
          comparator: 0,
          bettingSeconds: 29n,
          resolveDelaySeconds: 15n,
        },
      ]),
      /BadDuration/,
    );
  });

  it("closes betting at the deadline", async function () {
    const { predict, asAlice } = await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);

    await asAlice.write.bet([1n, true], { value: parseEther("1") });
    await networkHelpers.mineUpTo(market.closeBlock);
    await assert.rejects(
      asAlice.write.bet([1n, false], { value: parseEther("1") }),
      /BettingClosed/,
    );
    assert.equal((await predict.read.getMarket([1n])).state, 1);
  });

  it("allows only the Scheduler to use the resolution callback", async function () {
    const { predict } = await networkHelpers.loadFixture(deployFixture);
    await createMarket(predict);
    await assert.rejects(predict.write.onScheduledResolve([0n, 1n]), /OnlyScheduler/);
  });

  it("resolves YES and pays a proportional share of the whole pool", async function () {
    const { alice, bob, predict, asAlice, asBob, asCarol, scheduler } =
      await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);

    await asAlice.write.bet([1n, true], { value: parseEther("1") });
    await asBob.write.bet([1n, true], { value: parseEther("3") });
    await asCarol.write.bet([1n, false], { value: parseEther("4") });
    await mineToResolve(market.resolveBlock);
    const triggerHash = await scheduler.write.trigger([predict.address, 0n, 1n]);

    const resolved = await predict.read.getMarket([1n]);
    assert.equal(resolved.state, 3);
    assert.equal(resolved.outcome, 1);
    assert.equal(resolved.observedValue, 4200n);
    const triggerReceipt = await publicClient.getTransactionReceipt({ hash: triggerHash });
    const cancellationFailures = await publicClient.getContractEvents({
      address: predict.address,
      abi: predict.abi,
      eventName: "ScheduleCancellationFailed",
      fromBlock: triggerReceipt.blockNumber,
      toBlock: triggerReceipt.blockNumber,
      strict: true,
    });
    assert.equal(
      await scheduler.read.cancelled([market.scheduleId]),
      true,
      `schedule ${market.scheduleId} should be cancelled; failure=${String(cancellationFailures[0]?.args.reason)}`,
    );

    const aliceStake = await predict.read.stakesOf([1n, alice.account.address]);
    const bobStake = await predict.read.stakesOf([1n, bob.account.address]);
    assert.equal(aliceStake[3], parseEther("2"));
    assert.equal(bobStake[3], parseEther("6"));

    const balanceBefore = await publicClient.getBalance({ address: predict.address });
    await asAlice.write.claimWinnings([1n]);
    const balanceAfter = await publicClient.getBalance({ address: predict.address });
    assert.equal(balanceBefore - balanceAfter, parseEther("2"));
    await assert.rejects(asAlice.write.claimWinnings([1n]), /AlreadySettled/);
    await assert.rejects(asCarol.write.claimWinnings([1n]), /NothingToClaim/);
  });

  it("resolves NO when the comparison is false", async function () {
    const { bob, predict, asAlice, asBob, scheduler, jq } =
      await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict, { target: 5000n });
    await asAlice.write.bet([1n, true], { value: parseEther("1") });
    await asBob.write.bet([1n, false], { value: parseEther("1") });
    await jq.write.setResult([4200n, false]);
    await mineToResolve(market.resolveBlock);
    await scheduler.write.trigger([predict.address, 0n, 1n]);

    const resolved = await predict.read.getMarket([1n]);
    assert.equal(resolved.state, 3);
    assert.equal(resolved.outcome, 2);
    assert.equal((await predict.read.stakesOf([1n, bob.account.address]))[3], parseEther("2"));
  });

  it("retries failed oracle reads, then lets bettors refund", async function () {
    const { alice, predict, asAlice, asBob, scheduler, http } =
      await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);
    await asAlice.write.bet([1n, true], { value: parseEther("1") });
    await asBob.write.bet([1n, false], { value: parseEther("2") });
    await http.write.setResponse([503, "0x", "upstream unavailable"]);
    await mineToResolve(market.resolveBlock);

    for (let attempt = 0n; attempt < 3n; attempt++) {
      if (attempt > 0n) await networkHelpers.mine(200);
      await scheduler.write.trigger([predict.address, attempt, 1n]);
    }

    const invalid = await predict.read.getMarket([1n]);
    assert.equal(invalid.state, 4);
    assert.equal(invalid.attempts, 3);
    assert.equal(invalid.invalidReason, "upstream unavailable");
    assert.equal((await predict.read.stakesOf([1n, alice.account.address]))[3], parseEther("1"));

    await asAlice.write.claimRefund([1n]);
    await asBob.write.claimRefund([1n]);
    assert.equal(await publicClient.getBalance({ address: predict.address }), 0n);
  });

  it("does not turn malformed oracle data into a NO result", async function () {
    const { predict, asAlice, asBob, scheduler, http } =
      await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);
    await asAlice.write.bet([1n, true], { value: parseEther("1") });
    await asBob.write.bet([1n, false], { value: parseEther("1") });
    await http.write.setMode([1]);
    await mineToResolve(market.resolveBlock);
    await scheduler.write.trigger([predict.address, 0n, 1n]);

    const retrying = await predict.read.getMarket([1n]);
    assert.equal(retrying.state, 2);
    assert.equal(retrying.outcome, 0);
    assert.equal(retrying.attempts, 1);
  });

  it("invalidates a market when nobody backed the winning side", async function () {
    const { alice, predict, asAlice, scheduler } = await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);
    await asAlice.write.bet([1n, false], { value: parseEther("1") });
    await mineToResolve(market.resolveBlock);
    await scheduler.write.trigger([predict.address, 0n, 1n]);

    const invalid = await predict.read.getMarket([1n]);
    assert.equal(invalid.state, 4);
    assert.equal(invalid.invalidReason, "No stakes on the winning side");
    assert.equal((await predict.read.stakesOf([1n, alice.account.address]))[3], parseEther("1"));
  });

  it("lets anyone expire a market after all Scheduler windows have passed", async function () {
    const { predict, asAlice, asBob, scheduler } =
      await networkHelpers.loadFixture(deployFixture);
    const market = await createMarket(predict);
    await asAlice.write.bet([1n, true], { value: parseEther("1") });

    await mineToResolve(market.resolveBlock);
    await assert.rejects(asBob.write.expireMarket([1n]), /TooEarlyToExpire/);
    await networkHelpers.mineUpTo(market.resolveBlock + 551n);
    await asBob.write.expireMarket([1n]);

    const invalid = await predict.read.getMarket([1n]);
    assert.equal(invalid.state, 4);
    assert.equal(invalid.invalidReason, "Scheduled resolution expired");
    assert.equal(
      await scheduler.read.cancelled([market.scheduleId]),
      true,
      `schedule ${market.scheduleId} should be cancelled after expiry`,
    );
    await asAlice.write.claimRefund([1n]);
  });

  it("tracks prepaid execution funds separately from bets", async function () {
    const { predict } = await networkHelpers.loadFixture(deployFixture);
    await predict.write.fundExecution([1_000n], { value: parseEther("0.25") });
    assert.equal(await predict.read.executionBalance(), parseEther("0.25"));
    assert.equal(await publicClient.getBalance({ address: predict.address }), 0n);
  });
});
