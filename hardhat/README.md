# Contracts

This folder contains the `RitualPredict` contract, local Ritual mocks, tests, and the scripts I used for the workshop.

## Common commands

```bash
pnpm install
pnpm hardhat compile
pnpm hardhat test
pnpm exec tsc --noEmit
```

There are 11 lifecycle tests in `test/RitualPredict.ts`. The Scheduler, RitualWallet, TEE registry, HTTP precompile, and jq precompile are mocked at their real Ritual addresses.

## Testnet scripts

Store the deployer key once with:

```bash
pnpm hardhat keystore set DEPLOYER_PRIVATE_KEY
```

Then run scripts with the Ritual network selected:

```bash
pnpm hardhat run scripts/block-time.ts --network ritual
pnpm hardhat run scripts/deploy.ts --network ritual

PREDICT_ADDRESS=0x... pnpm hardhat run scripts/status.ts --network ritual
PREDICT_ADDRESS=0x... pnpm hardhat run scripts/fund.ts --network ritual
PREDICT_ADDRESS=0x... ORACLE_URL=https://... pnpm hardhat run scripts/create-demo-market.ts --network ritual
```

`scripts/export-abi.ts` copies the compiled ABI into `web/lib/predict-abi.ts`.
