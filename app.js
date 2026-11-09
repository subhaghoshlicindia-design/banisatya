const PAGE_SIZE = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SOURCES = {};
for (const [category, codes] of Object.entries({
  clients: ['EXCEL_CLIENTS','WBR9','MFSD211','MFSD311'],
  transactions: ['EXCEL_TX','WBR2','WBR2A','MFSD201','MFSD307'],
  holdings: ['EXCEL_AUM','WBR22','MFSD203','MFSD310'],
  sips: ['WBR49','MFSD243','MFSD313','MFSD230'],
  brokerage: ['WBR6','WBR77','MFSD205','MFSD208']
})) codes.forEach(code => { SOURCES[code] = { category, label: {clients:'Client master',transactions:'Transactions',holdings:'AUM / holdings',sips:'SIP / STP / SWP',brokerage:'Brokerage'}[category] }; });
SOURCES.EXCEL_AUM.label='AUM List (combined Excel export)';
SOURCES.EXCEL_TX.label='Transactions Report (combined Excel export)';
SOURCES.EXCEL_CLIENTS.label='Excel client master';
SOURCES.WBR9.label='Investor static details / client master';
SOURCES.WBR3={category:'aum-summary',label:'Sales and AUM summary (PDF / ZIP)'};
const CATEGORY_LABELS = {
  clients: "Client master",
  holdings: "AUM / holdings",
  transactions: "Transactions",
  sips: "SIP / STP / SWP",
  brokerage: "Commission"
};
const viewCopy = {
  Overview: ["Portfolio overview", "Summary of your imported mutual fund data."],
  Clients: ["Clients", "Investor details from your latest holdings import."],
  Investments: ["Investments", "Holdings from your latest CAS or portfolio import."],
  Transactions: ["Transactions", "Purchases, redemptions, and other imported transactions."],
  SIPs: ["SIP activity", "SIP registrations and transactions from your latest import."],
  Brokerage: ["Brokerage", "Brokerage and commission records from your latest import."],
  Reports: ["Reports", "Generate a printable PDF report from your imported data."],
  Settings: ["Workspace settings", "Manage your account, employee access and shared workspace."]
};
const columnAliases = {
  client: ["client name", "investor name", "name of investor", "name of first holder", "first holder name", "holder name", "investor", "client", "name"],
  scheme: ["scheme name", "name of scheme", "name of the scheme", "scheme", "fund name", "mutual fund", "security name"],
  folio: ["folio number", "folio no", "folio"],
  units: ["balance units", "total units", "units", "unit balance"],
  currentValue: ["current market value", "market value", "mkt value", "current value", "curr val", "valuation", "total value", "closing value", "aum value", "aum"],
  investedValue: ["invested value", "cost value", "purchase value", "amount invested", "invested amount", "inv amount", "inv amt"],
  date: ["transaction date", "sip date", "installment date", "trade date", "order date", "date"],
  type: ["transaction type", "type of transaction", "order type", "trxn type", "tran type", "transaction", "activity", "description"],
  amount: ["transaction amount", "trxn amount", "trxn amt", "tran amt", "amount", "gross amount", "net amount", "value", "total amount", "purchase amount"],
  sipAmount: ["sip amount", "sip amt", "installment amount", "installment", "amount"],
  brokerage: ["brokerage amount", "brokerage amt", "broker amt", "brokerage", "commission amount", "commission amt", "comm amount", "comm amt", "commission", "payout", "amount"],
  redemption: ["redemption amount", "redeemed amount", "redemption value", "amount"]
};
for (const [target, names] of Object.entries({client:['Investor Name'],folio:['Folio Number'],scheme:['Scheme Name','Scheme Code'],date:['Transaction Date'],type:['Transaction Type'],amount:['Amount'],currentValue:['Current Value'],investedValue:['Invested Value'],units:['Units'],sipAmount:['SIP Amount'],brokerage:['Brokerage Amount']})) {
  names.forEach(name => columnAliases[target].push(...(RTA.fields[name] || [])));
}
const loginScreen = document.querySelector("#login-screen");
const appScreen = document.querySelector("#app-screen");
const transactionBody = document.querySelector("#transactions-body");
const recordsHead = document.querySelector("#records-head");
const searchInput = document.querySelector("#transaction-search");
const fileInput = document.querySelector("#data-file");
const importType = document.querySelector("#import-type");
const importStatus = document.querySelector("#import-status");
const displaySource = document.querySelector("#display-source");
const toast = document.querySelector("#toast");
const datasets = {};
let activeView = "Overview";
let activeRole = "distributor";
let showAllRecords = false;
let displayedSource = "WBR22";
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}

function cellText(value) {
  return String(value == null ? "" : value);
}

function normalizeHeader(value) {
  return cellText(value).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const normalizedHeaders = headers.map(normalizeHeader);
  const exactMatch = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
  if (exactMatch >= 0) return exactMatch;
  return normalizedHeaders.findIndex((header) => normalizedAliases.some((alias) => alias.length >= 8 && header.startsWith(alias)));
}

function sourceCategory(sourceCode) {
  return SOURCES[sourceCode] ? SOURCES[sourceCode].category : (datasets[sourceCode] && datasets[sourceCode].category) || sourceCode.replace(/^legacy_/, "");
}

function sourceCodeFromFilename(filename) {
  if(/R3\.(zip|pdf)$/i.test(filename))return 'WBR3';
  if(/R2\.(zip|dbf)$/i.test(filename))return 'WBR2';
  const stem = filename.replace(/\.[^.]+$/, "").toUpperCase();
  const codes = Object.keys(SOURCES).sort((left, right) => right.length - left.length);
  return codes.find((code) => new RegExp(`(^|[^A-Z0-9])${code}($|[^A-Z0-9])`).test(stem)) || null;
}

function categoryEntries(category) {
  return Object.keys(datasets)
    .filter((sourceCode) => sourceCategory(sourceCode) === category && datasets[sourceCode])
    .sort()
    .map((sourceCode) => ({ sourceCode, data: datasets[sourceCode] }));
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  return rows;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t", "|"];
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    if (firstLine[index] === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(firstLine[index])) {
      counts.set(firstLine[index], counts.get(firstLine[index]) + 1);
    }
  }
  return candidates.reduce((best, candidate) => counts.get(candidate) > counts.get(best) ? candidate : best, ",");
}

function extractTable(rows, sourceCode) {
  const category = sourceCategory(sourceCode);
  const candidates = category === "clients" ? [...columnAliases.client, ...columnAliases.folio, "PAN", "INV_NAME", "ACNO"] : category === "holdings"
    ? [...columnAliases.scheme, ...columnAliases.folio, ...columnAliases.units, ...columnAliases.currentValue, ...columnAliases.investedValue]
    : category === "transactions"
      ? [...columnAliases.type, ...columnAliases.date, ...columnAliases.amount]
      : category === "sips"
        ? [...columnAliases.sipAmount, ...columnAliases.date, "sip registration", "sip installment", "sip"]
        : columnAliases.brokerage;
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map((cell) => cellText(cell).trim());
    return candidates.some((alias) => findColumn(headers, [alias]) >= 0);
  });
  if (headerIndex < 0) {
    throw new Error(`Could not find a ${SOURCES[sourceCode].label.toLowerCase()} header. Check the CSV headings or choose the matching WBR code.`);
  }
  const headers = rows[headerIndex].map((cell, index) => {
    const header = cellText(cell).trim();
    return header || `Column ${index + 1}`;
  });
  const records = rows.slice(headerIndex + 1)
    .map((row) => headers.map((_, index) => cellText(row[index]).trim()))
    .filter((row) => row.some(Boolean));
  if (!records.length) throw new Error("The file has headers but no data rows.");
  return { headers, records };
}

function decodeDbfText(bytes) {
  return new TextDecoder("windows-1252").decode(bytes);
}

