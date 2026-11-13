import { Link } from "react-router-dom";
import { BarChart3, Database, FlaskConical } from "lucide-react";
import { api } from "../api/client";
import { EquityChart } from "../components/charts";
import { CountUp, MarketField, Marquee, Scramble, SceneRail } from "../components/effects/Cinematic";
import { SummaryCards } from "../components/backtest/ResultsView";
import { Button, EmptyState, ErrorState, Panel, SectionTag, Skeleton, StatCard, SyntheticBadge } from "../components/ui";
import { date, dateTime, integer, pct, toneClass } from "../lib/format";
import { useAsync } from "../lib/hooks";

export function OverviewPage() {
  const data = useAsync(async () => {
    const [instruments, runs, health] = await Promise.all([api.instruments(), api.runs({ page: 1, page_size: 5, sort: "created_at", order: "desc" }), api.health()]);
    const latest = runs.items[0] ? await api.run(runs.items[0].run_id) : null;
    return { instruments, runs, health, latest };
  }, []);

  if (data.loading) return <div className="space-y-4" aria-busy="true" aria-label="Loading overview"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-96" /></div>;
  if (data.error || !data.data) return <ErrorState message={data.error?.message ?? "Could not load the overview"} onRetry={data.reload} />;
  const { instruments, runs, health, latest } = data.data;
  const candles = instruments.reduce((s, i) => s + i.candle_count, 0);

  return (
    <div className="space-y-5">
      <section id="scene-hero" className="card relative overflow-hidden px-5 pb-16 pt-10 sm:px-10 sm:pb-20 sm:pt-14">
        <MarketField className="hero-field" />
        <div className="hero-parallax relative">
          <SectionTag n={1} name="overview" note="strategy lab" />
          <h1 className="hero-title text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="hero-word" style={{ animationDelay: "0.05s" }}><Scramble text="TEST THE" delay={300} /></span><br />
            <span className="hero-word text-gradient" style={{ animationDelay: "0.2s" }}><Scramble text="STRATEGY." delay={450} /></span><br />
            <span className="hero-word" style={{ animationDelay: "0.35s" }}><Scramble text="TRUST THE" delay={600} /></span> <span className="hero-word text-gradient" style={{ animationDelay: "0.5s" }}><Scramble text="DATA." delay={750} /></span>
          </h1>
          <p className="mt-5 max-w-xl text-sm text-muted sm:text-base">Test trading strategies on historical prices with realistic fees, slippage and next-bar execution.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span data-magnetic className="inline-block"><Link to="/backtest" data-cursor="Go"><Button icon={<BarChart3 className="h-4 w-4" />}>Start a backtest</Button></Link></span>
            <span data-magnetic className="inline-block"><Link to="/data"><Button variant="secondary" icon={<Database className="h-4 w-4" />}>Browse market data</Button></Link></span>
          </div>
          <dl className="num mt-8 flex flex-wrap gap-x-10 gap-y-3 border-t border-line pt-5">
            {[["markets", instruments.length], ["daily candles", candles], ["runs saved", runs.total]].map(([l, v]) => (
              <div key={l as string}><dd className="text-3xl font-black text-ink sm:text-4xl"><CountUp value={v as number} format={(n) => integer(Math.round(n))} /></dd><dt className="tag-mono">{l}</dt></div>
            ))}
          </dl>
        </div>
        <div className="scroll-cue tag-mono" aria-hidden><i />Scroll to continue</div>
      </section>
      <Marquee items={["Backtest", "Compare", "SMA crossover", "RSI", "MACD", "Buy & hold", "Next-bar execution", "Fees & slippage"]} />

      <div id="scene-metrics"><SectionTag n={2} name="metrics" note="what is stored" />
      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Instruments" value={integer(instruments.length)} sub={`${instruments.filter((i) => i.is_synthetic).length} synthetic`} />
        <StatCard label="Daily candles stored" value={integer(candles)} />
        <StatCard label="Saved backtests" value={integer(runs.total)} />
        <StatCard label="Engine" value={health.engine_version ? `v${health.engine_version}` : "–"} sub={health.status === "ok" ? "C++ · database connected" : "Degraded"} tone={health.status === "ok" ? "up" : "down"} />
      </div></div>

      <div id="scene-latest"><SectionTag n={3} name="latest run" note="most recent result" />{latest ? (
        <Panel title={`Latest saved backtest: ${latest.name || `${latest.strategy.name} on ${latest.instrument.symbol}`}`} action={<Link to={`/backtest/${latest.id}`} className="text-sm font-semibold text-primary hover:underline">Open full results</Link>}>
          <div className="space-y-4 p-4">
            <SummaryCards r={latest} />
            <div className="overflow-hidden rounded-xl border border-line"><EquityChart equity={latest.equity} currency={latest.instrument.currency} /></div>
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Run your first backtest"
            text={instruments.length ? "Pick an instrument and a strategy, run it, and save the result. It will show up here." : "Start by adding market data: load the demo data, fetch a ticker, or import a CSV."}
            action={<Link to={instruments.length ? "/backtest" : "/data"}><Button icon={instruments.length ? <BarChart3 className="h-4 w-4" /> : <Database className="h-4 w-4" />}>{instruments.length ? "New backtest" : "Add market data"}</Button></Link>} />
        </Panel>
      )}</div>

      <div id="scene-activity"><SectionTag n={4} name="activity" note="recent runs and data" /><div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Recent backtests" action={<Link to="/history" className="text-sm font-semibold text-primary hover:underline">All history</Link>}>
          {runs.items.length === 0 ? <EmptyState title="Nothing saved yet" text="Saved backtests are listed here." /> : (
            <ul className="divide-y divide-line/60">
              {runs.items.map((r) => (
                <li key={r.run_id}><Link to={`/backtest/${r.run_id}`} className="row-fx flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{r.run_name || r.strategy_name}</div><div className="num truncate text-xs text-muted">{r.symbol} · {dateTime(r.created_at)}</div></div>
                  <div className={`num text-sm font-bold ${toneClass(r.total_return_pct)}`}>{pct(r.total_return_pct, 2, true)}</div>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Market data" action={<Link to="/data" className="text-sm font-semibold text-primary hover:underline">Manage</Link>}>
          {instruments.length === 0 ? <EmptyState title="No instruments" text="Add data on the Market data page." /> : (
            <ul className="divide-y divide-line/60">
              {instruments.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold">{i.symbol}{i.is_synthetic && <SyntheticBadge />}</div><div className="num text-xs text-muted">{i.candle_count ? `${date(i.first_date)} → ${date(i.last_date)}` : "No candles yet"}</div></div>
                  <div className="num text-xs text-muted">{integer(i.candle_count)} candles</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div></div>

      <section id="scene-launch" className="card relative overflow-hidden px-5 py-14 text-center sm:py-20">
        <MarketField className="hero-field opacity-60" />
        <div className="relative">
          <div className="tag-mono mb-3">pbe@engine:~$ <span className="text-primary">new-backtest</span><i className="caret" /></div>
          <h2 className="text-3xl font-black leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">GOT A STRATEGY<br /><span className="text-gradient">WORTH TESTING?</span></h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted">Pick a market, pick a rule, and see how it would have played out.</p>
          <span data-magnetic className="mt-7 inline-block"><Link to="/backtest" data-cursor="Go"><Button icon={<BarChart3 className="h-4 w-4" />}>Launch backtest</Button></Link></span>
        </div>
      </section>

      <SceneRail scenes={[{ id: "scene-hero", label: "Start" }, { id: "scene-metrics", label: "Metrics" }, { id: "scene-latest", label: "Latest run" }, { id: "scene-activity", label: "Activity" }, { id: "scene-launch", label: "Launch" }]} />
    </div>
  );
}
