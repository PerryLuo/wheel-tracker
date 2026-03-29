// ============================================================
// WHEEL STRATEGY TRACKER — Apps Script Backend (Code.gs)
// ============================================================

const SHEET_NAME = 'Transactions';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Wheel Strategy Tracker')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Sheet Initialization ────────────────────────────────────

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  const headers = ['id','date','action','symbol','underlying','expiry','strike','optionType','quantity','price','fees','amount','raw'];
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.hideSheet();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    // Ensure header row exists — if the first cell isn't 'id', insert one
    var firstCell = sheet.getRange(1, 1).getValue();
    if (String(firstCell) !== 'id') {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// ─── Import JSON ─────────────────────────────────────────────

function importTransactions(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    const transactions = data.BrokerageTransactions || data;
    const sheet = getOrCreateSheet();

    const existing = getExistingIds(sheet);
    let added = 0;

    transactions.forEach(function(tx) {
      const parsed = parseTx(tx);
      if (!parsed) return;
      if (existing.has(parsed.id)) return;

      sheet.appendRow([
        parsed.id,
        parsed.date,
        parsed.action,
        parsed.symbol,
        parsed.underlying,
        parsed.expiry,
        parsed.strike,
        parsed.optionType,
        parsed.quantity,
        parsed.price,
        parsed.fees,
        parsed.amount,
        JSON.stringify(tx)
      ]);
      added++;
    });

    return { success: true, added: added, total: transactions.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getExistingIds(sheet) {
  const data = sheet.getDataRange().getValues();
  const ids = new Set();
  for (var i = 1; i < data.length; i++) {
    ids.add(String(data[i][0]));
  }
  return ids;
}

// ─── Parse a single broker transaction ───────────────────────

function parseTx(tx) {
  if (!tx.Action || !tx.Symbol) return null;

  const rawDate = tx.Date || '';
  const dateMatch = rawDate.match(/(\d{2}\/\d{2}\/\d{4})/);
  const dateStr = dateMatch ? dateMatch[1] : rawDate;
  const date = parseDate(dateStr);

  const symMatch = tx.Symbol.match(/^(\w+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+)\s+([CP])$/);
  var underlying = tx.Symbol;
  var expiry = '';
  var strike = 0;
  var optionType = '';

  if (symMatch) {
    underlying = symMatch[1];
    expiry = symMatch[2];
    strike = parseFloat(symMatch[3]);
    optionType = symMatch[4] === 'P' ? 'PUT' : 'CALL';
  }

  const price    = parseMoney(tx.Price);
  const fees     = parseMoney(tx['Fees & Comm']);
  const amount   = parseMoney(tx.Amount);
  const quantity = parseInt(tx.Quantity) || 0;
  const id       = (dateStr + '_' + tx.Action + '_' + tx.Symbol + '_' + quantity).replace(/\s+/g, '_');

  return {
    id: id, date: date, action: tx.Action, symbol: tx.Symbol,
    underlying: underlying, expiry: expiry, strike: strike,
    optionType: optionType, quantity: quantity, price: price,
    fees: fees, amount: amount
  };
}

function parseDate(str) {
  if (!str) return 0;
  const parts = str.split('/');
  if (parts.length !== 3) return 0;
  // Use UTC to avoid timezone shifts between server and client
  return Date.UTC(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

function parseMoney(str) {
  if (!str || str === '') return 0;
  return parseFloat(str.replace(/[$,]/g, '')) || 0;
}

// ─── Load all transactions ─────────────────────────────────────

function getAllTransactions() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const txs = [];
  for (var i = 1; i < data.length; i++) {
    const row = data[i];
    txs.push({
      id:         String(row[0]  || ''),
      date:       row[1] ? Number(row[1]) : 0,
      action:     String(row[2]  || ''),
      symbol:     String(row[3]  || ''),
      underlying: String(row[4]  || ''),
      expiry:     String(row[5]  || ''),
      strike:     row[6] ? Number(row[6]) : 0,
      optionType: String(row[7]  || ''),
      quantity:   row[8] ? Number(row[8]) : 0,
      price:      row[9] ? Number(row[9]) : 0,
      fees:       row[10] ? Number(row[10]) : 0,
      amount:     row[11] ? Number(row[11]) : 0
    });
  }
  return txs;
}

// ─── Delete a transaction ─────────────────────────────────────

function deleteTransaction(id) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

// ─── Add manual transaction ───────────────────────────────────

function addManualTransaction(tx) {
  try {
    const parsed = parseTx(tx);
    if (!parsed) return { success: false, error: 'Could not parse transaction' };
    const sheet = getOrCreateSheet();
    const existing = getExistingIds(sheet);
    if (existing.has(parsed.id)) {
      parsed.id = parsed.id + '_' + Date.now();
    }
    sheet.appendRow([
      parsed.id, parsed.date, parsed.action, parsed.symbol,
      parsed.underlying, parsed.expiry, parsed.strike, parsed.optionType,
      parsed.quantity, parsed.price, parsed.fees, parsed.amount,
      JSON.stringify(tx)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Main data loader (single RPC call) ───────────────────────

function getAppData() {
  try {
    var txs = getAllTransactions();

    if (!txs || !txs.length) {
      return { txs: [], chains: [], weekly: [], monthly: [], ytd: 0, totalPnl: 0 };
    }

    txs.sort(function(a, b) { return a.date - b.date; });

    // Stock Buy/Sell on assignment are NOT option P&L — exclude from totals.
    // They're identified by action === 'buy' or 'sell' with no optionType.
    function isStockTx(t) {
      var a = String(t.action || '').toLowerCase().trim();
      return (a === 'buy' || a === 'sell') && !t.optionType;
    }
    var optionTxs = txs.filter(function(t) { return !isStockTx(t); });

    // Group by underlying for chain building
    var stockMap = {};
    txs.forEach(function(tx) {
      var u = tx.underlying || 'UNKNOWN';
      if (!stockMap[u]) stockMap[u] = [];
      stockMap[u].push(tx);
    });

    // Build chains per ticker, attach cost basis + wheel summary to each
    var allChains = [];
    Object.keys(stockMap).forEach(function(ticker) {
      buildChains(stockMap[ticker]).forEach(function(ch) {
        ch.costBasis = computeChainCostBasis(ch);
        ch.wheelSummary = computeWheelSummary(ch);
        // For completed wheels, include equity P&L in the chain's netPnl
        if (ch.wheelSummary) {
          ch.netPnl += ch.wheelSummary.equityGainLoss;
        }
        allChains.push(ch);
      });
    });

    // Sort: OPEN/ASSIGNED first, then COMPLETED, then EXPIRED/CLOSED — by openDate desc
    allChains.sort(function(a, b) {
      var aOpen = a.status === 'OPEN' || a.status === 'ASSIGNED' ? 0 : 1;
      var bOpen = b.status === 'OPEN' || b.status === 'ASSIGNED' ? 0 : 1;
      return aOpen - bOpen || b.openDate - a.openDate;
    });

    var now       = new Date();
    var yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
    var ytdTxs    = optionTxs.filter(function(t) { return t.date >= yearStart; });
    var ytd       = ytdTxs.reduce(function(s, t) { return s + (t.amount || 0); }, 0);
    var totalPnl  = optionTxs.reduce(function(s, t) { return s + (t.amount || 0); }, 0);

    // Committed capital: sum of strike × qty × 100 for all STO PUTs
    function sumCommitted(txList) {
      return txList.reduce(function(s, t) {
        var a = String(t.action || '').toLowerCase();
        if (a.indexOf('sell to open') !== -1 && String(t.optionType || '') === 'PUT') {
          return s + (Number(t.strike) || 0) * (Number(t.quantity) || 1) * 100;
        }
        return s;
      }, 0);
    }
    var ytdCommitted   = sumCommitted(ytdTxs);
    var totalCommitted = sumCommitted(optionTxs);

    return {
      txs:            txs,
      chains:         allChains,
      weekly:         computePeriodPnl(optionTxs, 'week'),
      monthly:        computePeriodPnl(optionTxs, 'month'),
      ytd:            Number(ytd),
      ytdCommitted:   Number(ytdCommitted),
      totalPnl:       Number(totalPnl),
      totalCommitted: Number(totalCommitted)
    };

  } catch(e) {
    Logger.log('getAppData error: ' + e.message + ' | stack: ' + e.stack);
    return { txs: [], chains: [], weekly: [], monthly: [], ytd: 0, ytdCommitted: 0, totalPnl: 0, totalCommitted: 0 };
  }
}

// ─── Per-chain cost basis (applied after assignment) ──────────
// Formula: (Assignment Cost − Put Premiums Received + Put Premiums Paid
//           − Call Premiums Received + Call Premiums Paid) ÷ Shares

function computeChainCostBasis(chain) {
  var hasAssignment = chain.legs.some(function(l) { return l.chainType === 'assigned'; });
  if (!hasAssignment) return null;

  var assignmentCost = 0, shares = 0;
  var putIn = 0, putOut = 0, callIn = 0, callOut = 0;

  chain.legs.forEach(function(leg) {
    var lt = leg.chainType;
    if (lt === 'assigned') {
      assignmentCost += (leg.strike || 0) * (leg.quantity || 0) * 100;
      shares += (leg.quantity || 0) * 100;
    } else if (lt === 'open' || lt === 'roll_open') {
      putIn  += Math.abs(leg.amount || 0);
    } else if (lt === 'roll_close') {
      putOut += Math.abs(leg.amount || 0);
    } else if (lt === 'call_open') {
      callIn  += Math.abs(leg.amount || 0);
    } else if (lt === 'call_close') {
      callOut += Math.abs(leg.amount || 0);
    }
  });

  if (!shares) return null;
  return (assignmentCost - putIn + putOut - callIn + callOut) / shares;
}

// ─── Wheel Summary (for completed chains) ────────────────────
// Returns premium vs equity breakdown for chains that completed
// the full wheel: CSP → assigned → CC → called away

function computeWheelSummary(chain) {
  if (chain.status !== 'COMPLETED') return null;

  var putPremium = 0, callPremium = 0;
  var putStrike = 0, callStrike = 0, shares = 0;

  chain.legs.forEach(function(leg) {
    var lt = leg.chainType;
    if (lt === 'open' || lt === 'roll_open') {
      putPremium += Math.abs(leg.amount || 0);
    } else if (lt === 'roll_close') {
      putPremium -= Math.abs(leg.amount || 0);
    } else if (lt === 'assigned') {
      putStrike = leg.strike || 0;
      shares    = (leg.quantity || 0) * 100;
    } else if (lt === 'call_open') {
      callPremium += Math.abs(leg.amount || 0);
    } else if (lt === 'call_close') {
      callPremium -= Math.abs(leg.amount || 0);
    } else if (lt === 'call_expired') {
      // premium already counted on call_open — no change
    } else if (lt === 'call_assigned') {
      callStrike = leg.strike || 0;
    }
  });

  if (!shares || !callStrike) return null;

  var totalPremium   = putPremium + callPremium;
  var equityGainLoss = (callStrike - putStrike) * shares;
  var totalReturn    = totalPremium + equityGainLoss;
  var capitalDeployed = putStrike * shares;
  var roiPct = capitalDeployed > 0 ? (totalReturn / capitalDeployed) * 100 : 0;

  return {
    putPremium:      putPremium,
    callPremium:     callPremium,
    totalPremium:    totalPremium,
    equityGainLoss:  equityGainLoss,
    totalReturn:     totalReturn,
    capitalDeployed: capitalDeployed,
    roiPct:          roiPct,
    putStrike:       putStrike,
    callStrike:      callStrike,
    shares:          shares
  };
}

// ─── Period P&L rollup ────────────────────────────────────────

function computePeriodPnl(txs, period) {
  const buckets = {};
  txs.forEach(function(tx) {
    if (!tx.date) return;
    const d = new Date(Number(tx.date));
    var key;
    if (period === 'week') {
      key = formatDate(getWeekStart(d));
    } else {
      key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }
    if (!buckets[key]) buckets[key] = { pnl: 0, committed: 0 };
    buckets[key].pnl += (Number(tx.amount) || 0);

    // Track committed capital: STO PUT = strike × contracts × 100
    var action = String(tx.action || '').toLowerCase();
    if (action.indexOf('sell to open') !== -1 && String(tx.optionType || '') === 'PUT') {
      buckets[key].committed += (Number(tx.strike) || 0) * (Number(tx.quantity) || 1) * 100;
    }
  });

  return Object.keys(buckets).sort().map(function(k) {
    var b = buckets[k];
    return {
      period: String(k),
      pnl: Number(b.pnl),
      committed: Number(b.committed)
    };
  });
}

function getWeekStart(date) {
  const d   = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0');
}

// ─── Version check ────────────────────────────────────────────

function getVersion() {
  return 'v5-simplified-' + new Date().toISOString();
}

// ─── Chain Detection ──────────────────────────────────────────
// Groups transactions for ONE underlying (sorted by date asc) into position chains.
// Chains are matched by PUT expiry (not contract count) so multiple concurrent
// positions with the same size are never confused.
// Covered calls on multiple assigned chains are split proportionally by contract count.

function buildChains(txs) {
  var chains    = [];
  var openChains   = {};   // chainId → chain
  var putExpiryMap = {};   // expiry  → chainId   (open PUT positions)
  var callExpiryMap = {};  // expiry  → [chainId] (open CC positions)
  var chainCounter = 0;
  var ONE_DAY = 86400000;  // dates are parsed at midnight, so same-day diff = 0

  // Within the same calendar date, process: Assigned/Expired before BTC before STO.
  // This ensures an assignment is recorded before any same-day CC sell.
  var sorted = txs.slice().sort(function(a, b) {
    if (a.date !== b.date) return a.date - b.date;
    var pri = { 'assigned': 0, 'expired': 0, 'buy to close': 1, 'sell to open': 2 };
    var pa = 3, pb = 3;
    var al = String(a.action || '').toLowerCase();
    var bl = String(b.action || '').toLowerCase();
    Object.keys(pri).forEach(function(k) {
      if (al.indexOf(k) !== -1) pa = Math.min(pa, pri[k]);
      if (bl.indexOf(k) !== -1) pb = Math.min(pb, pri[k]);
    });
    return pa - pb;
  });

  function getAssignedChains() {
    return Object.keys(openChains).map(function(id) {
      return openChains[id];
    }).filter(function(c) { return c.status === 'ASSIGNED'; });
  }

  function cloneLegTx(tx, overrides) {
    var out = {};
    Object.keys(tx).forEach(function(k) { out[k] = tx[k]; });
    Object.keys(overrides).forEach(function(k) { out[k] = overrides[k]; });
    return out;
  }

  for (var i = 0; i < sorted.length; i++) {
    var tx         = sorted[i];
    var action     = String(tx.action     || '').toLowerCase();
    var optionType = String(tx.optionType || '');
    var expiry     = String(tx.expiry     || '');
    var amt        = Number(tx.amount     || 0);
    var contracts  = Number(tx.quantity   || 1);

    // ── SELL TO OPEN (PUT) ───────────────────────────────────
    if (action.indexOf('sell to open') !== -1 && optionType === 'PUT') {
      // Roll detection: a chain that BTC'd recently and awaits a new open
      var rollId = null;
      Object.keys(openChains).forEach(function(cid) {
        var c = openChains[cid];
        if (c._awaitingRollOpen && c.contracts === contracts &&
            (tx.date - c._lastCloseDate) < ONE_DAY) {
          rollId = cid;
        }
      });

      if (rollId) {
        var ch = openChains[rollId];
        ch._awaitingRollOpen = false;
        ch.currentStrike = Number(tx.strike) || 0;
        ch.currentExpiry = expiry;
        ch.netPnl        += amt;
        ch.pendingPremium += Math.abs(amt);
        ch.legs.push(makePlainTx(tx, 'roll_open', amt));
        var nc = (Number(tx.strike) || 0) * contracts * 100;
        if (nc > ch.committedCapital) ch.committedCapital = nc;
        putExpiryMap[expiry] = rollId;
      } else {
        chainCounter++;
        var cid = (tx.underlying || 'X') + '_' + chainCounter;
        openChains[cid] = {
          chainId:          cid,
          ticker:           String(tx.underlying || ''),
          contracts:        contracts,
          status:           'OPEN',
          openDate:         Number(tx.date)   || 0,
          closeDate:        null,
          days:             0,
          committedCapital: (Number(tx.strike) || 0) * contracts * 100,
          netPnl:           amt,
          roiPct:           0,
          annualizedRoiPct: 0,
          currentStrike:    Number(tx.strike) || 0,
          currentExpiry:    expiry,
          pendingPremium:   Math.abs(amt),
          legs:             [makePlainTx(tx, 'open', amt)],
          _awaitingRollOpen: false,
          _lastCloseDate:    null
        };
        putExpiryMap[expiry] = cid;
      }
    }

    // ── BUY TO CLOSE (PUT) ───────────────────────────────────
    else if (action.indexOf('buy to close') !== -1 && optionType === 'PUT') {
      var cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      var ch = openChains[cid];
      ch.netPnl += amt;
      ch.legs.push(makePlainTx(tx, 'roll_close', amt));
      ch._awaitingRollOpen = true;
      ch._lastCloseDate    = Number(tx.date) || 0;
      delete putExpiryMap[expiry];
    }

    // ── EXPIRED (PUT) ────────────────────────────────────────
    else if (action.indexOf('expired') !== -1 && optionType === 'PUT') {
      var cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      var ch = openChains[cid];
      ch.legs.push(makePlainTx(tx, 'expired', 0));
      ch.status        = 'EXPIRED';
      ch.closeDate     = Number(tx.date) || 0;
      ch.pendingPremium = 0;
      ch.currentStrike  = 0;
      ch.currentExpiry  = '';
      ch.days = Math.max(1, Math.round((ch.closeDate - ch.openDate) / 86400000));
      chains.push(ch);
      delete putExpiryMap[expiry];
      delete openChains[cid];
    }

    // ── ASSIGNED (PUT) — shares acquired ─────────────────────
    else if (action.indexOf('assigned') !== -1 && optionType === 'PUT') {
      var cid = putExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      var ch = openChains[cid];
      ch.legs.push(makePlainTx(tx, 'assigned', amt));
      ch.status         = 'ASSIGNED';
      ch.pendingPremium = 0;
      delete putExpiryMap[expiry];
      // chain stays in openChains for CC tracking
    }

    // ── ASSIGNED (CALL) — shares called away, wheel complete ─
    else if (action.indexOf('assigned') !== -1 && optionType === 'CALL') {
      var cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      var ch = openChains[cid];
      ch.legs.push(makePlainTx(tx, 'call_assigned', amt));
      ch.status         = 'COMPLETED';
      ch.closeDate      = Number(tx.date) || 0;
      ch.pendingPremium = 0;
      ch.currentStrike  = 0;
      ch.currentExpiry  = '';
      ch.days = Math.max(1, Math.round((ch.closeDate - ch.openDate) / 86400000));
      chains.push(ch);
      delete callExpiryMap[expiry];
      delete openChains[cid];
    }

    // ── SELL TO OPEN (CALL) — covered call ──────────────────
    // Attribution rule:
    //   - 1 assigned chain  → give it all (straightforward)
    //   - Multiple assigned chains → give to the most recently assigned chain.
    //     Rationale: a CC sold after the latest assignment covers the combined
    //     position; attributing it to the newest chain matches trader intuition
    //     and keeps per-chain cost basis clean. The combined CB across all chains
    //     is always correct regardless of which chain holds the CC.
    else if (action.indexOf('sell to open') !== -1 && optionType === 'CALL') {
      var assigned = getAssignedChains();
      if (!assigned.length) continue;
      // Pick the chain assigned most recently
      var owner = assigned.reduce(function(latest, c) {
        return (c.openDate > latest.openDate) ? c : latest;
      });
      owner.netPnl        += amt;
      owner.pendingPremium += Math.abs(amt);
      owner.legs.push(makePlainTx(tx, 'call_open', amt));
      owner.currentStrike = Number(tx.strike) || 0;
      owner.currentExpiry = expiry;
      callExpiryMap[expiry] = owner.chainId;  // single chainId, not array
    }

    // ── BUY TO CLOSE (CALL) ──────────────────────────────────
    else if (action.indexOf('buy to close') !== -1 && optionType === 'CALL') {
      var cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      var ch = openChains[cid];
      ch.netPnl += amt;
      ch.legs.push(makePlainTx(tx, 'call_close', amt));
    }

    // ── EXPIRED (CALL) ────────────────────────────────────────
    else if (action.indexOf('expired') !== -1 && optionType === 'CALL') {
      var cid = callExpiryMap[expiry];
      if (!cid || !openChains[cid]) continue;
      openChains[cid].legs.push(makePlainTx(tx, 'call_expired', 0));
      openChains[cid].currentExpiry = '';
      openChains[cid].currentStrike = 0;
      delete callExpiryMap[expiry];
    }
    // Note: plain 'Buy'/'Sell' stock transactions (on assignment) are intentionally
    // ignored here — assignment cost is derived from the PUT strike × contracts.
  }

  // ── Finalize remaining open/assigned chains ───────────────
  var today = Date.now();
  Object.keys(openChains).forEach(function(cid) {
    var ch = openChains[cid];
    if (ch._awaitingRollOpen) {
      ch.status    = 'CLOSED';
      ch.closeDate = ch._lastCloseDate;
    }
    ch.days = Math.max(1, Math.round(((ch.closeDate || today) - ch.openDate) / 86400000));
    chains.push(ch);
  });

  // ── Compute ROI and strip internal fields ─────────────────
  for (var c = 0; c < chains.length; c++) {
    var ch = chains[c];
    if (!ch.days || ch.days < 1) ch.days = 1;
    if (ch.committedCapital > 0) {
      ch.roiPct = (ch.netPnl / ch.committedCapital) * 100;
      ch.annualizedRoiPct = ch.roiPct * (365 / ch.days);
    }
    delete ch._awaitingRollOpen;
    delete ch._lastCloseDate;
  }

  return chains;
}

// ─── Leg builder ──────────────────────────────────────────────

function makePlainTx(tx, chainType, pnl) {
  return {
    id:         String(tx.id         || ''),
    date:       Number(tx.date       || 0),
    action:     String(tx.action     || ''),
    symbol:     String(tx.symbol     || ''),
    underlying: String(tx.underlying || ''),
    expiry:     String(tx.expiry     || ''),
    strike:     Number(tx.strike     || 0),
    optionType: String(tx.optionType || ''),
    quantity:   Number(tx.quantity   || 0),
    price:      Number(tx.price      || 0),
    fees:       Number(tx.fees       || 0),
    amount:     Number(tx.amount     || 0),
    chainType:  String(chainType),
    pnl:        Number(pnl)
  };
}

// ─── Test functions (run in Apps Script editor) ───────────────

function testSetup() {
  const sheet = getOrCreateSheet();
  Logger.log('Sheet: ' + sheet.getName() + ', rows: ' + sheet.getLastRow());
}

function testImportSample() {
  const result = importTransactions(JSON.stringify([{
    Date: '01/15/2026', Action: 'Sell to Open',
    Symbol: 'TNA 01/17/2026 53.00 P', Quantity: '2',
    Price: '$1.50', 'Fees & Comm': '$0.65', Amount: '$298.35'
  }]));
  Logger.log('Import: ' + JSON.stringify(result));
}

function testGetAll() {
  const txs = getAllTransactions();
  Logger.log('Transactions: ' + txs.length);
}

function testDashboard() {
  const data = getAppData();
  Logger.log('chains: ' + data.chains.length + ', txs: ' + data.txs.length + ', totalPnl: ' + data.totalPnl);
}

// ─── Diagnostic: dump raw sheet rows to see column alignment ──
function testDiagnoseSheet() {
  const sheet = getOrCreateSheet();
  const all   = sheet.getDataRange().getValues();
  Logger.log('=== HEADER ROW ===');
  Logger.log(JSON.stringify(all[0]));
  Logger.log('=== TOTAL ROWS (incl header): ' + all.length + ' ===');
  for (var i = 1; i < all.length; i++) {
    var row = all[i];
    var id  = String(row[0] || '');
    if (id.indexOf('TNA') !== -1) {
      Logger.log('--- ROW ' + (i+1) + ' ---');
      Logger.log('  [0] id        = ' + row[0]);
      Logger.log('  [1] date      = ' + row[1]);
      Logger.log('  [2] action    = ' + row[2]);
      Logger.log('  [3] symbol    = ' + row[3]);
      Logger.log('  [4] underlying= ' + row[4]);
      Logger.log('  [5] expiry    = ' + row[5]);
      Logger.log('  [6] strike    = ' + row[6]);
      Logger.log('  [7] optionType= ' + row[7]);
      Logger.log('  [8] quantity  = ' + row[8]);
      Logger.log('  [9] price     = ' + row[9]);
      Logger.log('  [10] fees     = ' + row[10]);
      Logger.log('  [11] amount   = ' + row[11]);
      Logger.log('  [12] raw      = ' + String(row[12]).substring(0, 60) + '...');
      Logger.log('  total cols in row: ' + row.length);
    }
  }
}

// ─── Diagnostic: dump TNA chains and every leg ────────────────
function testDiagnoseChains() {
  const data = getAppData();
  const tna  = (data.chains || []).filter(function(c) { return c.ticker === 'TNA'; });
  Logger.log('=== TNA CHAINS (' + tna.length + ') ===');
  tna.forEach(function(ch) {
    Logger.log('Chain: ' + ch.chainId + ' | status=' + ch.status + ' | netPnl=' + ch.netPnl + ' | CB=' + ch.costBasis);
    ch.legs.forEach(function(leg) {
      Logger.log('  ' + leg.chainType + '  amount=' + leg.amount + '  symbol=' + leg.symbol);
    });
  });
}