function readDbf(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 33) throw new Error("The DBF file is too small to contain a valid table header.");

  const recordCount = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  if (headerLength < 33 || recordLength < 1 || headerLength > bytes.length) {
    throw new Error("The DBF table header is invalid or truncated.");
  }
  if (headerLength + recordCount * recordLength > bytes.length) {
    throw new Error("The DBF file is incomplete: its declared records extend beyond the end of the file.");
  }

  const fields = [];
  for (let offset = 32; offset < headerLength && bytes[offset] !== 0x0d; offset += 32) {
    if (offset + 32 > headerLength) throw new Error("The DBF field definitions are incomplete.");
    let end = offset;
    while (end < offset + 11 && bytes[end] !== 0) end += 1;
    const name = decodeDbfText(bytes.subarray(offset, end)).trim();
    const kind = String.fromCharCode(bytes[offset + 11]);
    const length = bytes[offset + 16];
    const decimals = bytes[offset + 17];
    if (!name || !length) throw new Error("The DBF contains an invalid field definition.");
    fields.push({ name, kind, length, decimals });
  }
  if (!fields.length) throw new Error("No fields were found in the DBF file.");
  const memoFields = fields.filter((field) => ["M", "G", "P"].includes(field.kind));
  if (memoFields.length) {
    throw new Error(`This DBF uses memo/binary fields (${memoFields.map((field) => field.name).join(", ")}). Export this WBR report as CSV so those values are included.`);
  }
  if (fields.reduce((total, field) => total + field.length, 1) > recordLength) {
    throw new Error("DBF field lengths do not match the declared record size.");
  }

  const headers = fields.map((field) => field.name);
  const records = [];
  for (let rowIndex = 0; rowIndex < recordCount; rowIndex += 1) {
    const rowStart = headerLength + rowIndex * recordLength;
    if (bytes[rowStart] === 0x2a) continue;
    let offset = rowStart + 1;
    const row = fields.map((field) => {
      const fieldBytes = bytes.subarray(offset, offset + field.length);
      offset += field.length;
      const raw = decodeDbfText(fieldBytes).replace(/\0/g, "").trim();
      if (field.kind === "D" && /^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      if (field.kind === "L") return /^[YyTt]$/.test(raw) ? "true" : /^[NnFf]$/.test(raw) ? "false" : "";
      if (field.kind === "I" && field.length === 4) {
        const integer = new DataView(fieldBytes.buffer, fieldBytes.byteOffset, fieldBytes.byteLength).getInt32(0, true);
        return String(integer);
      }
      if (field.kind === "B" && field.length === 8) {
        const number = new DataView(fieldBytes.buffer, fieldBytes.byteOffset, fieldBytes.byteLength).getFloat64(0, true);
        return Number.isFinite(number) ? String(number) : "";
      }
      if (field.kind === "Y" && field.length === 8) {
        const fieldView = new DataView(fieldBytes.buffer, fieldBytes.byteOffset, fieldBytes.byteLength);
        const low = BigInt(fieldView.getUint32(0, true));
        const high = BigInt(fieldView.getInt32(4, true));
        return String(Number((high << 32n) | low) / 10000);
      }
      if ((field.kind === "T" || field.kind === "@") && field.length === 8) {
        const fieldView = new DataView(fieldBytes.buffer, fieldBytes.byteOffset, fieldBytes.byteLength);
        const julianDay = fieldView.getInt32(0, true);
        const milliseconds = fieldView.getUint32(4, true);
        if (!julianDay) return "";
        const a = julianDay + 32044;
        const b = Math.floor((4 * a + 3) / 146097);
        const c = a - Math.floor((146097 * b) / 4);
        const d = Math.floor((4 * c + 3) / 1461);
        const e = c - Math.floor((1461 * d) / 4);
        const monthIndex = Math.floor((5 * e + 2) / 153);
        const day = e - Math.floor((153 * monthIndex + 2) / 5) + 1;
        const month = monthIndex + 3 - 12 * Math.floor(monthIndex / 10);
        const year = 100 * b + d - 4800 + Math.floor(monthIndex / 10);
        const time = `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${time}`;
      }
      if (field.kind === "0") return "";
      return raw;
    });
    if (row.some(Boolean)) records.push(row);
  }
  if (!records.length) throw new Error("The DBF table contains no active data records.");
  return { headers, records };
}

