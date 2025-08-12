// api/search.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

let cache = {
  pincodes: null,
  urgent: null
};

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

// Normal service pricing tables (from your images)
const normalUnder5 = {
  "Local (HYD)": { first250: 80, first500: 110, addl500: 60 },
  "AP / Telangana": { first250: 120, first500: 150, addl500: 70 },
  "Metro City Mum, Del, Kol": { first250: 180, first500: 200, addl500: 140 },
  "Che, Blr": { first250: 150, first500: 180, addl500: 110 },
  "Rest of India": { first250: 200, first500: 240, addl500: 160 }
};

const normalAbove5 = {
  // per kg rates: surface, air (air may be "NA")
  "Local (HYD)": { surface: 70, air: null },
  "AP / Telangana": { surface: 80, air: null },
  "Metro City Mum, Del, Kol": { surface: 120, air: 200 },
  "Che, Blr": { surface: 110, air: 150 },
  "Rest of India": { surface: 150, air: 250 }
};

// Utility helpers
function toGrams(weightKg) {
  return Math.round(parseFloat(weightKg) * 1000);
}

function ceilDiv(a, b) { return Math.ceil(a / b); }

function calcNormalPriceByCategory(category, weightG, transportMode) {
  // weightG in grams
  if (weightG < 5000) {
    const band = normalUnder5[category];
    if (!band) return { ok: false, msg: "Category not supported for <5kg" };
    if (weightG <= 250) return { ok: true, price: band.first250 };
    if (weightG <= 500) return { ok: true, price: band.first500 };
    // >500g and <5kg: compute extra by every 500g
    const extraGrams = weightG - 500;
    const extraUnits = ceilDiv(extraGrams, 500);
    return { ok: true, price: band.first500 + (extraUnits * band.addl500) };
  } else {
    // >= 5kg: per-kg rates
    const perKgRates = normalAbove5[category];
    if (!perKgRates) return { ok: false, msg: "Category not supported for >=5kg" };
    const mode = (transportMode || 'surface').toLowerCase();
    const rate = mode === 'air' ? perKgRates.air : perKgRates.surface;
    if (rate === null || rate === undefined) return { ok: false, msg: `Transport mode ${mode} not available for ${category}` };
    // charge = ceil(weightKg) * rate (round up to nearest kg)
    const kg = Math.ceil(weightG / 1000);
    return { ok: true, price: kg * rate };
  }
}

function loadData() {
  if (cache.pincodes && cache.urgent) return;

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    cache.pincodes = null;
    cache.urgent = null;
    return;
  }
  const files = fs.readdirSync(dataDir);
  const pincodeFile = files.find(n => n.toLowerCase().includes('pincode'));
  const urgentFile = files.find(n => n.toLowerCase().includes('urgent'));

  if (!pincodeFile || !urgentFile) {
    // leave nulls; API will report missing files
    cache.pincodes = null;
    cache.urgent = null;
    return;
  }

  const pData = readWorkbook(path.join(dataDir, pincodeFile));
  const uData = readWorkbook(path.join(dataDir, urgentFile));
  cache.pincodes = pData;
  cache.urgent = uData;
}

// Generic: find pincode row (support pincode column names like "Pincode" or "Pin")
function findPincodeRow(pincode) {
  if (!cache.pincodes) return null;
  const s = String(pincode).trim();
  return cache.pincodes.find(r => {
    for (const key of Object.keys(r)) {
      if (String(r[key]).trim() === s) return true;
    }
    return false;
  });
}

