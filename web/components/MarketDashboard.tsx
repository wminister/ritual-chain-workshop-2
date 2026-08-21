"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { formatEther, parseEther, type Address } from "viem";

import { predictAbi } from "@/lib/predict-abi";
import {
  connectWallet,
  explorerAddress,
  predictAddress,
  publicClient,
} from "@/lib/ritual";

type Market = {
  id: bigint;
  creator: Address;
  question: string;
  oracleUrl: string;
  jsonPath: string;
  target: bigint;
  comparator: number;
  closeBlock: bigint;
  resolveBlock: bigint;
  scheduleId: bigint;
  totalYes: bigint;
  totalNo: bigint;
  state: number;
  outcome: number;
  attempts: number;
  observedValue: bigint;
  invalidReason: string;
};

const previewMarkets: Market[] = [
  {
    id: 1n,
    creator: "0x0000000000000000000000000000000000000000",
    question: "Will ETH/USD be at least $4,000 when this market resolves?",
    oracleUrl: "/api/oracle/eth",
    jsonPath: ".price",
    target: 4000n,
    comparator: 1,
    closeBlock: 1_842_220n,
    resolveBlock: 1_842_520n,
    scheduleId: 1n,
    totalYes: parseEther("7.5"),
    totalNo: parseEther("4.25"),
    state: 0,
    outcome: 0,
    attempts: 0,
    observedValue: 0n,
    invalidReason: "",
  },
];

