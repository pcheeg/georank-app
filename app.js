/* GeoRank v0.1 */

const START_DATE_UTC = Date.UTC(2026, 5, 17, 0, 0, 0); // 17 June 2026 00:00 GMT
const DAY_MS = 86400000;
const LS_KEY = "georank:v0.2";

const GOOD_REFERENCE_CAPITALS = new Set([
  "London","Paris","Madrid","Rome","Athens","Cairo","Nairobi","Ottawa","Washington D.C.","Washington, D.C.","Washington",
  "Mexico City","Buenos Aires","Brasília","Tokyo","Bangkok","Canberra","Berlin","Vienna","Warsaw",
  "Lima","Santiago","Ankara","Jakarta","New Delhi","Seoul","Rabat","Tunis","Dublin"
]);
const HARD_REFERENCE_CAPITALS = new Set([
  "Astana","Tashkent","Ulaanbaatar","Dushanbe","Yerevan","Bishkek","Ljubljana","Skopje","Tbilisi",
  "Kigali","Baku","Doha","Muscat","Amman","Tirana","Chisinau","Vilnius","Riga","Tallinn",
  "Hanoi","Vientiane","Phnom Penh","Kathmandu","Thimphu","Asunción","Montevideo","Quito"
]);
const WEAK_REFERENCE_CAPITALS = new Set([
  "Reykjavik","Wellington","Oslo","Suva","Ngerulmud","Funafuti","Majuro","Tarawa","Palikir","Nukuʻalofa"
]);
const OCEANIA_COUNTRIES = new Set([
  "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia", "Nauru",
  "New Zealand", "Palau", "Papua New Guinea", "Samoa", "Solomon Islands",
  "Tonga", "Tuvalu", "Vanuatu"
]);
const FLAG_FORBIDDEN_PAIRS = [
  ["Chad", "Romania"],
  ["Monaco", "Indonesia"],
  ["Netherlands", "Luxembourg"]
];
const FLAG_SIMILAR_GROUPS = [
  ["Jordan", "Iraq", "Sudan", "Syria", "Palestine"],
  ["Iran", "Tajikistan", "Hungary"],
  ["Romania", "Moldova", "Andorra"],
  ["Senegal", "Mali", "Guinea", "Cameroon"],
  ["Ireland", "Ivory Coast"],
  ["Poland", "Monaco", "Indonesia"]
];

const CATEGORY_LABELS = {
  distance: { icon: "🌍", title: "Distance Day" },
  capitalAZ: { icon: "🏛️", title: "Capital Day" },
  flagsCapitalAZ: { icon: "🚩", title: "Flag Day" },
  knowledge: { icon: "📊", title: "Knowledge Day" },
  equator: { icon: "🌎", title: "Equator Day" }
};