// Generic urgent pricing lookup - expects urgent.xlsx to have columns:
// e.g. "Destination" (category), "MinG", "MaxG", "Price"  OR weight bands columns. We try to be flexible.
function findUrgentPrice(category, weightG) {
  if (!cache.urgent) return null;

  // Try to find rows where Destination matches category (allow partial match)
  const rows = cache.urgent.filter(r => {
    const dest = String(r.Destination || r.destination || r['DESTINATION'] || '').toLowerCase();
    return dest && dest.includes(category.toLowerCase().split(' ')[0]);
  });

  // If there are explicit min/max columns in grams or kg, use them
  for (const r of rows) {
    // try variants for columns
    const min = r.MinG || r.minG || r.Min || r.min || r['Min (g)'] || null;
    const max = r.MaxG || r.maxG || r.Max || r.max || r['Max (g)'] || null;
    if (min != null && max != null) {
      const minVal = Number(min);
      const maxVal = Number(max);
      if (!isNaN(minVal) && !isNaN(maxVal) && weightG >= minVal && weightG <= maxVal) {
        return { ok: true, price: Number(r.Price || r.PRICE || r.price || r['Price'] || 0) };
      }
    }
  }

  // If no min/max, try weight band columns (like "0 – 250 Gms", "250 – 500 Gms", "Every ADDL 500 Gms")
  if (cache.urgent && cache.urgent.length > 0) {
    // group by destination
    const byDest = {};
    for (const r of cache.urgent) {
      const dest = String(r.Destination || r.destination || r['DESTINATION'] || '').trim();
      if (!dest) continue;
      if (!byDest[dest]) byDest[dest] = [];
      byDest[dest].push(r);
    }
    // try best-match dest
    const matchKey = Object.keys(byDest).find(k => k.toLowerCase().includes(category.toLowerCase().split(' ')[0]));
    if (matchKey) {
      // We only have one row per destination (likely)
      const row = byDest[matchKey][0];
      // Attempt to use columns named similarly to your normal chart headers:
      // e.g. "0 – 250 Gms", "250 – 500 Gms", "Every ADDL 500 Gms"
      const h250 = row['0 – 250 Gms'] || row['0-250 Gms'] || row['0 – 250 gms'] || row['0-250'] || row['0–250 Gms'] || row['0 – 250 Gms '] || null;
      const h500 = row['250 – 500 Gms'] || row['250-500 Gms'] || row['250–500 Gms'] || row['250-500'] || null;
      const addl = row['Every ADDL 500 Gms'] || row['Every ADDL 500 Gms '] || row['Every ADDL 500 Gms'] || row['Every ADDL 500 Gms'] || row['Every ADDL 500 Gms'] || row['Every ADDL 500Gms'] || row['Every ADDL 500 Gms '] || row['Every ADDL 500 Gms'] || null;
      // fallback to Price column
      if (h250 && weightG <= 250) return { ok: true, price: Number(h250) };
      if (h500 && weightG > 250 && weightG <= 500) return { ok: true, price: Number(h500) };
      if (addl && weightG > 500) {
        const extra = weightG - 500;
        const addUnits = ceilDiv(extra, 500);
        return { ok: true, price: Number(h500 || 0) + addUnits * Number(addl) };
      }
    }
  }

  // if nothing matches, return null
  return null;
}

module.exports = async (req, res) => {
  // Only POST expected
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, msg: "POST JSON { pincode, weightKg, serviceType, transportMode }" });
    return;
  }

  loadData();
  if (!cache.pincodes || !cache.urgent) {
    res.status(500).json({ ok: false, msg: "Required Excel files not found in /api/data. Place Pincode and urgent files there." });
    return;
  }

  const { pincode, weightKg, serviceType, transportMode } = req.body || {};
  if (!pincode || !weightKg || !serviceType) {
    res.status(400).json({ ok: false, msg: "Missing required params: pincode, weightKg, serviceType" });
    return;
  }

  const weightG = toGrams(weightKg);
  const pRow = findPincodeRow(pincode);
  if (!pRow) {
    res.status(404).json({ ok: false, msg: "Pincode not found in pincode file" });
    return;
  }

  // Try to get area name and category from pRow (flexible field names)
  const areaName = pRow.Area || pRow['Area Name'] || pRow['AreaName'] || pRow['AREA'] || pRow['Area Name '] || '';
  const category = pRow.Category || pRow['CATEGORY'] || pRow['Region'] || pRow['Destination'] || pRow['Zone'] || pRow['State'] || '';

  if (!category) {
    res.status(500).json({ ok: false, msg: "Category not found for this pincode in excel file. Ensure a Category/Region column exists." });
    return;
  }

  // Normalize category to match table keys
  const normalizedCategory = (() => {
    const c = String(category).toLowerCase();
    if (c.includes('hyd') || c.includes('local')) return 'Local (HYD)';
    if (c.includes('ap') || c.includes('telangana')) return 'AP / Telangana';
    if (c.includes('mum') || c.includes('del') || c.includes('kol') || c.includes('metro')) return 'Metro City Mum, Del, Kol';
    if (c.includes('che') || c.includes('blr') || c.includes('bangalore') || c.includes('chen')) return 'Che, Blr';
    return 'Rest of India';
  })();

  let priceResult = null;
  if (String(serviceType).toLowerCase() === 'normal') {
    priceResult = calcNormalPriceByCategory(normalizedCategory, weightG, transportMode);
    if (!priceResult.ok) {
      res.status(400).json({ ok: false, msg: priceResult.msg });
      return;
    } else {
      res.status(200).json({
        ok: true,
        areaName,
        category: normalizedCategory,
        serviceType: 'Normal',
        price: priceResult.price
      });
      return;
    }
  } else {
    // Urgent service
    const urgentLookup = findUrgentPrice(normalizedCategory, weightG);
    if (!urgentLookup) {
      res.status(404).json({ ok: false, msg: "Urgent price not available for this weight/category." });
      return;
    }
    res.status(200).json({
      ok: true,
      areaName,
      category: normalizedCategory,
      serviceType: 'Urgent',
      price: urgentLookup.price
    });
  }
};
