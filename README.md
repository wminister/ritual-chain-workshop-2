# Ritual Predict

This is my fork of the second Ritual Academy workshop. The starter contract was already laid out, but the five main pieces of the resolution flow were left for us to finish. I completed those parts, wrote local tests for the full market lifecycle, and added a small dashboard so the contract is easier to try.

## What I changed

- Finished market creation and Scheduler setup.
- Added TEE executor selection through the Ritual service registry.
- Added the HTTP and jq precompile calls used to read the oracle value.
- Finished scheduled settlement, retries, invalid markets, payouts, and refunds.
- Added `expireMarket` so funds are not stuck forever if every scheduled call is missed.
- Added local mocks and 11 tests.
- Added a Next.js dashboard and a simple ETH price endpoint for the workshop demo.

## Market lifecycle

1. A user creates a market with a question, oracle URL, JSON path, target, comparator, and two durations.
2. The contract converts the durations to block numbers and books three Scheduler calls in advance.
3. People bet native RITUAL on YES or NO until `closeBlock`.
4. At `resolveBlock`, the Scheduler calls `onScheduledResolve`.
5. The contract picks an HTTP-capable TEE executor, fetches the oracle URL, and sends the response through the jq precompile.
6. A valid number is compared with the market target. Winners can then claim their share of the complete pool.
7. A failed oracle read is retried instead of being counted as NO. After three failures, the market is invalid and everyone can claim their original stake.

There is also an emergency path. If the Scheduler never reaches the contract, anyone can call `expireMarket` after the last scheduled attempt and its TTL have passed. This does not choose a winner; it makes the market refundable.

## Architecture note

`RitualPredict.sol` keeps the market rules, stakes, state, and final observed value on-chain. The Scheduler is responsible for calling the contract at the blocks selected during market creation. During that call, the contract asks the TEE registry for an HTTP executor, calls Ritual's HTTP precompile at `0x0801`, and parses one integer with the jq precompile at `0x0803`. Execution fees are prepaid in RitualWallet and are separate from the RITUAL held for bets.

The oracle URL is still a trust choice. A TEE can protect the execution of the request, but it cannot make a bad or manipulated data source correct. The market rule is immutable after creation, and a failed request never silently becomes a NO result. Payouts are pull-based, so settlement does not loop over every bettor.

## Run the contract locally

```bash
cd hardhat
pnpm install
pnpm hardhat test
```

The tests place local mock bytecode at Ritual's canonical system addresses. They do not need a funded wallet or a working testnet.

## Test plan

The current suite checks:

- valid market creation and the exact Scheduler settings;
- empty rules and invalid durations;
- bets before and after the close block;
- rejection of callbacks from any address except Scheduler;
- YES and NO outcomes;
- proportional winnings and double-claim protection;
- non-200 and malformed oracle responses;
- three failed attempts followed by refunds;
- a result with no stake on the winning side;
- permissionless expiry after all Scheduler windows pass;
- prepaid execution funds staying separate from the betting pool.

## Run the dashboard

```bash
cd web
pnpm install
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. Without a contract address, the page opens in preview mode. After deployment, put the address in `web/.env.local` as `NEXT_PUBLIC_PREDICT_ADDRESS`.

The demo oracle is available at `http://localhost:3000/api/oracle/eth`. A Ritual TEE cannot reach your localhost, so a real testnet market needs that endpoint exposed through a public tunnel and passed as `ORACLE_URL`.

## Deploy to Ritual Chain

Hardhat keeps the deployer key in its encrypted keystore. Do not commit it to this repository.

```bash
cd hardhat
pnpm hardhat keystore set DEPLOYER_PRIVATE_KEY
pnpm hardhat run scripts/block-time.ts --network ritual
pnpm hardhat run scripts/deploy.ts --network ritual
```

The deploy script also puts 0.5 RITUAL into the contract's execution balance by default. If the testnet or Scheduler is unavailable, the local tests and dashboard still demonstrate the work without pretending a deployment succeeded.

## What I learned

The main thing I understood from this workshop is that automatic resolution needs more than an oracle call. The contract has to schedule the callback, fund it, choose an executor, parse the response, and handle every failure without locking user funds. I initially thought a failed request could just return false, but that would incorrectly settle the market as NO. Retries make more sense, and after the retries there should be a refund path. I also found it useful to keep deadlines in blocks because the Scheduler works with blocks too. The TEE protects how the request is executed, but the market creator still has to choose a data source people can trust.

## Project layout

```text
hardhat/contracts/RitualPredict.sol       market contract
hardhat/contracts/ritual/RitualChain.sol Ritual addresses and interfaces
hardhat/contracts/mocks/RitualMocks.sol  local system-contract mocks
hardhat/test/RitualPredict.ts             lifecycle tests
hardhat/scripts/                           deploy and status scripts
web/                                       dashboard and demo oracle
```