const COUNTRIES_CLEAN = COUNTRIES.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function sample(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function toRad(deg) { return deg * Math.PI / 180; }
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function alphabetValue(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function fmtKm(v) { return `${Math.round(v).toLocaleString()} km`; }
function fmtPop(v) { return v >= 1000000 ? `${(v/1000000).toFixed(v>=10000000?1:2)}m` : Math.round(v).toLocaleString(); }
function fmtArea(v) { return `${Math.round(v).toLocaleString()} km²`; }
function fmtCoast(v) { return `${Math.round(v).toLocaleString()} km`; }
function fmtHeight(v) { return `${Math.round(v).toLocaleString()} m`; }
function isOceaniaCountry(country) { return OCEANIA_COUNTRIES.has(country.country); }
function oceaniaCount(items) { return items.filter(isOceaniaCountry).length; }
function passesOceaniaLimit(items) { return oceaniaCount(items) <= 1; }
function nameOf(c) { return c.displayCountry || c.country; }
function idOf(c) { return c.cca3 || c.country; }

function getPuzzleNo(now = new Date()) {
  const n = Math.floor((now.getTime() - START_DATE_UTC) / DAY_MS) + 1;
  return Math.max(1, n);
}
function getPuzzleDate(puzzleNo) {
  return new Date(START_DATE_UTC + (puzzleNo - 1) * DAY_MS);
}
function getCategoryForPuzzleNo(puzzleNo) {
  const d = getPuzzleDate(puzzleNo).getUTCDay(); // Sun=0
  if (d === 1) return "distance";
  if (d === 2) return "capitalAZ";
  if (d === 3) return "distance";
  if (d === 4) return "flagsCapitalAZ";
  if (d === 5) return "distance";
  if (d === 6) return "knowledge";
  return "equator";
}
function nextResetText() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0,0,0));
  const diff = Math.max(0, next - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function referenceCandidatesForPuzzleNo(puzzleNo) {
  const wellKnown = COUNTRIES_CLEAN.filter(c => GOOD_REFERENCE_CAPITALS.has(c.capital) && !WEAK_REFERENCE_CAPITALS.has(c.capital));
  const hard = COUNTRIES_CLEAN.filter(c => HARD_REFERENCE_CAPITALS.has(c.capital) && !WEAK_REFERENCE_CAPITALS.has(c.capital));
  const useWellKnown = mulberry32(hashString(`GeoRank:referenceTier:${puzzleNo}`))() < 0.5;
  const combined = useWellKnown ? [...wellKnown, ...hard] : [...hard, ...wellKnown];
  return combined
    .map(c => ({ c, sort: hashString(`GeoRank:referenceCandidate:${puzzleNo}:${c.country}:${c.capital}`) }))
    .sort((a,b) => a.sort - b.sort)
    .map(x => x.c);
}
function referenceForPuzzleNo(puzzleNo) {
  const recent = [];
  let selected = null;
  for (let n = 1; n <= puzzleNo; n++) {
    const candidates = referenceCandidatesForPuzzleNo(n);
    selected = candidates.find(c => !recent.includes(c.capital)) || candidates[0];
    recent.push(selected.capital);
    while (recent.length > 30) recent.shift();
  }
  return selected;
}

function makeDistancePuzzle(rng, puzzleNo, excludeCountries = new Set()) {
  const reference = referenceForPuzzleNo(puzzleNo);
  let best = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    const candidates = shuffle(COUNTRIES_CLEAN.filter(c => c.country !== reference.country && !excludeCountries.has(c.country)), rng).slice(0, 10);
    const items = candidates.map(c => ({...c, value: haversineKm(reference, c)}));
    if (!passesOceaniaLimit(items)) continue;
    if (new Set(items.map(i => Math.round(i.value))).size < 10) continue;
    const sorted = [...items].sort((a,b) => a.value - b.value);
    const gaps = sorted.slice(1).map((x,i) => x.value - sorted[i].value);
    const closeCalls = gaps.filter(g => g < 650).length;
    const veryClose = gaps.filter(g => g < 350).length;
    const latSpread = Math.max(...items.map(i => i.lat)) - Math.min(...items.map(i => i.lat));
    const lngSpread = Math.max(...items.map(i => i.lng)) - Math.min(...items.map(i => i.lng));
    const tooObviousExtremes = gaps[0] > 1500 || gaps[gaps.length-1] > 2500;
    const quality = closeCalls*12 + veryClose*8 + Math.min(latSpread, 110)/10 + Math.min(lngSpread, 220)/18 - (tooObviousExtremes ? 22 : 0);
    if (!best || quality > best.quality) best = {items, sorted, quality};
  }
  return makePuzzleObject({
    type: "distance",
    icon: "🌍",
    title: "Distance Day",
    instruction: `Order these capital cities by distance from ${reference.capital} (closest → furthest).`,
    referenceText: `${reference.flag} Reference: ${reference.capital}`,
    promptItems: shuffle(best.items, rng),
    answerItems: best.sorted,
    label: item => item.capital,
    subLabel: item => item.flag,
    valueLabel: item => fmtKm(item.value)
  });
}
function makeEquatorPuzzle(rng, excludeCountries = new Set()) {
  let best = null;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const north = shuffle(COUNTRIES_CLEAN.filter(c => c.lat > 0 && !excludeCountries.has(c.country)), rng).slice(0, 5 + Math.floor(rng()*2));
    const south = shuffle(COUNTRIES_CLEAN.filter(c => c.lat < 0 && !excludeCountries.has(c.country)), rng).slice(0, 10 - north.length);
    const items = shuffle([...north, ...south], rng).map(c => ({...c, value: Math.abs(c.lat)}));
    if (items.length !== 10) continue;
    if (!passesOceaniaLimit(items)) continue;
    if (items.filter(i => i.lat > 0).length < 3 || items.filter(i => i.lat < 0).length < 3) continue;
    const sorted = [...items].sort((a,b) => a.value - b.value);
    const gaps = sorted.slice(1).map((x,i) => x.value - sorted[i].value);
    const crossClose = sorted.slice(1).filter((x,i) => Math.sign(x.lat) !== Math.sign(sorted[i].lat) && Math.abs(x.value - sorted[i].value) < 8).length;
    const closeCalls = gaps.filter(g => g < 6).length;
    const extremesPenalty = sorted[0].value < 1 ? 8 : 0;
    const quality = closeCalls*10 + crossClose*20 - extremesPenalty;
    if (!best || quality > best.quality) best = {items, sorted, quality};
  }
  return makePuzzleObject({
    type: "equator",
    icon: "🌎",
    title: "Equator Day",
    instruction: "Order these capital cities by distance from the Equator (closest → furthest).",
    referenceText: null,
    promptItems: shuffle(best.items, rng),
    answerItems: best.sorted,
    label: item => item.capital,
    subLabel: item => item.flag,
    valueLabel: item => `${item.value.toFixed(2)}° ${item.lat >= 0 ? "N" : "S"}`
  });
}
function difficultySample(rng, pattern, excludeCountries = new Set()) {
  const buckets = {
    easy: COUNTRIES_CLEAN.filter(c => c.difficulty === "easy" && !excludeCountries.has(c.country)),
    medium: COUNTRIES_CLEAN.filter(c => c.difficulty === "medium" && !excludeCountries.has(c.country)),
    hard: COUNTRIES_CLEAN.filter(c => c.difficulty === "hard" && !excludeCountries.has(c.country)),
    veryHard: COUNTRIES_CLEAN.filter(c => c.difficulty === "veryHard" && !excludeCountries.has(c.country))
  };
  let picked = [];
  for (const [diff, count] of Object.entries(pattern)) picked.push(...shuffle(buckets[diff] || [], rng).slice(0, count));
  while (picked.length < 10) picked.push(sample(COUNTRIES_CLEAN, rng));
  picked = [...new Map(picked.map(x => [x.country, x])).values()];
  while (picked.length < 10) {
    const candidate = sample(COUNTRIES_CLEAN.filter(c => !excludeCountries.has(c.country)), rng);
    if (!picked.some(x => x.country === candidate.country)) picked.push(candidate);
  }
  return shuffle(picked.slice(0,10), rng);
}
function makeCapitalAZPuzzle(rng, excludeCountries = new Set()) {
  let best = null;
  for (let attempt = 0; attempt < 500; attempt++) {
    const items = difficultySample(rng, { easy: 1, medium: 4, hard: 4, veryHard: 1 }, excludeCountries);
    if (!passesOceaniaLimit(items)) continue;
    const sorted = [...items].sort((a,b) => alphabetValue(a.capital).localeCompare(alphabetValue(b.capital)));
    const initials = new Set(items.map(i => alphabetValue(i.capital)[0]));
    const quality = 25 - initials.size + items.filter(i => i.difficulty === "hard").length*6 + items.filter(i => i.difficulty === "veryHard").length*10;
    if (!best || quality > best.quality) best = {items, sorted, quality};
  }
  return makePuzzleObject({
    type: "capitalAZ",
    icon: "🏛️",
    title: "Capital Day",
    instruction: "Order these countries by the alphabetical order of their capital cities (A-Z).",
    referenceText: "Country → Capital → A-Z",
    promptItems: shuffle(best.items, rng),
    answerItems: best.sorted,
    label: item => nameOf(item),
    subLabel: item => item.flag,
    valueLabel: item => item.capital
  });
}
function hasForbiddenFlagPair(items) {
  const names = new Set(items.map(i => i.country));
  return FLAG_FORBIDDEN_PAIRS.some(([a,b]) => names.has(a) && names.has(b));
}
function similarFlagBonus(items) {
  const names = new Set(items.map(i => i.country));
  return FLAG_SIMILAR_GROUPS.reduce((sum, group) => {
    const count = group.filter(g => names.has(g)).length;
    return sum + (count >= 2 ? count * 10 : 0);
  }, 0);
}
function makeFlagsCapitalAZPuzzle(rng, excludeCountries = new Set()) {
  let best = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    const items = difficultySample(rng, { easy: 1, medium: 3, hard: 4, veryHard: 2 }, excludeCountries);
    if (!passesOceaniaLimit(items)) continue;
    if (hasForbiddenFlagPair(items)) continue;
    const sorted = [...items].sort((a,b) => alphabetValue(a.capital).localeCompare(alphabetValue(b.capital)));
    const quality = similarFlagBonus(items) + items.filter(i => i.difficulty === "hard").length*8 + items.filter(i => i.difficulty === "veryHard").length*12;
    if (!best || quality > best.quality) best = {items, sorted, quality};
  }
  return makePuzzleObject({
    type: "flagsCapitalAZ",
    icon: "🚩",
    title: "Flag Day",
    instruction: "Order these flags by the alphabetical order of their capital cities (A-Z).",
    referenceText: "Flag → Country → Capital → A-Z",
    promptItems: shuffle(best.items, rng),
    answerItems: best.sorted,
    label: item => item.flag,
    subLabel: () => "",
    valueLabel: item => `${nameOf(item)} — ${item.capital}`
  });
}
function makeKnowledgePuzzle(rng, excludeCountries = new Set()) {
  const r = rng();
  const metric = r < .4 ? "population" : r < .8 ? "areaKm2" : r < .9 ? "highestPointM" : "coastlineKm";
  const meta = {
    population: ["Population", "Order these countries by population (largest → smallest).", fmtPop],
    areaKm2: ["Area", "Order these countries by area (largest → smallest).", fmtArea],
    highestPointM: ["Highest Point", "Order these countries by highest point elevation (highest → lowest).", fmtHeight],
    coastlineKm: ["Coastline", "Order these countries by coastline length (longest → shortest).", fmtCoast]
  }[metric];
  let best = null;
  const pool = COUNTRIES_CLEAN.filter(c => !excludeCountries.has(c.country) && Number.isFinite(c[metric]) && (metric !== "coastlineKm" || c.coastlineKm > 0));
  for (let attempt = 0; attempt < 1000; attempt++) {
    let items = shuffle(pool, rng).slice(0,10).map(c => ({...c, value: c[metric]}));
    if (!passesOceaniaLimit(items)) continue;
    if (new Set(items.map(i => Math.round(i.value))).size < 10) continue;
    const sorted = [...items].sort((a,b) => b.value - a.value);
    const values = sorted.map(i => i.value);
    const logRange = Math.log(Math.max(...values)+1) - Math.log(Math.min(...values)+1);
    const giantPenalty = items.filter(i => ["China","India","United States","Russia","Canada","Brazil"].includes(i.country)).length * 10;
    const tinyPenalty = items.filter(i => i.areaKm2 < 1000 || i.population < 100000).length * 8;
    const quality = 80 - Math.abs(logRange - 2.1) * 18 - giantPenalty - tinyPenalty;
    if (!best || quality > best.quality) best = {items, sorted, quality, metric};
  }
  return makePuzzleObject({
    type: "knowledge",
    icon: "📊",
    title: `${meta[0]} Day`,
    instruction: meta[1],
    referenceText: null,
    promptItems: shuffle(best.items, rng),
    answerItems: best.sorted,
    label: item => nameOf(item),
    subLabel: item => item.flag,
    valueLabel: item => meta[2](item.value)
  });
}
function makePuzzleObject(p) {
  const answerIndex = new Map(p.answerItems.map((item, idx) => [idOf(item), idx]));
  return {...p, answerIndex};
}
const PUZZLE_CACHE = new Map();
function previousDayCountryCooldown(puzzleNo) {
  if (puzzleNo <= 1) return new Set();
  const previous = makePuzzle(puzzleNo - 1);
  return new Set(previous.answerItems.map(item => item.country));
}
function makePuzzle(puzzleNo) {
  if (PUZZLE_CACHE.has(puzzleNo)) return PUZZLE_CACHE.get(puzzleNo);
  const rng = mulberry32(hashString(`GeoRank:${puzzleNo}:v0.2`));
  const category = getCategoryForPuzzleNo(puzzleNo);
  const excludeCountries = previousDayCountryCooldown(puzzleNo);
  let made;
  if (category === "distance") made = makeDistancePuzzle(rng, puzzleNo, excludeCountries);
  else if (category === "capitalAZ") made = makeCapitalAZPuzzle(rng, excludeCountries);
  else if (category === "flagsCapitalAZ") made = makeFlagsCapitalAZPuzzle(rng, excludeCountries);
  else if (category === "equator") made = makeEquatorPuzzle(rng, excludeCountries);
  else made = makeKnowledgePuzzle(rng, excludeCountries);
  PUZZLE_CACHE.set(puzzleNo, made);
  return made;
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveState(state) { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function defaultStats() {
  return { currentStreak: 0, bestStreak: 0, gamesPlayed: 0, totalScore: 0, highestScore: 0, perfectScores: 0, lastPlayedPuzzleNo: null, results: {} };
}
function getState() {
  const state = {...defaultStats(), ...loadState()};
  state.results = state.results || {};
  const today = getPuzzleNo();
  if (state.lastPlayedPuzzleNo && state.lastPlayedPuzzleNo < today - 1) state.currentStreak = 0;
  return state;
}
function applyResultToStats(score, puzzleNo, feedback, orderIds, feedbackDetails) {
  const state = getState();
  if (!state.results[puzzleNo]) {
    const yesterday = puzzleNo - 1;
    state.currentStreak = state.lastPlayedPuzzleNo === yesterday ? state.currentStreak + 1 : 1;
    state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
    state.gamesPlayed += 1;
    state.totalScore += score;
    state.highestScore = Math.max(state.highestScore, score);
    if (score === 1000) state.perfectScores += 1;
    state.lastPlayedPuzzleNo = puzzleNo;
  }
  state.results[puzzleNo] = { score, feedback, orderIds, feedbackDetails, completedAt: new Date().toISOString() };
  saveState(state);
}

let app = document.getElementById('app');
let puzzleNo = getPuzzleNo();
let puzzle = makePuzzle(puzzleNo);
let currentOrder = [...puzzle.promptItems];
let isRevealing = false;

function renderHome() {
  puzzleNo = getPuzzleNo();
  puzzle = makePuzzle(puzzleNo);
  currentOrder = [...puzzle.promptItems];
  const state = getState();
  saveState(state);
  const done = state.results[puzzleNo];
  app.innerHTML = `
    <section class="screen">
      <div class="brand"><div class="logo">GeoRank</div><div class="pill">#${puzzleNo}</div></div>
      <div class="hero">
        <div class="card">
          <div class="kicker">Today's puzzle</div>
          <div class="category">${puzzle.icon} ${puzzle.title}</div>
          <p class="subtle">${puzzle.instruction}</p>
          ${puzzle.referenceText ? `<div class="pill" style="display:inline-flex;margin-top:4px;">${puzzle.referenceText}</div>` : ``}
        </div>
        <div class="stats-row">
          <div class="stat"><strong>${state.currentStreak || 0}</strong><span>Current streak</span></div>
          <div class="stat"><strong>${state.bestStreak || 0}</strong><span>Best streak</span></div>
        </div>
      </div>
      <div class="btns">
        <button class="btn" id="playBtn">${done ? 'Admire' : 'Play'}</button>
        <button class="btn secondary" id="statsBtn">Stats</button>
      </div>
      <div class="tiny" style="text-align:center;">Next puzzle in <span id="countdown">${nextResetText()}</span></div>
    </section>`;
  document.getElementById('playBtn').onclick = () => done ? renderFinalResult(done, false) : renderGame();
  document.getElementById('statsBtn').onclick = renderStats;
  tickCountdown();
}
let countdownTimer;
function tickCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const el = document.getElementById('countdown');
    if (el) el.textContent = nextResetText();
  }, 1000);
}
function renderGame() {
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div class="title-block">
          <div class="kicker">GeoRank #${puzzleNo}</div>
          <div class="title">${puzzle.icon} ${puzzle.title}</div>
          <div class="instruction">${puzzle.instruction}</div>
        </div>
        <button class="pill" id="homeBtn">Home</button>
      </div>
      ${puzzle.referenceText ? `<div class="pill" style="align-self:flex-start;">${puzzle.referenceText}</div>` : ``}
      <div class="list" id="rankList"></div>
      <button class="btn" id="submitBtn">Submit Ranking</button>
    </section>`;
  document.getElementById('homeBtn').onclick = renderHome;
  document.getElementById('submitBtn').onclick = confirmSubmit;
  renderRows();
}
function renderRows(classes = [], placeholderId = null) {
  const list = document.getElementById('rankList');
  if (!list) return;
  list.innerHTML = currentOrder.map((item, idx) => rowHtml(item, idx, classes[idx] || '', placeholderId === idOf(item))).join('');
  setupDrag(list);
}
function rowHtml(item, idx, cls = '', placeholder = false) {
  const sub = puzzle.subLabel(item);
  return `<div class="row ${cls} ${placeholder ? 'placeholder' : ''}" data-id="${idOf(item)}">
    <span class="handle">☰</span><span class="rank">${idx+1}</span>
    <span class="item-main">${puzzle.label(item)}</span>${sub ? `<span class="item-sub">${sub}</span>` : ``}
  </div>`;
}
function setupDrag(list) {
  let drag = null;

  function indexFromY(clientY) {
    const rect = list.getBoundingClientRect();
    const rowH = rect.height / 10;
    return Math.max(0, Math.min(9, Math.floor((clientY - rect.top) / rowH)));
  }

  list.querySelectorAll('.row').forEach(row => {
    row.onpointerdown = (e) => {
      if (isRevealing) return;
      e.preventDefault();
      const id = row.dataset.id;
      const startIndex = currentOrder.findIndex(item => idOf(item) === id);
      if (startIndex < 0) return;

      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.position = 'fixed';
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '999';
      document.body.appendChild(ghost);

      drag = {
        id,
        item: currentOrder[startIndex],
        index: startIndex,
        offsetY: e.clientY - rect.top,
        ghost,
        pointerId: e.pointerId
      };

      renderRows([], id);
      document.addEventListener('pointermove', onDragMove, { passive: false });
      document.addEventListener('pointerup', onDragEnd, { passive: false });
      document.addEventListener('pointercancel', onDragEnd, { passive: false });
    };
  });

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.ghost.style.top = `${e.clientY - drag.offsetY}px`;
    const newIndex = indexFromY(e.clientY);
    if (newIndex !== drag.index) {
      const oldIndex = currentOrder.findIndex(item => idOf(item) === drag.id);
      const [moved] = currentOrder.splice(oldIndex, 1);
      currentOrder.splice(newIndex, 0, moved);
      drag.index = newIndex;
      renderRows([], drag.id);
    }
  }

  function onDragEnd(e) {
    if (!drag) return;
    e.preventDefault();
    drag.ghost.remove();
    drag = null;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    renderRows();
  }
}
function confirmSubmit() {
  showModal('Submit your ranking?', 'You won’t be able to change your answer afterwards.', 'Submit', () => {
    hideModal();
    startReveal();
  });
}
function showModal(title, body, primary, onPrimary) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.id = 'modalWrap';
  wrap.innerHTML = `<div class="modal"><h2>${title}</h2><p>${body}</p><div class="btns"><button class="btn secondary" id="modalCancel">Cancel</button><button class="btn" id="modalOk">${primary}</button></div></div>`;
  document.body.appendChild(wrap);
  document.getElementById('modalCancel').onclick = hideModal;
  document.getElementById('modalOk').onclick = onPrimary;
}
function hideModal() { document.getElementById('modalWrap')?.remove(); }
function getFeedbackForOrder(order) {
  return order.map((item, idx) => {
    const correct = puzzle.answerIndex.get(idOf(item));
    const rawMove = correct - idx;
    const abs = Math.abs(rawMove);
    let color = 'red', emoji = '🟥', points = 0;
    if (abs === 0) { color = 'green'; emoji = '🟩'; points = 100; }
    else if (abs === 1) { color = 'yellow'; emoji = '🟨'; points = 50; }
    else if (abs === 2) { color = 'orange'; emoji = '🟧'; points = 25; }
    return {
      id: idOf(item),
      color,
      emoji,
      points,
      submittedIndex: idx,
      correctIndex: correct,
      move: rawMove
    };
  });
}
function feedbackText(feedback) {
  return feedback.map(f => typeof f === 'string' ? f : f.emoji).join('');
}
function startReveal() {
  isRevealing = true;
  document.getElementById('submitBtn').disabled = true;
  const feedback = getFeedbackForOrder(currentOrder);
  const classes = Array(10).fill('');
  let i = 0;
  const step = () => {
    if (i < 10) {
      classes[i] = feedback[i].color;
      renderRows(classes);
      i++;
      setTimeout(step, 260);
    } else {
      const score = feedback.reduce((s,f) => s + f.points, 0);
      const orderIds = currentOrder.map(idOf);
      applyResultToStats(score, puzzleNo, feedback.map(f => f.emoji).join(''), orderIds, feedback);
      setTimeout(() => renderRevealScore(score, feedback), 350);
    }
  };
  step();
}
function renderRevealScore(score, feedback) {
  const list = document.getElementById('rankList');
  if (!list) return;
  const top = document.createElement('div');
  top.className = 'result-top score-pop';
  top.innerHTML = `<div class="result-score">${score}</div><div class="feedback">${feedback.map(f=>f.emoji).join('')}</div>`;
  list.parentElement.insertBefore(top, list);
  setTimeout(() => {
    currentOrder = [...puzzle.answerItems];
    renderRows(Array(10).fill(''));
    setTimeout(() => { const state = getState(); renderAdmireResult(state.results[puzzleNo], true); }, 900);
  }, 1100);
}
function itemById(id) {
  return COUNTRIES_CLEAN.find(c => idOf(c) === id) || puzzle.answerItems.find(c => idOf(c) === id);
}
function resultFeedbackDetails(result) {
  if (Array.isArray(result.feedbackDetails)) return result.feedbackDetails;
  const order = result.orderIds ? result.orderIds.map(itemById).filter(Boolean) : puzzle.answerItems;
  return getFeedbackForOrder(order);
}
function resultOrderItems(result) {
  if (Array.isArray(result.orderIds)) return result.orderIds.map(itemById).filter(Boolean);
  return puzzle.answerItems;
}
function moveLabel(move) {
  if (move === 0) return '✓';
  if (move < 0) return `↑${Math.abs(move)}`;
  return `↓${move}`;
}
function renderAdmireResult(result, fresh) {
  const order = resultOrderItems(result);
  const details = resultFeedbackDetails(result);
  const rows = order.map((item, idx) => {
    const f = details[idx] || { color: 'red', move: 0 };
    return `<div class="value-row ${f.color}"><span class="rank">${idx+1}</span><span class="item-main">${puzzle.label(item)}</span><span class="val">${moveLabel(f.move)}</span></div>`;
  }).join('');
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div class="title-block"><div class="kicker">GeoRank #${puzzleNo}</div><div class="title">Admire</div></div>
        <button class="pill" id="homeBtn">Home</button>
      </div>
      <div class="result-top ${fresh ? 'score-pop' : ''}">
        <div class="result-score">${result.score}</div>
        <div class="feedback">${result.feedback}</div>
        <div class="tiny">Your submitted order · arrows show where each item should move</div>
      </div>
      <div class="values-list">${rows}</div>
      <div class="btns"><button class="btn secondary" id="answersBtn">Answers</button><button class="btn" id="shareBtn">Share</button></div>
    </section>`;
  document.getElementById('homeBtn').onclick = renderHome;
  document.getElementById('answersBtn').onclick = () => renderAnswersResult(result);
  document.getElementById('shareBtn').onclick = () => shareResult(result);
}
function renderAnswersResult(result) {
  const values = puzzle.answerItems.map((item, idx) => `
    <div class="value-row"><span class="rank">${idx+1}</span><span class="item-main">${puzzle.label(item)}</span><span class="val">${puzzle.valueLabel(item)}</span></div>`).join('');
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div class="title-block"><div class="kicker">GeoRank #${puzzleNo}</div><div class="title">Answers</div></div>
        <button class="pill" id="homeBtn">Home</button>
      </div>
      <div class="result-top">
        <div class="result-score">${result.score}</div>
        <div class="feedback">${result.feedback}</div>
        ${puzzle.referenceText ? `<div class="tiny">${puzzle.referenceText}</div>` : ``}
      </div>
      <div class="values-list">${values}</div>
      <div class="btns"><button class="btn secondary" id="admireBtn">Admire</button><button class="btn" id="shareBtn">Share</button></div>
    </section>`;
  document.getElementById('homeBtn').onclick = renderHome;
  document.getElementById('admireBtn').onclick = () => renderAdmireResult(result, false);
  document.getElementById('shareBtn').onclick = () => shareResult(result);
}
function shareText(result) {
  return `GeoRank #${puzzleNo}\n${puzzle.icon} ${puzzle.title}\n\n${result.score}\n\n${result.feedback}`;
}
async function shareResult(result) {
  const text = shareText(result);
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      showModal('Copied', 'Your GeoRank result has been copied to your clipboard.', 'Nice', hideModal);
    }
  } catch {}
}
function renderStats() {
  const state = getState();
  const avg = state.gamesPlayed ? Math.round(state.totalScore / state.gamesPlayed) : 0;
  app.innerHTML = `
    <section class="screen">
      <div class="brand"><div class="logo">Stats</div><button class="pill" id="homeBtn">Home</button></div>
      <div class="hero">
        <div class="stats-row">
          <div class="stat"><strong>${state.currentStreak || 0}</strong><span>Current streak</span></div>
          <div class="stat"><strong>${state.bestStreak || 0}</strong><span>Best streak</span></div>
          <div class="stat"><strong>${state.gamesPlayed || 0}</strong><span>Played</span></div>
          <div class="stat"><strong>${avg}</strong><span>Average</span></div>
          <div class="stat"><strong>${state.highestScore || 0}</strong><span>Highest</span></div>
          <div class="stat"><strong>${state.perfectScores || 0}</strong><span>Perfects</span></div>
        </div>
      </div>
      <button class="btn" id="backBtn">Back</button>
    </section>`;
  document.getElementById('homeBtn').onclick = renderHome;
  document.getElementById('backBtn').onclick = renderHome;
}

// Prevent double-tap zoom in iOS Safari/PWA.
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

renderHome();
