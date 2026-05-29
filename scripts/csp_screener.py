#!/usr/bin/env python3
"""
CSP Screener — nightly pipeline
Stages: Universe → Price/Volume → Event Risk → Options Chain (Polygon) → Score & Rank
"""
import os
import sys
import time
import logging
from datetime import date, timedelta, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import yfinance as yf
import pandas as pd
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

MASSIVE_API_KEY = os.environ["MASSIVE_API_KEY"]
MASSIVE_BASE    = "https://api.massive.com"
MASSIVE_HEADERS = {"Authorization": f"Bearer {MASSIVE_API_KEY}"}

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

EXCLUDED_INDUSTRIES = {
    "Biotechnology",
    "Pharmaceuticals",
    "Drug Manufacturers—General",
    "Drug Manufacturers—Specialty & Generic",
    "Life Sciences Tools & Services",
}


# ─── STAGE 1: BUILD UNIVERSE ──────────────────────────────────────────────────

def fetch_sp500() -> pd.DataFrame:
    try:
        df = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
        return df[["Symbol", "GICS Sub-Industry"]].rename(
            columns={"Symbol": "symbol", "GICS Sub-Industry": "industry"}
        )
    except Exception as e:
        log.error(f"Failed to fetch S&P 500 list: {e}")
        return pd.DataFrame(columns=["symbol", "industry"])


def fetch_nasdaq100() -> pd.DataFrame:
    try:
        tables = pd.read_html("https://en.wikipedia.org/wiki/Nasdaq-100")
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


# ─── STAGE 1b: PRICE / VOLUME FILTER ─────────────────────────────────────────

def filter_by_price_volume(tickers: list[str]) -> tuple[list[str], dict[str, float]]:
    """Returns (survivors, {symbol: latest_close}) for use in Stage 4."""
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

    latest  = close.iloc[-1]
    avg_vol = volume.tail(30).mean()
    price_30d_ago = close.iloc[-30] if len(close) >= 30 else close.iloc[0]
    ret_30d = (latest - price_30d_ago) / price_30d_ago.replace(0, float("nan"))

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


# ─── STAGE 4: OPTIONS CHAIN VIA MASSIVE ──────────────────────────────────────

def _massive_get(path: str, params: dict) -> dict | None:
    try:
        r = requests.get(
            f"{MASSIVE_BASE}{path}",
            headers=MASSIVE_HEADERS,
            params=params,
            timeout=15,
        )
        if r.status_code == 429:
            log.warning("Massive rate limit hit — sleeping 12s")
            time.sleep(12)
            r = requests.get(f"{MASSIVE_BASE}{path}", headers=MASSIVE_HEADERS, params=params, timeout=15)
        if r.status_code == 200:
            return r.json()
        log.debug(f"Massive {path} → {r.status_code}: {r.text[:120]}")
        return None
    except Exception as e:
        log.debug(f"Massive request error ({path}): {e}")
        return None


def _get_options_snapshot(
    symbol: str,
    date_from: str,
    date_to: str,
    strike_min: float,
    strike_max: float,
) -> list[dict]:
    """Fetches all put snapshots for `symbol` within the expiration window, paginating as needed."""
    params = {
        "contract_type":      "put",
        "expiration_date.gte": date_from,
        "expiration_date.lte": date_to,
        "strike_price.gte":   round(strike_min, 2),
        "strike_price.lte":   round(strike_max, 2),
        "limit":              250,
    }
    all_results: list[dict] = []
    url = f"/v3/snapshot/options/{symbol}"

    while True:
        data = _massive_get(url, params)
        if not data:
            break
        all_results.extend(data.get("results") or [])

        # Paginate via next_url cursor
        next_url = data.get("next_url")
        if not next_url:
            break
        # Extract cursor from next_url and re-use the same path
        cursor = next_url.split("cursor=")[-1].split("&")[0] if "cursor=" in next_url else None
        if not cursor:
            break
        params = {"cursor": cursor}

    return all_results


def screen_options(tickers: list[str], prices: dict[str, float]) -> list[dict]:
    today     = date.today()
    date_from = (today + timedelta(days=21)).isoformat()
    date_to   = (today + timedelta(days=45)).isoformat()

    candidates: list[dict] = []

    for i, sym in enumerate(tickers):
        if i % 20 == 0:
            log.info(f"  Options screen: {i}/{len(tickers)} ({len(candidates)} candidates so far)")

        stock_price = prices.get(sym)
        if not stock_price:
            continue

        # Pre-filter strikes to the delta -0.10…-0.20 neighbourhood (~5–20% OTM)
        strike_min = stock_price * 0.78
        strike_max = stock_price * 0.97

        try:
            opts = _get_options_snapshot(sym, date_from, date_to, strike_min, strike_max)
            time.sleep(0.1)  # gentle pacing

            for opt in opts:
                details = opt.get("details") or {}
                greeks  = opt.get("greeks")   or {}
                quote   = opt.get("last_quote") or {}
                underlying = opt.get("underlying_asset") or {}

                strike = details.get("strike_price")
                if not strike:
                    continue
                strike = float(strike)

                bid = float(quote.get("bid") or 0)
                ask = float(quote.get("ask") or 0)
                if bid < 0.50:
                    continue

                oi = int(opt.get("open_interest") or 0)
                if oi < 100:
                    continue

                mid = (bid + ask) / 2 if ask > 0 else bid
                if mid > 0 and (ask - bid) / mid > 0.10:
                    continue

                delta = greeks.get("delta")
                iv    = opt.get("implied_volatility")

                if delta is None or not (-0.20 <= float(delta) <= -0.10):
                    continue
                if not iv or float(iv) < 0.20:
                    continue

                delta = float(delta)
                iv    = float(iv)

                # Use Polygon's live underlying price if available, else fall back to yfinance price
                live_price = underlying.get("price")
                ref_price  = float(live_price) if live_price else stock_price

                cushion = (ref_price - strike) / ref_price * 100
                if cushion < 5:
                    continue

                premium_yield = (bid / strike) * 100
                if premium_yield < 1.0:
                    continue

                exp_str = details.get("expiration_date", "")
                dte     = (date.fromisoformat(exp_str) - today).days if exp_str else 0

                candidates.append({
                    "symbol":            sym,
                    "stock_price":       ref_price,
                    "strike":            strike,
                    "premium":           bid,
                    "delta":             delta,
                    "cushion_pct":       cushion,
                    "premium_yield_pct": premium_yield,
                    "dte":               dte,
                    "expiration":        exp_str,
                    "current_iv":        iv * 100,
                })

        except Exception as e:
            log.warning(f"Error screening {sym}: {e}")

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
