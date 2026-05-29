#!/usr/bin/env python3
"""
CSP Screener — nightly pipeline
Stages: Universe → Price/Volume → Event Risk → Options Chain (yfinance) → Score & Rank
"""
import math
import os
import sys
import time
import logging
from datetime import date, timedelta, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO

import requests
import yfinance as yf
import pandas as pd
from scipy.stats import norm
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

RISK_FREE_RATE = 0.045  # approximate current risk-free rate for Black-Scholes

EXCLUDED_INDUSTRIES = {
    "Biotechnology",
    "Pharmaceuticals",
    "Drug Manufacturers—General",
    "Drug Manufacturers—Specialty & Generic",
    "Life Sciences Tools & Services",
}


# ─── STAGE 1: BUILD UNIVERSE ──────────────────────────────────────────────────

_WIKI_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CSPScreener/1.0; +https://github.com)"}


def _wiki_tables(url: str) -> list:
    resp = requests.get(url, headers=_WIKI_HEADERS, timeout=20)
    resp.raise_for_status()
    return pd.read_html(StringIO(resp.text))


def fetch_sp500() -> pd.DataFrame:
    try:
        df = _wiki_tables("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
        return df[["Symbol", "GICS Sub-Industry"]].rename(
            columns={"Symbol": "symbol", "GICS Sub-Industry": "industry"}
        )
    except Exception as e:
        log.error(f"Failed to fetch S&P 500 list: {e}")
        return pd.DataFrame(columns=["symbol", "industry"])


def fetch_nasdaq100() -> pd.DataFrame:
    try:
        tables = _wiki_tables("https://en.wikipedia.org/wiki/Nasdaq-100")
        for t in tables:
            for col in ("Ticker", "Symbol"):
                if col in t.columns:
                    return t[[col]].rename(columns={col: "symbol"})
    except Exception as e:
        log.error(f"Failed to fetch Nasdaq 100 list: {e}")
    return pd.DataFrame(columns=["symbol"])


def build_universe() -> list[str]:
    sp500 = fetch_sp500()
    ndx   = fetch_nasdaq100()
    merged = pd.concat([sp500, ndx[["symbol"]]], ignore_index=True)
    merged["symbol"] = merged["symbol"].str.replace(".", "-", regex=False)
    merged = merged.drop_duplicates("symbol")

    excluded = merged.get("industry", pd.Series(dtype=str)).isin(EXCLUDED_INDUSTRIES)
    merged = merged[~excluded.fillna(False)]

    tickers = merged["symbol"].dropna().tolist()
    log.info(f"Universe: {len(tickers)} tickers")
    return tickers


# ─── STAGE 2: PRICE / VOLUME FILTER ──────────────────────────────────────────

def filter_by_price_volume(tickers: list[str]) -> tuple[list[str], dict[str, float]]:
    log.info("Downloading 45-day OHLCV data via yfinance …")
    try:
        data = yf.download(
            tickers,
            period="45d",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        log.error(f"yf.download failed: {e}")
        return tickers, {}

    if data.empty:
        return [], {}

    close  = data["Close"]
    volume = data["Volume"]

    latest        = close.iloc[-1]
    avg_vol       = volume.tail(30).mean()
    price_30d_ago = close.iloc[-30] if len(close) >= 30 else close.iloc[0]
    ret_30d       = (latest - price_30d_ago) / price_30d_ago.replace(0, float("nan"))

    mask = (
        (latest  >= 15)  &
        (latest  <= 250) &
        (avg_vol >= 500_000) &
        (ret_30d >= -0.20)
    )
    survivors = latest[mask].dropna().index.tolist()
    prices    = latest[mask].dropna().to_dict()

    log.info(f"After price/volume filter: {len(survivors)} tickers")
    return survivors, {str(k): float(v) for k, v in prices.items()}


# ─── STAGE 3: EVENT RISK FILTER ──────────────────────────────────────────────

def _has_earnings_soon(symbol: str, days: int = 21) -> bool:
    try:
        cal = yf.Ticker(symbol).calendar
        if cal is None:
            return False
        cutoff = date.today() + timedelta(days=days)
        today  = date.today()
        if isinstance(cal, dict):
            for d in cal.get("Earnings Date", []):
                if today <= pd.Timestamp(d).date() <= cutoff:
                    return True
        elif isinstance(cal, pd.DataFrame) and "Earnings Date" in cal.index:
            val   = cal.loc["Earnings Date"]
            dates = val if isinstance(val, pd.Series) else [val]
            for d in dates:
                try:
                    if today <= pd.Timestamp(d).date() <= cutoff:
                        return True
                except Exception:
                    pass
        return False
    except Exception:
        return False


def _has_dividend_soon(symbol: str, days: int = 14) -> bool:
    try:
        ex_ts = yf.Ticker(symbol).info.get("exDividendDate")
        if not ex_ts:
            return False
        return date.today() <= datetime.fromtimestamp(ex_ts).date() <= date.today() + timedelta(days=days)
    except Exception:
        return False


def filter_event_risk(tickers: list[str]) -> list[str]:
    log.info(f"Event risk check for {len(tickers)} tickers (threaded) …")
    survivors = []

    def check(sym):
        if _has_earnings_soon(sym):
            return sym, "earnings"
        if _has_dividend_soon(sym):
            return sym, "dividend"
        return sym, None

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(check, s): s for s in tickers}
        done = 0
        for fut in as_completed(futures):
            done += 1
            if done % 30 == 0:
                log.info(f"  {done}/{len(tickers)} checked")
            sym, reason = fut.result()
            if reason is None:
                survivors.append(sym)
            else:
                log.debug(f"  Skip {sym}: {reason}")

    log.info(f"After event risk filter: {len(survivors)} tickers")
    return survivors


# ─── STAGE 4: OPTIONS CHAIN VIA YFINANCE ─────────────────────────────────────

def _bs_put_delta(S: float, K: float, T: float, sigma: float) -> float:
    """Black-Scholes delta for a European put. Returns value in [-1, 0]."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    try:
        d1 = (math.log(S / K) + (RISK_FREE_RATE + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
        return float(norm.cdf(d1) - 1.0)
    except Exception:
        return 0.0


def screen_options(tickers: list[str], prices: dict[str, float]) -> list[dict]:
    today     = date.today()
    date_from = today + timedelta(days=21)
    date_to   = today + timedelta(days=45)

    candidates: list[dict] = []

    for i, sym in enumerate(tickers):
        if i % 20 == 0:
            log.info(f"  Options screen: {i}/{len(tickers)} ({len(candidates)} candidates so far)")

        stock_price = prices.get(sym)
        if not stock_price:
            continue

        strike_min = stock_price * 0.78
        strike_max = stock_price * 0.97

        try:
            ticker      = yf.Ticker(sym)
            expirations = ticker.options  # tuple of date strings
            if not expirations:
                continue
        except Exception:
            continue

        for exp_str in expirations:
            try:
                exp_date = date.fromisoformat(exp_str)
            except ValueError:
                continue
            if not (date_from <= exp_date <= date_to):
                continue

            dte = (exp_date - today).days
            T   = dte / 365.0

            try:
                puts = ticker.option_chain(exp_str).puts
                time.sleep(0.05)
            except Exception:
                continue

            puts = puts[(puts["strike"] >= strike_min) & (puts["strike"] <= strike_max)]

            for _, row in puts.iterrows():
                strike = float(row["strike"])
                bid    = float(row.get("bid") or 0)
                ask    = float(row.get("ask") or 0)
                oi     = int(row.get("openInterest") or 0)
                iv     = float(row.get("impliedVolatility") or 0)

                if bid < 0.50:
                    continue
                if oi < 100:
                    continue
                mid = (bid + ask) / 2 if ask > 0 else bid
                if mid > 0 and (ask - bid) / mid > 0.10:
                    continue
                if iv < 0.20:
                    continue

                delta = _bs_put_delta(stock_price, strike, T, iv)
                if not (-0.20 <= delta <= -0.10):
                    continue

                cushion = (stock_price - strike) / stock_price * 100
                if cushion < 5:
                    continue

                premium_yield = (bid / strike) * 100
                if premium_yield < 1.0:
                    continue

                candidates.append({
                    "symbol":            sym,
                    "stock_price":       stock_price,
                    "strike":            strike,
                    "premium":           bid,
                    "delta":             delta,
                    "cushion_pct":       cushion,
                    "premium_yield_pct": premium_yield,
                    "dte":               dte,
                    "expiration":        exp_str,
                    "current_iv":        iv * 100,
                })

        time.sleep(0.1)

    log.info(f"Options candidates: {len(candidates)}")
    return candidates


# ─── STAGE 5: SCORE AND RANK ──────────────────────────────────────────────────

def _dte_score(dte: int) -> float:
    if 30 <= dte <= 45:
        return 1.0
    if 21 <= dte < 30:
        return 0.7
    return 0.4


def score_and_rank(candidates: list[dict]) -> list[dict]:
    for c in candidates:
        c["score"] = round(
            (c["premium_yield_pct"] * 0.30)
            + (c["cushion_pct"]     * 0.25)
            + (c["current_iv"] / 100 * 0.20)
            + ((1 - abs(c["delta"])) * 0.15)
            + (_dte_score(c["dte"]) * 0.10),
            4,
        )

    candidates.sort(key=lambda x: x["score"], reverse=True)

    # Keep highest-scoring contract per symbol
    seen, unique = set(), []
    for c in candidates:
        if c["symbol"] not in seen:
            seen.add(c["symbol"])
            unique.append(c)

    top = unique[:10]
    for i, c in enumerate(top):
        c["rank"] = i + 1
    return top


# ─── SUMMARIES ────────────────────────────────────────────────────────────────

def _summary(c: dict) -> str:
    iv_desc = "elevated" if c["current_iv"] > 50 else "moderate"
    return (
        f"{c['symbol']} ${c['strike']:.0f} put expiring {c['expiration']} — "
        f"{c['cushion_pct']:.1f}% OTM with {c['premium_yield_pct']:.1f}% monthly yield "
        f"in {iv_desc} IV environment."
    )


# ─── PERSIST TO SUPABASE ──────────────────────────────────────────────────────

def store_results(results: list[dict]) -> None:
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    run_date = date.today().isoformat()

    sb.table("csp_screener_results").delete().eq("run_date", run_date).execute()

    if not results:
        log.warning("No results to store — universe was thin today")
        return

    rows = [
        {
            "run_date":          run_date,
            "rank":              c["rank"],
            "symbol":            c["symbol"],
            "stock_price":       round(c["stock_price"], 2),
            "strike":            round(c["strike"], 2),
            "premium":           round(c["premium"], 2),
            "delta":             round(c["delta"], 4),
            "cushion_pct":       round(c["cushion_pct"], 2),
            "premium_yield_pct": round(c["premium_yield_pct"], 2),
            "dte":               c["dte"],
            "expiration":        c["expiration"],
            "current_iv":        round(c["current_iv"], 2),
            "score":             c["score"],
            "summary":           _summary(c),
        }
        for c in results
    ]
    sb.table("csp_screener_results").insert(rows).execute()
    log.info(f"Stored {len(rows)} results for {run_date}")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=== CSP Screener Pipeline Start ===")

    tickers = build_universe()
    if not tickers:
        log.error("Empty universe — aborting")
        sys.exit(1)

    tickers, prices = filter_by_price_volume(tickers)
    if not tickers:
        log.error("No tickers after price/volume filter — aborting")
        sys.exit(1)

    tickers = filter_event_risk(tickers)

    candidates = screen_options(tickers, prices)

    if not candidates:
        log.warning("No candidates survived options filter — thin market today")
        store_results([])
        return

    top = score_and_rank(candidates)

    log.info(f"Top {len(top)} picks:")
    for c in top:
        log.info(
            f"  #{c['rank']} {c['symbol']:6s} ${c['strike']:.0f} put  "
            f"yield {c['premium_yield_pct']:.1f}%  cushion {c['cushion_pct']:.1f}%  "
            f"score {c['score']:.4f}"
        )

    store_results(top)
    log.info("=== CSP Screener Pipeline Complete ===")


if __name__ == "__main__":
    main()