const stateLabels = ["Open", "Closed", "Resolving", "Resolved", "Invalid"];
const comparatorLabels = [">", "≥", "<", "≤"];

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ritual(value: bigint) {
  return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    return String(error.shortMessage);
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

function MarketCard({
  market,
  currentBlock,
  account,
  busy,
  preview,
  onBet,
  onClaim,
}: {
  market: Market;
  currentBlock: bigint;
  account?: Address;
  busy: boolean;
  preview: boolean;
  onBet: (marketId: bigint, isYes: boolean, amount: string) => Promise<void>;
  onClaim: (market: Market) => Promise<void>;
}) {
  const [amount, setAmount] = useState("0.1");
  const total = market.totalYes + market.totalNo;
  const yesPercent = total === 0n ? 50 : Number((market.totalYes * 10_000n) / total) / 100;
  const canBet = market.state === 0 && currentBlock < market.closeBlock;
  const canClaim = market.state === 3 || market.state === 4;
  const deadline = market.state === 0 ? market.closeBlock : market.resolveBlock;
  const blocksLeft = deadline > currentBlock ? deadline - currentBlock : 0n;
  const outcome = market.outcome === 1 ? "YES" : market.outcome === 2 ? "NO" : undefined;

  return (
    <article className="market-card">
      <div className="market-card__head">
        <div className="market-title">
          <span className={`status status--${stateLabels[market.state]?.toLowerCase()}`}>
            {stateLabels[market.state] ?? "Unknown"}
          </span>
          <span className="market-id">Market #{market.id.toString()}</span>
        </div>
        <a
          className="icon-link"
          href={market.oracleUrl}
          target="_blank"
          rel="noreferrer"
          title="Open oracle endpoint"
          aria-label="Open oracle endpoint"
        >
          <ExternalLink size={16} />
        </a>
      </div>

      <h2>{market.question}</h2>

      <div className="rule-row">
        <span>Observed value</span>
        <strong>
          {comparatorLabels[market.comparator]} {market.target.toString()}
        </strong>
        <code>{market.jsonPath}</code>
      </div>

      <div className="pool-bar" aria-label={`YES ${yesPercent.toFixed(1)} percent`}>
        <span style={{ width: `${yesPercent}%` }} />
      </div>
      <div className="pool-labels">
        <span className="yes-text">YES {yesPercent.toFixed(1)}%</span>
        <span>{ritual(total)} RITUAL pool</span>
        <span className="no-text">NO {(100 - yesPercent).toFixed(1)}%</span>
      </div>

      <dl className="market-meta">
        <div>
          <dt><Clock3 size={15} /> {market.state === 0 ? "Betting closes" : "Resolution"}</dt>
          <dd>Block {deadline.toLocaleString()} · {blocksLeft.toLocaleString()} left</dd>
        </div>
        <div>
          <dt><RefreshCw size={15} /> Attempts</dt>
          <dd>{market.attempts}/3 · Schedule #{market.scheduleId.toString()}</dd>
        </div>
      </dl>

      {outcome && (
        <div className="result-line">
          <CheckCircle2 size={18} />
          <span>{outcome} won at an observed value of {market.observedValue.toString()}</span>
        </div>
      )}
      {market.invalidReason && (
        <div className="result-line result-line--invalid">
          <XCircle size={18} />
          <span>{market.invalidReason}</span>
        </div>
      )}

      <div className="market-actions">
        {canBet ? (
          <>
            <label className="amount-field">
              <span>Stake</span>
              <div><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Stake amount" /><em>RITUAL</em></div>
            </label>
            <div className="bet-buttons">
              <button disabled={busy || preview || !account} onClick={() => onBet(market.id, true, amount)} title={preview ? "Configure a contract address to transact" : undefined}>
                <ArrowUpRight size={17} /> Bet YES
              </button>
              <button className="button--no" disabled={busy || preview || !account} onClick={() => onBet(market.id, false, amount)} title={preview ? "Configure a contract address to transact" : undefined}>
                <ArrowDownRight size={17} /> Bet NO
              </button>
            </div>
          </>
        ) : canClaim ? (
          <button className="button--claim" disabled={busy || preview || !account} onClick={() => onClaim(market)}>
            {market.state === 4 ? <RotateCcw size={17} /> : <CircleDollarSign size={17} />}
            {market.state === 4 ? "Claim refund" : "Claim winnings"}
          </button>
        ) : (
          <div className="waiting"><RefreshCw size={17} /> Waiting for scheduled resolution</div>
        )}
      </div>
    </article>
  );
}

export function MarketDashboard() {
  const [markets, setMarkets] = useState<Market[]>(predictAddress ? [] : previewMarkets);
  const [currentBlock, setCurrentBlock] = useState(1_842_100n);
  const [executionBalance, setExecutionBalance] = useState(0n);
  const [account, setAccount] = useState<Address>();
  const [tab, setTab] = useState<"markets" | "create">("markets");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(predictAddress));
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState(predictAddress ? "" : "Preview mode · add NEXT_PUBLIC_PREDICT_ADDRESS to enable transactions");

  const refresh = useCallback(async () => {
    if (!predictAddress) return;
    try {
      const [nextMarkets, block, balance] = await Promise.all([
        publicClient.readContract({ address: predictAddress, abi: predictAbi, functionName: "getMarkets" }),
        publicClient.getBlockNumber(),
        publicClient.readContract({ address: predictAddress, abi: predictAbi, functionName: "executionBalance" }),
      ]);
      setMarkets(nextMarkets as Market[]);
      setCurrentBlock(block);
      setExecutionBalance(balance);
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function connect() {
    try {
      const connected = await connectWallet();
      setAccount(connected.account);
      setNotice("Wallet connected");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not connect wallet");
    }
  }

  async function transact(
    functionName: "bet" | "claimWinnings" | "claimRefund" | "createMarket",
    args: readonly unknown[],
    value?: bigint,
  ) {
    if (!predictAddress) return;
    setBusy(true);
    try {
      const connected = await connectWallet();
      setAccount(connected.account);
      const hash = await connected.wallet.writeContract({
        address: predictAddress,
        abi: predictAbi,
        functionName,
        args,
        account: connected.account,
        value,
      } as never);
      setNotice("Transaction submitted");
      await publicClient.waitForTransactionReceipt({ hash });
      setNotice("Transaction confirmed");
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const market = {
      question: String(data.get("question")),
      oracleUrl: String(data.get("oracleUrl")),
      jsonPath: String(data.get("jsonPath")),
      target: BigInt(String(data.get("target"))),
      comparator: Number(data.get("comparator")),
      bettingSeconds: BigInt(String(data.get("bettingSeconds"))),
      resolveDelaySeconds: BigInt(String(data.get("resolveDelaySeconds"))),
    };
    await transact("createMarket", [market]);
    setTab("markets");
  }

  const totalPool = useMemo(
    () => markets.reduce((sum, market) => sum + market.totalYes + market.totalNo, 0n),
    [markets],
  );

  const walletButton = (
    <button className="wallet-button" onClick={connect}>
      <Wallet size={17} /> {account ? shortAddress(account) : "Connect wallet"}
    </button>
  );

  return (
    <main>
      {mounted && document.getElementById("wallet-slot")
        ? createPortal(walletButton, document.getElementById("wallet-slot")!)
        : null}

      <div className="summary-band">
        <div className="summary-band__inner">
          <div><span>Current block</span><strong>{currentBlock.toLocaleString()}</strong></div>
          <div><span>Markets</span><strong>{markets.length}</strong></div>
          <div><span>Total pool</span><strong>{ritual(totalPool)} RITUAL</strong></div>
          <div><span>Execution balance</span><strong>{ritual(executionBalance)} RITUAL</strong></div>
          <div className="summary-actions">
            {predictAddress && <a href={explorerAddress(predictAddress)} target="_blank" rel="noreferrer" title="View contract" aria-label="View contract"><ExternalLink size={17} /></a>}
            <button onClick={() => void refresh()} title="Refresh markets" aria-label="Refresh markets"><RefreshCw size={17} /></button>
          </div>
        </div>
      </div>

      <div className="workspace">
        <div className="workspace-head">
          <div className="tabs" role="tablist" aria-label="Dashboard views">
            <button className={tab === "markets" ? "is-active" : ""} onClick={() => setTab("markets")} role="tab" aria-selected={tab === "markets"}>Markets</button>
            <button className={tab === "create" ? "is-active" : ""} onClick={() => setTab("create")} role="tab" aria-selected={tab === "create"}><Plus size={16} /> Create</button>
          </div>
          {notice && <div className="notice" role="status">{notice}</div>}
        </div>

        {tab === "markets" ? (
          <section aria-label="Prediction markets">
            {loading ? (
              <div className="skeleton-list"><div /><div /></div>
            ) : markets.length === 0 ? (
              <div className="empty-state"><CircleDollarSign size={28} /><h1>No markets yet</h1><button onClick={() => setTab("create")}><Plus size={16} /> Create the first market</button></div>
            ) : (
              <div className="market-list">
                {markets.map((market) => (
                  <MarketCard
                    key={market.id.toString()}
                    market={market}
                    currentBlock={currentBlock}
                    account={account}
                    busy={busy}
                    preview={!predictAddress}
                    onBet={(id, isYes, amount) => transact("bet", [id, isYes], parseEther(amount))}
                    onClaim={(selected) => transact(selected.state === 4 ? "claimRefund" : "claimWinnings", [selected.id])}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="create-panel" aria-labelledby="create-title">
            <div className="create-panel__heading"><h1 id="create-title">Create market</h1><span>All resolution settings are permanent</span></div>
            <form onSubmit={submitMarket}>
              <label className="field field--wide"><span>Question</span><input name="question" required defaultValue="Will ETH/USD be at least $4,000 when this market resolves?" /></label>
              <label className="field field--wide"><span>Oracle URL</span><input name="oracleUrl" type="url" required defaultValue={process.env.NEXT_PUBLIC_DEMO_ORACLE_URL ?? "http://localhost:3000/api/oracle/eth"} /></label>
              <label className="field"><span>JSON path</span><input name="jsonPath" required defaultValue=".price" /></label>
              <label className="field"><span>Target</span><input name="target" type="number" min="0" required defaultValue="4000" /></label>
              <label className="field"><span>Comparator</span><select name="comparator" defaultValue="1"><option value="0">Greater than</option><option value="1">Greater than or equal</option><option value="2">Less than</option><option value="3">Less than or equal</option></select></label>
              <label className="field"><span>Betting duration</span><div className="unit-input"><input name="bettingSeconds" type="number" min="30" required defaultValue="180" /><em>seconds</em></div></label>
              <label className="field"><span>Resolve delay</span><div className="unit-input"><input name="resolveDelaySeconds" type="number" min="15" required defaultValue="60" /><em>seconds</em></div></label>
              <div className="form-actions"><button type="button" className="button--secondary" onClick={() => setTab("markets")}>Cancel</button><button type="submit" disabled={busy || !predictAddress}><Plus size={17} /> Create market</button></div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