async function readStatement(file, sourceCode, archivePassword='') {
  if (file.size > MAX_FILE_SIZE) throw new Error("The file is larger than 10 MB. Export a smaller statement and try again.");
  const extension = file.name.split(".").pop().toLowerCase();
  if(sourceCode==='WBR3'&&extension!=='pdf'&&extension!=='zip')throw new Error('Choose the original CAMS WBR3 PDF or its ZIP. WBR3 summary tables use a different layout from investor holdings feeds.');
  if(extension==='pdf'){
    if(sourceCode!=='WBR3')throw new Error('For CAMS WBR3 Sales and AUM PDFs, select WBR3 - Sales and AUM summary. Other reports need DBF, Excel or CSV data.');
    const field=document.getElementById('zip-password');try{return await WBR3.readPdf(file,field.value||archivePassword);}finally{field.value='';}
  }
  if(extension==='zip'){
    const passwordField=document.getElementById('zip-password');
    const password=passwordField.value;
    let extracted;
    try{extracted=await RTAZip.extract(file,password,sourceCode);}finally{passwordField.value='';}
    const data=await readStatement(extracted,sourceCode,password);
    // Validate the exact DBF layout before presenting a preview or sending any data.
    RTA.merge(datasets,data,sourceCode);

    return {...data,filename:file.name+' / '+extracted.name};
  }
  let table;
  if (extension === "dbf") {
    table = readDbf(await file.arrayBuffer());
  } else if (extension === "xlsx" || extension === "xls") {
    if (!window.XLSX) throw new Error("Excel support could not load. Check your internet connection, or save the spreadsheet as CSV and import it.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("The Excel workbook has no worksheets.");
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
    table = extractTable(rows, sourceCode);
  } else if (extension === "csv" || extension === "txt") {
    const text = await file.text();
    const rows = parseDelimited(text, detectDelimiter(text));
    table = extractTable(rows, sourceCode);
  } else {
    throw new Error("Choose a ZIP, DBF, CSV, XLS, or XLSX file.");
  }
  return { ...table, filename: file.name, importedAt: new Date().toISOString(), sourceCode, category: sourceCategory(sourceCode) };
}

function valueFor(record, headers, aliases) {
  const column = findColumn(headers, aliases);
  return column < 0 ? "" : cellText(record[column]);
}

function parseAmount(value) {
  const cleaned = cellText(value).trim().replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const number = Number(cleaned.replace(/[()]/g, ""));
  return Number.isFinite(number) ? (negative ? -number : number) : null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatCompactCurrency(value) {
  const absolute = Math.abs(value);
  if (absolute >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (absolute >= 100000) return `₹${(value / 100000).toFixed(2)} Lac`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function sumFor(type, aliases) {
  const entries = categoryEntries(type);
  if (!entries.length) return null;
  return entries.reduce((grandTotal, { data }) => grandTotal + data.records.reduce((sum, record) => {
    const amount = parseAmount(valueFor(record, data.headers, aliases));
    return sum + (amount === null ? 0 : amount);
  }, 0), 0);
}

function latestEntry(category) {
  const entries = categoryEntries(category);
  return entries.reduce((latest, entry) =>
    !latest || cellText(entry.data.importedAt) > cellText(latest.data.importedAt) ? entry : latest, null
  );
}

function sumForLatest(category, aliases) {
  if (category === "holdings") return sumFor(category, aliases);
  const latest = latestEntry(category);
  if (!latest || findColumn(latest.data.headers, aliases) < 0) return null;
  return latest.data.records.reduce((sum, record) => {
    const amount = parseAmount(valueFor(record, latest.data.headers, aliases));
    return sum + (amount === null ? 0 : amount);
  }, 0);
}

function totalRedemptions() {
  const entries = categoryEntries("transactions");
  if (!entries.length) return null;
  const measurableEntries = entries.filter(({ data }) =>
    findColumn(data.headers, columnAliases.amount) >= 0 && findColumn(data.headers, columnAliases.type) >= 0
  );
  if (!measurableEntries.length) return null;
  return measurableEntries.reduce((grandTotal, { data }) => {
    const typeIndex = findColumn(data.headers, columnAliases.type);
    const amountIndex = findColumn(data.headers, columnAliases.amount);
    return grandTotal + data.records.reduce((sum, record) => {
      const kind = cellText(record[typeIndex]).toLowerCase();
      if (!/redempt|redeem|withdraw|switch.?out/.test(kind)) return sum;
      const amount = parseAmount(record[amountIndex]);
      return sum + (amount === null ? 0 : Math.abs(amount));
    }, 0);
  }, 0);
}

function updateSummary() {
  const sips = categoryEntries("sips");
  const brokerage = categoryEntries("brokerage");
  document.querySelector("#portfolio-value").textContent = sumForLatest("holdings", columnAliases.currentValue) === null
    ? "—" : formatCurrency(sumForLatest("holdings", columnAliases.currentValue));
  document.querySelector("#sip-value").textContent = sips.some(({ data }) => findColumn(data.headers, columnAliases.sipAmount) >= 0)
    ? formatCurrency(sumFor("sips", columnAliases.sipAmount)) : "—";
  const redemptions = totalRedemptions();
  document.querySelector("#redemption-value").textContent = redemptions === null || !categoryEntries("transactions").some(({ data }) => findColumn(data.headers, columnAliases.type) >= 0)
    ? "—" : formatCurrency(redemptions);
  document.querySelector("#brokerage-value").textContent = brokerage.some(({ data }) => findColumn(data.headers, columnAliases.brokerage) >= 0)
    ? formatCurrency(sumFor("brokerage", columnAliases.brokerage)) : "—";
}

function employeeClientCount() {
  const latest = latestEntry("holdings");
  if (!latest) return "—";
  const clientColumn = findColumn(latest.data.headers, columnAliases.client);
  const folioColumn = findColumn(latest.data.headers, columnAliases.folio);
  if (clientColumn < 0 && folioColumn < 0) return "—";
  const clients = new Set(latest.data.records
    .map((record) => cellText(record[clientColumn >= 0 ? clientColumn : folioColumn]).trim()
      || (folioColumn >= 0 ? cellText(record[folioColumn]).trim() : ""))
    .map((identity) => identity.toLowerCase())
    .filter(Boolean));
  return String(clients.size);
}

function employeeAllocation() {
  const latest = latestEntry("holdings");
  if (!latest) return [];
  const schemeColumn = findColumn(latest.data.headers, columnAliases.scheme);
  const valueColumn = findColumn(latest.data.headers, columnAliases.currentValue);
  if (schemeColumn < 0 || valueColumn < 0) return [];

  const schemes = new Map();
  latest.data.records.forEach((record) => {
    const name = cellText(record[schemeColumn]).trim();
    const value = parseAmount(record[valueColumn]);
    if (!name || value === null || value <= 0) return;
    schemes.set(name, (schemes.get(name) || 0) + value);
  });
  const sorted = Array.from(schemes, ([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
  if (sorted.length <= 5) return sorted;
  const top = sorted.slice(0, 4);
  top.push({ name: "Other", value: sorted.slice(4).reduce((total, item) => total + item.value, 0) });
  return top;
}

function employeeChartData(metric, clientFilter) {
  const config = {
    aum: { category: "holdings", amount: columnAliases.currentValue },
    sales: { category: "transactions", amount: columnAliases.amount },
    sip: { category: "sips", amount: columnAliases.sipAmount },
    brokerage: { category: "brokerage", amount: columnAliases.brokerage }
  }[metric];
  if (!config) return [];
  const entries = categoryEntries(config.category);
  const values = new Map();
  entries.forEach(({ data }) => {
    const amountColumn = findColumn(data.headers, config.amount);
    if (amountColumn < 0) return;
    const typeColumn = metric === "sales" ? findColumn(data.headers, columnAliases.type) : -1;
    const schemeColumn = findColumn(data.headers, columnAliases.scheme);
    data.records.forEach((record, rowIndex) => {
      if (clientFilter && clientIdentity(record, data) !== clientFilter) return;
      if (metric === "sales" && typeColumn >= 0 && !/purchase|purch|buy|switch.?in|subscription/.test(cellText(record[typeColumn]).toLowerCase())) return;
      const amount = parseAmount(record[amountColumn]);
      if (amount === null || amount <= 0) return;
      const clientColumn = findColumn(data.headers, columnAliases.client);
      const folioColumn = findColumn(data.headers, columnAliases.folio);
      const fallbackName = clientColumn >= 0 ? cellText(record[clientColumn]).trim()
        : folioColumn >= 0 ? `Folio ${cellText(record[folioColumn]).trim()}` : "";
      const label = schemeColumn >= 0 ? cellText(record[schemeColumn]).trim() : fallbackName || `Record ${rowIndex + 1}`;
      if (label) values.set(label, (values.get(label) || 0) + amount);
    });
  });
  return Array.from(values, ([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

function renderEmployeeBusinessChart() {
  const metric = document.querySelector("[data-business-metric].active").dataset.businessMetric;
  const clientFilter = document.querySelector("#employee-chart-client").value;
  const limitValue = document.querySelector("#employee-chart-range").value;
  const limit = limitValue === "all" ? Number.MAX_SAFE_INTEGER : Number(limitValue);
  const type = document.querySelector("#employee-chart-type").value;
  const chart = document.querySelector("#employee-business-chart");
  const data = employeeChartData(metric, clientFilter).slice(0, limit);
  if (!data.length) {
    chart.innerHTML = `<p class="empty-state">Import matching ${metric === "aum" ? "holdings" : metric === "sip" ? "SIP" : metric === "brokerage" ? "commission" : "purchase transaction"} data to see this chart.</p>`;
    chart.setAttribute("aria-label", `No ${metric} chart data available`);
    return;
  }

  const width = Math.max(560, data.length * 82);
  const height = 260;
  const plotTop = 22;
  const plotBottom = 195;
  const plotHeight = plotBottom - plotTop;
  const maxValue = Math.max(...data.map((item) => item.value));
  const step = width / data.length;
  const points = data.map((item, index) => ({
    ...item,
    x: step * index + step / 2,
    y: plotBottom - item.value / maxValue * (plotHeight - 8)
  }));
  const grid = [0, 1, 2, 3].map((index) => {
    const y = plotTop + plotHeight * index / 3;
    const value = maxValue * (1 - index / 3);
    const label = value >= 10000000 ? `${(value / 10000000).toFixed(value >= 100000000 ? 0 : 1)} Cr`
      : value >= 100000 ? `${(value / 100000).toFixed(0)} L`
        : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
    return `<line x1="52" y1="${y}" x2="${width - 10}" y2="${y}" class="employee-chart-gridline"/><text x="45" y="${y + 3}" class="employee-chart-y-label" text-anchor="end">${escapeHTML(label)}</text>`;
  }).join("");
  const series = type === "line"
    ? `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="employee-chart-line"/>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" class="employee-chart-point"><title>${escapeHTML(point.label)}: ${escapeHTML(formatCurrency(point.value))}</title></circle>`).join("")}`
    : points.map((point) => {
      const barWidth = Math.min(42, step * .52);
      return `<rect x="${point.x - barWidth / 2}" y="${point.y}" width="${barWidth}" height="${plotBottom - point.y}" rx="3" class="employee-chart-bar"><title>${escapeHTML(point.label)}: ${escapeHTML(formatCurrency(point.value))}</title></rect>`;
    }).join("");
  const labels = points.map((point) => `<text x="${point.x}" y="218" class="employee-chart-x-label" text-anchor="end" transform="rotate(-38 ${point.x} 218)">${escapeHTML(point.label.length > 18 ? `${point.label.slice(0, 17)}…` : point.label)}</text>`).join("");
  chart.innerHTML = `<svg class="employee-chart-svg" viewBox="0 0 ${width} ${height}" style="width:${width}px" role="img" aria-label="${metric.toUpperCase()} by fund or client">${grid}${series}${labels}</svg>`;
  chart.setAttribute("aria-label", `${metric.toUpperCase()} data grouped by fund or client`);
}

function renderEmployeeDashboard() {
  const aum = sumForLatest("holdings", columnAliases.currentValue);
  const sip = categoryEntries("sips").some(({ data }) => findColumn(data.headers, columnAliases.sipAmount) >= 0)
    ? sumFor("sips", columnAliases.sipAmount) : null;
  const revenue = categoryEntries("brokerage").some(({ data }) => findColumn(data.headers, columnAliases.brokerage) >= 0)
    ? sumFor("brokerage", columnAliases.brokerage) : null;
  document.querySelector("#employee-aum").textContent = aum === null ? "—" : formatCompactCurrency(aum);
  document.querySelector("#employee-clients").textContent = employeeClientCount();
  document.querySelector("#employee-sip").textContent = sip === null ? "—" : formatCompactCurrency(sip);
  document.querySelector("#employee-revenue").textContent = revenue === null ? "—" : formatCompactCurrency(revenue);

  const imports = Object.values(datasets).filter(Boolean);
  const latestImport = imports.map((data) => data.importedAt).filter(Boolean).sort().pop();
  const updatedLabel = document.querySelector("#employee-updated");
  if (!latestImport) {
    updatedLabel.textContent = "Waiting for portfolio data";
    document.querySelector("#employee-market-status").textContent = "Waiting for the latest index import";
  } else {
    const updatedDate = new Date(latestImport);
    updatedLabel.textContent = Number.isNaN(updatedDate.getTime())
      ? "Portfolio data is available"
      : `Updated ${updatedDate.toLocaleString()}`;
    document.querySelector("#employee-market-status").textContent = Number.isNaN(updatedDate.getTime())
      ? "Latest imported portfolio data is available"
      : `Latest index update · ${updatedDate.toLocaleString()}`;
  }

  const clients = statementClients();
  const clientFilter = document.querySelector("#employee-chart-client");
  const previousClient = clientFilter.value;
  clientFilter.innerHTML = `<option value="">All clients</option>${clients.map((client) => `<option value="${escapeHTML(client.key)}">${escapeHTML(client.label)}</option>`).join("")}`;
  if (clients.some((client) => client.key === previousClient)) clientFilter.value = previousClient;
  renderEmployeeBusinessChart();

  const allocations = employeeAllocation();
  const total = allocations.reduce((sum, item) => sum + item.value, 0);
  const chart = document.querySelector("#employee-allocation-chart");
  const legend = document.querySelector("#employee-allocation-legend");
  document.querySelector("#employee-allocation-total").textContent = total > 0 ? "100%" : "—";
  document.querySelector("#employee-allocation-chart").setAttribute("aria-label", total > 0
    ? `100 percent of holdings allocated across ${allocations.length} schemes, total ${formatCurrency(total)}`
    : "No holdings allocation data");
  if (!allocations.length || total <= 0) {
    chart.style.background = "#edf1fa";
    chart.setAttribute("aria-label", "No holdings allocation data");
    legend.innerHTML = `<p class="empty-state">Scheme allocation will appear after a holdings file is imported.</p>`;
    return;
  }

  const colors = ["#123d83", "#d3a637", "#4b79ba", "#e9cd82", "#08285e"];
  let end = 0;
  const segments = allocations.map((item, index) => {
    const start = end;
    end += item.value / total * 100;
    return `${colors[index]} ${start}% ${end}%`;
  });
  chart.style.background = `conic-gradient(${segments.join(", ")})`;
  chart.setAttribute("aria-label", `Holdings allocation across ${allocations.length} schemes`);
  legend.innerHTML = allocations.map((item, index) => {
    const share = item.value / total * 100;
    return `<div><span class="allocation-swatch allocation-color-${index}"></span><span class="allocation-name">${escapeHTML(item.name)}</span><strong>${share.toFixed(1)}%</strong></div>`;
  }).join("");
}

function escapeHTML(value) {
  return cellText(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function currentDataType() {
  return ({ Overview: "holdings", Clients: "clients", Investments: "holdings", Transactions: "transactions", SIPs: "sips", Brokerage: "brokerage" })[activeView] || "holdings";
}

function defaultSourceForCategory(category) {
  return Object.keys(SOURCES).find((code) => SOURCES[code].category === category);
}

function renderSourceOptions(category) {
  const entries = categoryEntries(category);
  const selector = document.querySelector("#source-filter-label");
  selector.hidden = entries.length < 2;
  displaySource.innerHTML = entries.map(({ sourceCode, data }) => `<option value="${escapeHTML(sourceCode)}">${escapeHTML(sourceCode)} · ${escapeHTML(data.filename)}</option>`).join("");
  const validSource = entries.some(({ sourceCode }) => sourceCode === displayedSource);
  displayedSource = validSource ? displayedSource : entries.length ? entries[0].sourceCode : defaultSourceForCategory(category);
  if (entries.length) displaySource.value = displayedSource;
}

function renderRecords() {
  const type = currentDataType();
  renderSourceOptions(type);
  const data = datasets[displayedSource];
  const headers = data ? data.headers : [];
  const records = data ? data.records : [];
  const query = searchInput.value.trim().toLowerCase();
  const filtered = records.filter((record) => record.join(" ").toLowerCase().includes(query));
  const visible = showAllRecords ? filtered : filtered.slice(0, PAGE_SIZE);
  const displayHeaders = headers.slice(0, 12);
  recordsHead.innerHTML = displayHeaders.length
    ? `<tr>${displayHeaders.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr>`
    : "";
  transactionBody.innerHTML = visible.length
    ? visible.map((record) => `<tr>${record.slice(0, displayHeaders.length).map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty-state" colspan="${Math.max(displayHeaders.length, 1)}">${records.length ? "No records match your search." : activeRole === "employee" ? "No shared data is available yet. Ask your distributor to import the relevant file." : `No ${CATEGORY_LABELS[type].toLowerCase()} imported yet. Choose a WBR code above and import its file.`}</td></tr>`;
  document.querySelector("#results-count").textContent = filtered.length
    ? `Showing ${visible.length} of ${filtered.length} records${headers.length > 12 ? " · first 12 columns shown" : ""}`
    : records.length ? "No matching records" : "No imported data";
  const showMore = document.querySelector("#show-more");
  showMore.innerHTML = showAllRecords ? "Show fewer records <span>↑</span>" : "Show all records <span>→</span>";
  showMore.hidden = filtered.length <= PAGE_SIZE;
  updateSummary();
}

function setImportStatus(message, isError = false) {
  importStatus.textContent = message;
  importStatus.classList.toggle("error", isError);
}

function restoreDatasets() {
  Object.assign(datasets, Portal.state.datasets);
  setImportStatus(Object.keys(datasets).length ? "Shared reports loaded from the database." : "No reports uploaded yet.");
}

function csvCell(value) {
  const text = cellText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTemplate(type) {
  if(type==='WBR3'){showToast('WBR3 uses the original CAMS Sales and Assets PDF or its ZIP. No CSV template is required.');return;}
  const category = SOURCES[type].category;
  const templates = {
    clients: ["Investor Name", "PAN", "AMC", "Folio Number", "Email", "Mobile"],
    holdings: ["Investor Name", "PAN", "AMC", "Scheme Name", "Folio Number", "Units", "Current Value", "Invested Value"],
    transactions: ["Investor Name", "PAN", "AMC", "Scheme Name", "Folio Number", "Transaction ID", "Transaction Date", "Transaction Type", "Amount", "Units"],
    sips: ["Investor Name", "PAN", "AMC", "Scheme Name", "Folio Number", "Registration ID", "Start Date", "SIP Amount", "Status"],
    brokerage: ["Investor Name", "PAN", "AMC", "Scheme Name", "Folio Number", "Transaction ID", "Period From", "Period To", "Brokerage Type", "Brokerage Amount"]
  };
  const csv = [templates[category], templates[category].map(() => "")].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `banisatya-${type.toLowerCase()}-template.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector("#import-cas").addEventListener("click", () => { document.querySelector(".upload-workflow").scrollIntoView({behavior:"smooth",block:"center"});fileInput.focus(); });

const bulkInput = document.querySelector("#bulk-files");
const bulkButton = document.querySelector("#import-all");
bulkButton.addEventListener("click", () => bulkInput.click());
bulkInput.addEventListener("change", async () => {
  const files = Array.from(bulkInput.files || []);
  if (!files.length) return;
  const fileCodes = new Map();
  const issues = [];

  files.forEach((file) => {
    const sourceCode = sourceCodeFromFilename(file.name);
    if (!sourceCode) {
      issues.push(`${file.name}: filename must contain a supported WBR code.`);
    } else if (fileCodes.has(sourceCode)) {
      issues.push(`${file.name}: more than one file for ${sourceCode} was selected (${fileCodes.get(sourceCode)}).`);
    } else {
      fileCodes.set(sourceCode, file.name);
    }
  });

  if (issues.length) {
    setImportStatus(`Bulk upload cancelled. ${issues.join(" ")}`, true);
    bulkInput.value = "";
    return;
  }

  bulkButton.disabled = true;
  document.querySelector("#import-cas").disabled = true;
  setImportStatus(`Validating ${files.length} selected WBR file${files.length === 1 ? "" : "s"}…`);
  try {
    if (activeRole !== "distributor") throw new Error("Only distributors can import data.");
    const uploadFiles = [];
    let replacements = { ...datasets };
    for (const file of files) {
      const sourceCode = sourceCodeFromFilename(file.name);
      const data = await readStatement(file, sourceCode);
      uploadFiles.push({code: sourceCode, data});
      replacements = RTA.merge(replacements, data, sourceCode).datasets;
    }

    const codes = Object.keys(replacements).sort();
    const summary = codes.map((sourceCode) => `${sourceCode}: ${replacements[sourceCode].filename} (${replacements[sourceCode].records.length} rows)`).join("\n");
    if (!window.confirm(`Import these ${files.length} files and merge with existing history?\n\n${summary}\n\nUnselected RTA categories are preserved. AUM replaces the selected RTA snapshot; changing brokerage layouts replaces that RTA brokerage set.`)) {
      setImportStatus("Bulk upload cancelled. Existing imported data was not changed.");
      return;
    }

    replacements = (await Portal.importFiles(uploadFiles)).datasets;
    Object.keys(datasets).forEach((sourceCode) => { delete datasets[sourceCode]; });
    Object.assign(datasets, replacements);
    const holdingsCode = codes.find((sourceCode) => sourceCategory(sourceCode) === "holdings");
    displayedSource = holdingsCode || codes[0];
    if (SOURCES[displayedSource]) importType.value = displayedSource;
    showAllRecords = false;
    searchInput.value = "";
    const totalRows = Object.values(replacements).reduce((total, data) => total + data.records.length, 0);
    setImportStatus(`Merged imported data from ${files.length} files (${totalRows} rows): ${codes.join(", ")}.`);
    document.querySelector("#last-updated").textContent = `Updated ${new Date().toLocaleString()}`;
    setView("Overview");
    renderReport();
    refreshStatementClientList();
    showToast(`Imported and merged ${files.length} WBR files.`);
  } catch (error) {
    setImportStatus(`Bulk upload failed. Existing data was preserved. ${error.message}`, true);
  } finally {
    bulkButton.disabled = false;
    document.querySelector("#import-cas").disabled = false;
    bulkInput.value = "";
  }
});
let pendingUpload=null;
const uploadPreview=document.getElementById('upload-preview'),uploadSave=document.getElementById('upload-save-server'),uploadRead=document.getElementById('import-selected-file');
function resetUploadPreview(){pendingUpload=null;uploadSave.disabled=!fileInput.files.length;uploadPreview.hidden=true;uploadPreview.innerHTML='';}
fileInput.addEventListener('change',()=>{
 resetUploadPreview();const file=fileInput.files[0];
 document.getElementById('selected-upload-file').textContent=file?`${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`:'No file selected.';
 if(file&&/R2\.(zip|dbf)$/i.test(file.name))importType.value='WBR2';
 if(file&&/R3\.(zip|pdf)$/i.test(file.name))importType.value='WBR3';
 setImportStatus(file?'File selected. Enter the ZIP password if required, then click Upload & save to server. Preview is optional.':'Choose a report file to begin.');
});
importType.addEventListener('change',resetUploadPreview);
document.getElementById('zip-password').addEventListener('input',resetUploadPreview);
document.getElementById('import-wbr9').addEventListener('click',()=>{
 importType.value='WBR9';resetUploadPreview();fileInput.focus();
 setImportStatus('CAMS WBR9 selected: choose the Investor Static Details DBF, Excel or CSV file, or its ZIP. PDF statements cannot be imported.');
});
document.getElementById('import-wbr3').addEventListener('click',()=>{
 importType.value='WBR3';resetUploadPreview();fileInput.focus();
 setImportStatus('CAMS WBR3 selected: upload the Sales and Assets PDF or its ZIP. Amounts are in lakhs. Scheme totals and asset-aging tables are saved as a separate AUM summary.');
});
async function prepareUploadPreview(){
 resetUploadPreview();const file=fileInput.files[0];
 if(!file){setImportStatus('Choose a report file first using the file selector above.',true);fileInput.focus();return;}
 uploadSave.disabled=true;uploadRead.disabled=true;fileInput.disabled=true;importType.disabled=true;
 setImportStatus('Reading and validating the report in your browser…');
 try{
  if(activeRole!=='distributor')throw Error('Only distributors can import data.');
  const sourceCode=importType.value,data=await readStatement(file,sourceCode);
  const check=RTA.merge(datasets,data,sourceCode);
  pendingUpload={sourceCode,data};
  uploadPreview.innerHTML=`<h4>Ready to upload: ${escapeHTML(sourceCode)}</h4><p>${escapeHTML(data.filename)}</p><p>${data.records.length} source rows · ${data.headers.length} columns · ${check.data.importSummary.duplicates} identical duplicates will be skipped.</p><details><summary>Review columns</summary><p>${data.headers.map(escapeHTML).join(', ')}</p></details><p>Preview only: no data saved yet. Click Upload &amp; save to server to make it available for employee reports.</p>`;
  uploadPreview.hidden=false;uploadSave.disabled=false;setImportStatus('Preview validated. Ready to upload and save to the shared server.');
  if(sourceCode==='WBR3'){
   const s=WBR3.summary(data);
   uploadPreview.innerHTML+=`<p><strong>WBR3 AUM: ${escapeHTML(s.lakhs.toFixed(2))} lakh INR (${escapeHTML(formatCurrency(s.rupees))}) · ${s.accounts} live accounts</strong></p><p>Source AUM date: ${escapeHTML(s.asOf)} · Last NAV: ${escapeHTML(s.navDate)} · Report date: ${escapeHTML(s.reportDate)}</p><p>This is a scheme-level summary, without investor folios. It is kept separate from individual and family holdings.</p>${s.warnings.map(w=>`<p class="import-status error">${escapeHTML(w)}</p>`).join('')}`;
   if(WBR3.tables)uploadPreview.innerHTML+=WBR3.tables(data);
  }
 }catch(error){setImportStatus(error.message+' Your file is still selected. Correct the problem and click Upload & save again.',true);if(/password|unlock ZIP/i.test(error.message)){document.getElementById('zip-password').focus();}}
 finally{uploadRead.disabled=false;fileInput.disabled=false;importType.disabled=false;uploadSave.disabled=!fileInput.files.length;}
}
uploadRead.addEventListener('click',prepareUploadPreview);
uploadSave.addEventListener('click',async()=>{
 if(uploadRead.disabled)return;
 if(!pendingUpload)await prepareUploadPreview();
 if(!pendingUpload)return;
 const {sourceCode,data}=pendingUpload;
 uploadSave.disabled=true;uploadRead.disabled=true;fileInput.disabled=true;importType.disabled=true;
 setImportStatus('Uploading and saving to the shared server. Please keep this page open…');
 try{
  if(activeRole!=='distributor')throw Error('Only distributors can import data.');
  const saved=await Portal.importFiles([{code:sourceCode,data}]),nextData=saved.datasets[sourceCode];
  Object.keys(datasets).forEach(code=>delete datasets[code]);Object.assign(datasets,saved.datasets);displayedSource=sourceCode;
  showAllRecords=false;searchInput.value='';renderRecords();renderReport();refreshStatementClientList();renderEmployeeDashboard();
  document.querySelector('#last-updated').textContent=`Saved ${new Date(nextData.importedAt).toLocaleString()}`;
  resetUploadPreview();fileInput.value='';document.getElementById('selected-upload-file').textContent='Upload complete. Choose another file to continue.';
  setImportStatus(`Saved to server: ${nextData.records.length} ${sourceCode} rows. ${nextData.importSummary.duplicates} duplicates skipped. Employees with permission can now generate investor and family reports from this data.`);
  if(sourceCode==='WBR3')setImportStatus(`Saved WBR3 AUM summary to the shared server. Open Reports → CAMS WBR3 Sales and AUM summary to view or download its tables. Investor and family holdings are unchanged.`);
  showToast('Report saved to the shared server.');
 }catch(error){uploadSave.disabled=false;setImportStatus('Upload failed. No success was confirmed. '+error.message+' Your preview is retained so you can retry.',true);}
 finally{uploadRead.disabled=false;fileInput.disabled=false;importType.disabled=false;}
});

document.querySelector("#clear-data").addEventListener("click", async () => {
  if (!Object.keys(datasets).some((sourceCode) => datasets[sourceCode])) {
    showToast("There is no imported data to clear.");
    return;
  }
  if (!window.confirm("Clear all shared report data for everyone in your workspace? This cannot be undone.")) return;
  try {
    await Portal.clearData();
    Object.keys(datasets).forEach((sourceCode) => { delete datasets[sourceCode]; });
    showAllRecords = false;
    searchInput.value = "";
    setImportStatus("All imported WBR data cleared. Import new files whenever you are ready.");
    document.querySelector("#last-updated").textContent = "No import yet";
    renderRecords();
    renderReport();
    refreshStatementClientList();
  } catch (error) {
    setImportStatus(`Could not clear saved data: ${error.message}`, true);
  }
});

document.querySelector("#download-template").addEventListener("click", () => downloadTemplate(importType.value));
displaySource.addEventListener("change", () => {
  displayedSource = displaySource.value;
  renderRecords();
});
searchInput.addEventListener("input", () => {
  showAllRecords = false;
  renderRecords();
});
document.querySelector("#show-more").addEventListener("click", () => {
  showAllRecords = !showAllRecords;
  renderRecords();
});

function reportRows(type) {
  const entries = Object.keys(datasets).flatMap((sourceCode) => {
    const data = datasets[sourceCode];
    if (!data || (type !== "summary" && sourceCategory(sourceCode) !== type)) return [];
    const category = sourceCategory(sourceCode);
    return [{ label: `${sourceCode} · ${CATEGORY_LABELS[category] || category}`, data }];
  });
  return entries;
}

function reportMetric(type, data) {
  if (type === "summary") {
    const sumIfAvailable = (category, aliases) => {
      const hasColumn = category === "holdings"
        ? Boolean(latestEntry(category) && findColumn(latestEntry(category).data.headers, aliases) >= 0)
        : categoryEntries(category).some(({ data: entry }) => findColumn(entry.headers, aliases) >= 0);
      if (!hasColumn) return "Not imported";
      const total = category === "holdings" ? sumForLatest(category, aliases) : sumFor(category, aliases);
      return total === null ? "Not available in imported columns" : formatCurrency(total);
    };
    const redemption = totalRedemptions();
    const lines = [
      ["Current fund value", sumIfAvailable("holdings", columnAliases.currentValue)],
      ["Total invested", sumIfAvailable("holdings", columnAliases.investedValue)],
      ["SIP / STP / SWP total", sumIfAvailable("sips", columnAliases.sipAmount)],
      ["Redemptions", redemption === null ? "Not available in imported columns" : formatCurrency(redemption)],
      ["Commission total", sumIfAvailable("brokerage", columnAliases.brokerage)]
    ];
    return lines.map(([label, value]) => `<div class="report-stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("");
  }

  const aliases = type === "holdings" ? columnAliases.currentValue
    : type === "sips" ? columnAliases.sipAmount
      : type === "brokerage" ? columnAliases.brokerage : columnAliases.amount;
  const hasAmount = categoryEntries(type).some(({ data: entry }) => findColumn(entry.headers, aliases) >= 0);
  const rowCount = categoryEntries(type).reduce((count, entry) => count + entry.data.records.length, 0);
  const total = hasAmount ? (type === "holdings" ? sumForLatest(type, aliases) : sumFor(type, aliases)) : null;
  const amountLabel = type === "brokerage" ? "Total commission" : type === "sips" ? "SIP / STP / SWP amount" : type === "holdings" ? "Current fund value" : "Total transaction amount";
  return `<div class="report-stat"><span>Records</span><strong>${rowCount}</strong></div><div class="report-stat"><span>${amountLabel}</span><strong>${total === null ? "Not available in imported columns" : escapeHTML(formatCurrency(total))}</strong></div>`;
}

function renderReport() {
  const type = document.querySelector("#report-type").value;
  const preview = document.querySelector("#report-preview");
  const sources = reportRows(type);
  const generated = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date());
  if (!sources.length) {
    preview.innerHTML = activeRole === "employee"
      ? `<p class="empty-state">No shared ${type === "summary" ? "data" : escapeHTML(CATEGORY_LABELS[type].toLowerCase())} is available yet. Ask your distributor to import the relevant file.</p>`
      : `<p class="empty-state">No ${type === "summary" ? "data" : escapeHTML(CATEGORY_LABELS[type].toLowerCase())} imported yet. Import a DBF, CSV, or Excel file to include it in a report.</p>`;
    return;
  }
  const stats = type === "summary"
    ? reportMetric("summary")
    : reportMetric(type, sources[0].data);
  const tables = sources.map(({ label, data }) => {
    const headers = data.headers.slice(0, 12);
    const records = data.records;
    return `<section class="report-data"><h3>${escapeHTML(label)} <small>(${data.records.length} rows)</small></h3><div class="table-scroll"><table><thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${records.map((record) => `<tr>${record.slice(0, headers.length).map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }).join("");
  preview.innerHTML = `<div class="report-meta"><img class="report-company-logo" src="banisatya-logo.svg" alt="Banisatya Wealth Pvt Ltd"><strong>Banisatya Wealth Pvt Ltd · Mutual Fund Report</strong><span>Generated ${escapeHTML(generated)}</span></div><div class="report-stats">${stats}</div>${tables}<p class="report-note">Report contains only data imported into this workspace. Review figures before relying on them.</p>`;
}

function statementClients() {
  const latest = latestEntry("holdings");
  if (!latest) return [];
  const clientColumn = findColumn(latest.data.headers, columnAliases.client);
  const folioColumn = findColumn(latest.data.headers, columnAliases.folio);
  if (clientColumn < 0 && folioColumn < 0) return [];
  const clients = new Map();
  latest.data.records.forEach((record) => {
    const name = clientColumn >= 0 ? cellText(record[clientColumn]).trim() : "";
    const folio = folioColumn >= 0 ? cellText(record[folioColumn]).trim() : "";
    const label = name || (folio ? `Folio ${folio}` : "");
    const key = (name || folio).trim().toLowerCase();
    if (!key) return;
    if (!clients.has(key)) clients.set(key, { key, label, folios: new Set() });
    if (folio) clients.get(key).folios.add(folio);
  });
  return Array.from(clients.values())
    .map((client) => ({ ...client, folios: Array.from(client.folios) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function refreshStatementClientList() {
  const list = document.querySelector("#statement-client-list");
  if (!list) return;
  const previouslySelected = new Set(Array.from(list.querySelectorAll("input:checked")).map((input) => input.value));
  const clients = statementClients();
  list.innerHTML = clients.length
    ? clients.map((client) => {
      const details = client.folios.length ? `Folio${client.folios.length === 1 ? "" : "s"}: ${client.folios.join(", ")}` : "No folio listed";
      return `<label class="statement-client-option" data-client-search="${escapeHTML(`${client.label} ${details}`.toLowerCase())}"><input type="checkbox" value="${escapeHTML(client.key)}" ${previouslySelected.has(client.key) ? "checked" : ""} /><span><strong>${escapeHTML(client.label)}</strong><small>${escapeHTML(details)}</small></span></label>`;
    }).join("")
    : `<p class="empty-state">Import holdings with an investor name or folio number to search clients.</p>`;
  list.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
    updateStatementClientCount();
    invalidateStatementPreview("Client selection changed. Generate the statement again.");
  }));
  filterStatementClients();
  updateStatementClientCount();
  invalidateStatementPreview("Client data changed. Generate the statement again to use the latest imports.");
}

function filterStatementClients() {
  const query = document.querySelector("#statement-client-search").value.trim().toLowerCase();
  const options = Array.from(document.querySelectorAll(".statement-client-option"));
  let visibleCount = 0;
  options.forEach((option) => {
    option.hidden = !option.dataset.clientSearch.includes(query);
    if (!option.hidden) visibleCount += 1;
  });
  const noClients = document.querySelector("#statement-client-list .empty-state");
  if (noClients) noClients.hidden = options.length > 0;
  let noMatches = document.querySelector(".statement-no-matches");
  if (!noMatches && options.length) {
    noMatches = document.createElement("p");
    noMatches.className = "statement-no-matches empty-state";
    noMatches.textContent = "No clients match your search.";
    document.querySelector("#statement-client-list").append(noMatches);
  }
  if (noMatches) noMatches.hidden = !query || visibleCount > 0;
  updateStatementClientCount();
}

function updateStatementClientCount() {
  const checked = document.querySelectorAll("#statement-client-list input:checked").length;
  const total = document.querySelectorAll("#statement-client-list input").length;
  document.querySelector("#statement-client-count").textContent = `${checked} selected · ${total} available`;
  const visible = Array.from(document.querySelectorAll(".statement-client-option:not([hidden]) input"));
  const allVisibleSelected = visible.length > 0 && visible.every((input) => input.checked);
  document.querySelector("#statement-select-all").textContent = allVisibleSelected ? "Deselect visible" : "Select visible";
}

function invalidateStatementPreview(message) {
  const preview = document.querySelector("#consolidated-report-preview");
  const printButton = document.querySelector("#print-statement");
  if (!preview || !printButton) return;
  preview.innerHTML = "";
  printButton.disabled = true;
  document.querySelector("#statement-status").textContent = message || "";
}

function selectedStatementClients() {
  const chosen = new Set(Array.from(document.querySelectorAll("#statement-client-list input:checked"), (input) => input.value));
  return statementClients().filter((client) => chosen.has(client.key));
}

function clientIdentity(record, data) {
  const clientColumn = findColumn(data.headers, columnAliases.client);
  const name = clientColumn < 0 ? "" : cellText(record[clientColumn]).trim();
  if (name) return name.toLowerCase();
  const folioColumn = findColumn(data.headers, columnAliases.folio);
  return folioColumn < 0 ? "" : cellText(record[folioColumn]).trim().toLowerCase();
}

function statementRows(category, client) {
  const entries = category === "holdings"
    ? [latestEntry(category)].filter(Boolean)
    : categoryEntries(category);
  return entries.flatMap(({ sourceCode, data }) => {
    const rows = data.records.filter((record) => clientIdentity(record, data) === client.key);
    return rows.length ? [{ sourceCode, data: { ...data, records: rows } }] : [];
  });
}

function currentFinancialYearBounds() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(startYear, 3, 1), end: new Date(startYear + 1, 3, 1) };
}

function parseStatementDate(value) {
  const text = cellText(value).trim();
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) return new Date(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function statementTransactions(client) {
  const { start, end } = currentFinancialYearBounds();
  return statementRows("transactions", client).flatMap(({ sourceCode, data }) => {
    const dateColumn = findColumn(data.headers, columnAliases.date);
    if (dateColumn < 0) return [];
    const records = data.records.filter((record) => {
      const date = parseStatementDate(record[dateColumn]);
      return date && date >= start && date < end;
    });
    return records.length ? [{ sourceCode, data: { ...data, records } }] : [];
  });
}

function statementTable(label, data) {
  const headers = data.headers.slice(0, 12);
  return `<section class="report-data"><h4>${escapeHTML(label)} <small>(${data.records.length} rows)</small></h4><div class="table-scroll"><table><thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${data.records.map((record) => `<tr>${record.slice(0, headers.length).map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
}

function renderConsolidatedStatement() {
  const mode = document.querySelector(".statement-mode button.active").dataset.statementMode;
  const chosenClients = selectedStatementClients();
  const allClients = statementClients();
  const clients = chosenClients.length ? chosenClients : mode === "group" ? allClients : [];
  const options = Array.from(document.querySelectorAll("[data-statement-option]:checked"), (input) => input.dataset.statementOption);
  if (!clients.length) {
    invalidateStatementPreview(mode === "customer"
      ? "Select at least one client for a customer-wise statement."
      : "No client records are available. Import a holdings file with client names or folios.");
    return false;
  }
  if (!options.length) {
    invalidateStatementPreview("Select at least one report option.");
    return false;
  }

  const generated = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date());
  const currentYear = currentFinancialYearBounds().start.getFullYear();
  const clientReports = clients.map((client) => {
    const holdings = statementRows("holdings", client);
    const sections = options.map((option) => {
      if (option === "Mutual Funds") {
        return holdings.length
          ? holdings.map(({ sourceCode, data }) => statementTable(`Mutual Funds · ${sourceCode}`, data)).join("")
          : `<p class="statement-unavailable"><strong>Mutual Funds:</strong> No holdings rows were matched to this client.</p>`;
      }
      if (option === "Cash Flow in Current Financial Year") {
        const transactions = statementTransactions(client);
        return transactions.length
          ? transactions.map(({ sourceCode, data }) => statementTable(`Cash Flow · FY ${currentYear}-${String(currentYear + 1).slice(-2)} · ${sourceCode}`, data)).join("")
          : `<p class="statement-unavailable"><strong>Cash Flow in Current Financial Year:</strong> No matching dated transactions were imported for this client.</p>`;
      }
      return `<p class="statement-unavailable"><strong>${escapeHTML(option)}:</strong> Data not imported in this preview.</p>`;
    }).join("");
    const total = holdings.reduce((sum, entry) => {
      const amountColumn = findColumn(entry.data.headers, columnAliases.currentValue);
      if (amountColumn < 0) return sum;
      return sum + entry.data.records.reduce((subTotal, record) => {
        const amount = parseAmount(record[amountColumn]);
        return subTotal + (amount === null ? 0 : amount);
      }, 0);
    }, 0);
    const folios = client.folios.length ? client.folios.join(", ") : "Not listed";
    return `<article class="statement-client-report"><div class="statement-client-heading"><div><h3>${escapeHTML(client.label)}</h3><span>Folio${client.folios.length === 1 ? "" : "s"}: ${escapeHTML(folios)}</span></div><div class="statement-client-total"><small>Mutual fund value</small><strong>${holdings.length ? escapeHTML(formatCurrency(total)) : "Not available"}</strong></div></div>${sections}</article>`;
  }).join("");
  const modeLabel = mode === "group" ? "Group wise" : "Customer wise";
  document.querySelector("#consolidated-report-preview").innerHTML =
    `<div class="report-meta"><img class="report-company-logo" src="banisatya-logo.svg" alt="Banisatya Wealth Pvt Ltd"><strong>Banisatya Wealth Pvt Ltd · Consolidated Wealth Portfolio</strong><span>${modeLabel} · Generated ${escapeHTML(generated)}</span></div><p class="statement-report-scope">${clients.length} client${clients.length === 1 ? "" : "s"} included · ${options.length} report section${options.length === 1 ? "" : "s"}</p>${clientReports}<p class="report-note">This statement is generated only from data imported into this workspace. Sections without an imported data source are identified above; verify all figures before relying on them.</p>`;
  document.querySelector("#print-statement").disabled = false;
  document.querySelector("#statement-status").textContent = `Statement ready for ${clients.length} client${clients.length === 1 ? "" : "s"}.`;
  return true;
}

function setView(view) {
  activeView = viewCopy[view] ? view : "Overview";
  const isEmployeeOverview = activeRole === "employee" && activeView === "Overview";
  appScreen.classList.toggle("employee-dashboard-mode", isEmployeeOverview);
  const crmMenuWrap = document.querySelector(".crm-menu-wrap");
  if (isEmployeeOverview) {
    document.querySelector(".employee-crm-slot").append(crmMenuWrap);
  } else {
    document.querySelector(".topbar-actions").insertBefore(crmMenuWrap, document.querySelector("#top-profile"));
  }
  document.querySelectorAll("[data-wealth-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.wealthView === activeView);
  });
  document.querySelectorAll(".nav-link[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  document.querySelector("#breadcrumb-view").textContent = activeView;
  const [title, description] = viewCopy[activeView];
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-description").textContent = activeRole === "employee" && activeView === "Overview"
    ? "Shared portfolio data imported by your distributor."
    : description;
  document.querySelector("#table-title").textContent = CATEGORY_LABELS[currentDataType()];
  document.querySelector("#table-description").textContent = `Latest ${CATEGORY_LABELS[currentDataType()].toLowerCase()} imports`;
  document.querySelector("#transactions-section").hidden = activeView === "Reports" || activeView === "Settings" || isEmployeeOverview;
  document.querySelector("#reports-section").hidden = activeView !== "Reports";
  document.querySelector("#employee-dashboard").hidden = activeRole !== "employee" || activeView !== "Overview";
  document.querySelector("#portfolio-metrics").hidden = activeRole === "employee" || activeView === "Reports" || activeView === "Settings";
  document.querySelector(".import-panel").parentElement.hidden = activeRole === "employee" || activeView === "Reports" || activeView === "Settings";
  document.querySelector("#generate-report").hidden = activeView !== "Reports";
  document.querySelector("#import-cas").hidden = activeRole === "employee" || activeView === "Reports" || activeView === "Settings";
  bulkButton.hidden = activeRole === "employee" || activeView === "Reports" || activeView === "Settings";
  document.querySelector("#clear-data").hidden = activeRole === "employee" || activeView === "Reports" || activeView === "Settings";
  document.querySelector(".settings-link").hidden = false;
  if (activeView === "Reports") renderReport();
  renderRecords();
  document.querySelector("#sidebar").classList.remove("open");
}

function setWorkspaceRole(role, employee = null) {
  activeRole = role;
  const isEmployee = role === "employee";
  const name = isEmployee && employee ? employee.name : "Distributor";
  const designation = isEmployee && employee ? employee.designation : "Local workspace";
  document.querySelector("#wealth-user-name").textContent = name;
  document.querySelector("#wealth-account-name").textContent = name;
  document.querySelector(".sidebar-profile-name").textContent = name;
  document.querySelector("#profile-description").textContent = designation;
  document.querySelector("#top-profile-name").textContent = name;
  document.querySelector("#top-profile-designation").textContent = designation;
  document.querySelectorAll(".profile-initial").forEach((avatar) => {
    avatar.textContent = isEmployee && employee ? employee.initials : "D";
  });
  document.querySelector("#top-profile").setAttribute("aria-label", `${name}, ${designation}`);
  document.querySelector(".demo-banner").textContent = isEmployee
    ? "Shared database connected. Employees can view investor and family reports."
    : "Shared database connected. Uploads are available to your employees on other devices.";
  if (isEmployee) {
    document.querySelector("#employee-welcome-name").textContent = name.split(" ")[0];
    renderEmployeeDashboard();
  }
  if (isEmployee) setView("Overview");
}

document.querySelectorAll(".nav-link[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
const crmMenu = document.querySelector("#crm-menu");
const crmMenuToggle = document.querySelector("#crm-menu-toggle");
const crmMenuWrap = document.querySelector(".crm-menu-wrap");
function closeCrmMenu() {
  crmMenu.hidden = true;
  crmMenuToggle.setAttribute("aria-expanded", "false");
}

crmMenuToggle.addEventListener("click", () => {
  crmMenu.hidden = !crmMenu.hidden;
  crmMenuToggle.setAttribute("aria-expanded", String(!crmMenu.hidden));
  if (!crmMenu.hidden) document.querySelector("#crm-menu-search").focus();
});
document.querySelector("#crm-menu-close").addEventListener("click", closeCrmMenu);
document.querySelector("#crm-menu-search").addEventListener("input", (event) => {
  const query = event.currentTarget.value.trim().toLowerCase();
  document.querySelectorAll(".crm-menu-group").forEach((group) => {
    let visibleItems = 0;
    group.querySelectorAll("button").forEach((item) => {
      const matches = item.textContent.toLowerCase().includes(query);
      item.hidden = !matches;
      if (matches) visibleItems += 1;
    });
    group.querySelectorAll("h4").forEach((heading) => {
      const nextHeading = heading.nextElementSibling;
      let sectionHasMatch = false;
      let sibling = nextHeading;
      while (sibling && sibling.tagName !== "H4" && sibling.tagName !== "H3") {
        if (sibling.matches("button") && !sibling.hidden) sectionHasMatch = true;
        sibling = sibling.nextElementSibling;
      }
      heading.hidden = !sectionHasMatch;
    });
    group.hidden = visibleItems === 0;
  });
  document.querySelector("#crm-menu-empty").hidden = Array.from(document.querySelectorAll(".crm-menu-group"))
    .some((group) => !group.hidden);
});
document.querySelector("#wealth-menu-search").addEventListener("input", (event) => {
  const search = document.querySelector("#crm-menu-search");
  search.value = event.currentTarget.value;
  search.dispatchEvent(new Event("input", { bubbles: true }));
  if (!crmMenu.hidden) return;
  crmMenu.hidden = false;
  crmMenuToggle.setAttribute("aria-expanded", "true");
});
document.querySelectorAll("[data-wealth-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.wealthView));
});
document.querySelectorAll("[data-wealth-message]").forEach((button) => {
  button.addEventListener("click", () => showToast(`${button.dataset.wealthMessage} is not connected in this preview.`));
});
const wealthAccountMenu = document.querySelector("#wealth-account-menu");
const wealthUserButton = document.querySelector("#wealth-user");
function closeWealthAccountMenu() {
  wealthAccountMenu.hidden = true;
  wealthUserButton.setAttribute("aria-expanded", "false");
}

function logoutEmployee() { Portal.logout(); }

wealthUserButton.addEventListener("click", () => {
  wealthAccountMenu.hidden = !wealthAccountMenu.hidden;
  wealthUserButton.setAttribute("aria-expanded", String(!wealthAccountMenu.hidden));
});
document.querySelector("#employee-logout").addEventListener("click", logoutEmployee);
document.addEventListener("click", (event) => {
  if (!wealthAccountMenu.hidden && !event.target.closest(".wealth-account")) closeWealthAccountMenu();
});
crmMenu.querySelectorAll("button[data-crm-view]").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.crmView);
    closeCrmMenu();
    showToast(`${button.textContent} opened.`);
  });
});
crmMenu.querySelectorAll("button[data-crm-report]").forEach((button) => {
  button.addEventListener("click", () => {
    setView("Reports");
    closeCrmMenu();
    document.querySelector("#statement-client-search").focus();
  });
});
crmMenu.querySelectorAll("button[data-crm-message]").forEach((button) => {
  button.addEventListener("click", () => showToast(`${button.textContent} is listed in the CRM menu; this feature is not connected in the preview.`));
});
document.addEventListener("click", (event) => {
  if (!crmMenu.hidden && !event.target.closest(".crm-menu-wrap")) closeCrmMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !crmMenu.hidden) closeCrmMenu();
  if (event.key === "Escape" && !wealthAccountMenu.hidden) closeWealthAccountMenu();
});
document.querySelector("#menu-toggle").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#report-type").addEventListener("change", renderReport);
document.querySelectorAll("[data-business-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-business-metric]").forEach((metricButton) => metricButton.classList.toggle("active", metricButton === button));
    renderEmployeeBusinessChart();
  });
});
["#employee-chart-client", "#employee-chart-type", "#employee-chart-range"].forEach((selector) => {
  document.querySelector(selector).addEventListener("change", renderEmployeeBusinessChart);
});
document.querySelectorAll("[data-statement-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-statement-mode]").forEach((modeButton) => {
      const active = modeButton === button;
      modeButton.classList.toggle("active", active);
      modeButton.setAttribute("aria-pressed", String(active));
    });
    invalidateStatementPreview(button.dataset.statementMode === "customer"
      ? "Select one or more customers, then generate the statement."
      : "Group-wise statement will include all clients unless you select specific clients.");
  });
});
document.querySelector("#statement-client-search").addEventListener("input", filterStatementClients);
document.querySelector("#statement-select-all").addEventListener("click", () => {
  const visible = Array.from(document.querySelectorAll(".statement-client-option:not([hidden]) input"));
  const select = visible.some((input) => !input.checked);
  visible.forEach((input) => { input.checked = select; });
  updateStatementClientCount();
  invalidateStatementPreview("Client selection changed. Generate the statement again.");
});
document.querySelectorAll("[data-statement-option]").forEach((input) => {
  input.addEventListener("change", () => invalidateStatementPreview("Report options changed. Generate the statement again."));
});
document.querySelector("#build-statement").addEventListener("click", renderConsolidatedStatement);
document.querySelector("#print-statement").addEventListener("click", () => {
  if (document.querySelector("#print-statement").disabled) return;
  document.title = "Banisatya Wealth Pvt Ltd - Consolidated Wealth Portfolio";
  document.body.classList.add("statement-print");
  window.print();
});
document.querySelector("#generate-report").addEventListener("click", () => {
  document.title = `Banisatya Wealth Pvt Ltd - ${document.querySelector("#report-type").selectedOptions[0].text} Report`;
  document.body.classList.add("report-print");
  window.print();
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("report-print");
  document.body.classList.remove("statement-print");
  document.title = `Banisatya Wealth Pvt Ltd — ${activeRole === "employee" ? "Employee" : "Distributor"} Dashboard`;
});
document.querySelector("#sign-out").addEventListener("click", (event) => {
  event.preventDefault();
  if (activeRole === "employee") {
    logoutEmployee();
    return;
  }
  Portal.logout();
});
document.querySelector("#profile-button").addEventListener("click", () => showToast(`Local ${activeRole} workspace`));
document.querySelector("#top-profile").addEventListener("click", () => showToast(document.querySelector("#top-profile").getAttribute("aria-label")));

const today = new Date();
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "long", day: "2-digit", month: "long", year: "numeric"
}).format(today).toUpperCase();
restoreDatasets();
renderRecords();
renderReport();
refreshStatementClientList();
window.addEventListener("portal-state", () => {
  Object.keys(datasets).forEach(code => delete datasets[code]);
  restoreDatasets();renderRecords();renderReport();refreshStatementClientList();renderEmployeeDashboard();
});
if (Portal.user && !Portal.user.mustChangePassword) {
  const user = Portal.user;
  setWorkspaceRole(user.role, {name:user.name, designation:user.role === "employee" ? "Employee" : "Distributor", initials:user.name.split(/\s+/).map(s=>s[0]).join("").slice(0,2)});
  loginScreen.classList.add("hidden");appScreen.classList.remove("hidden");
} else {loginScreen.classList.remove("hidden");appScreen.classList.add("hidden");}
