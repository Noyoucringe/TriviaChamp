// TriviaChamp Web - mirrors the Java console app
// Features: offline/online, categories, difficulty, timed questions, leaderboard

const els = {
  setup: document.getElementById('setup'),
  setupForm: document.getElementById('setup-form'),
  name: document.getElementById('player-name'),
  mode: document.getElementById('mode'),
  category: document.getElementById('category'),
  subjectTiles: document.querySelectorAll('.subject-tiles .tile'),
  difficultyWrap: document.getElementById('difficulty-wrap'),
  difficulty: document.getElementById('difficulty'),
  numQuestions: document.getElementById('num-questions'),
  numQuestionsWrap: document.getElementById('num-questions-wrap'),
  offlineDiffToggle: document.getElementById('offline-diff-toggle'),
  offlineDiffToggleWrap: document.getElementById('offline-diff-toggle-wrap'),

  quiz: document.getElementById('quiz'),
  qCounter: document.getElementById('question-counter'),
  timer: document.getElementById('timer'),
  qText: document.getElementById('question-text'),
  options: document.getElementById('options'),
  submit: document.getElementById('submit-answer'),
  skip: document.getElementById('skip'),
  endSession: document.getElementById('end-session'),

  results: document.getElementById('results'),
  scoreLine: document.getElementById('score-line'),
  playAgain: document.getElementById('play-again'),
  goHome: document.getElementById('go-home'),

  leaderboardList: document.getElementById('leaderboard-list'),
  clearLeaderboard: document.getElementById('clear-leaderboard'),
  repairLeaderboards: document.getElementById('repair-leaderboards'),
  quickStart: document.getElementById('quick-start'),
  daily: document.getElementById('daily-challenge'),
  lastSettings: document.getElementById('last-settings'),
  subtitle: document.getElementById('subtitle'),
};

// Category mapping mirrors Java getCategory
// 19: Math (Science: Mathematics), 18: CS (Science: Computers), 17: Science & Nature, 23: History
const CATEGORY_NAMES = { '19': 'Math', '18': 'CS', '17': 'Science', '23': 'History' };

// Offline question bank per category (built-in minimal)
const OFFLINE_BANK_BUILTIN = {
  '19': [
    { q: 'What is 7 x 8?', a: '56', opts: ['54','56','64','58'] },
    { q: 'Square root of 81?', a: '9', opts: ['8','9','7','6'] },
    { q: 'What is 12 + 15?', a: '27', opts: ['26','27','28','25'] },
    { q: 'What is 5! ?', a: '120', opts: ['60','100','120','150'] },
  ],
  '18': [
    { q: 'What does CPU stand for?', a: 'Central Processing Unit', opts: ['Central Process Unit','Central Processing Unit','Computer Personal Unit','Central Power Unit'] },
    { q: 'Binary of 5?', a: '101', opts: ['110','100','101','111'] },
    { q: 'HTTP stands for?', a: 'HyperText Transfer Protocol', opts: ['HyperText Transfer Protocol','HighText Transfer Protocol','HyperTransfer Text Protocol','HyperText Transmission Protocol'] },
  ],
  '17': [
    { q: 'Which gas do plants absorb?', a: 'Carbon Dioxide', opts: ['Oxygen','Carbon Dioxide','Nitrogen','Hydrogen'] },
    { q: 'Water chemical formula?', a: 'H2O', opts: ['H2O','CO2','O2','NaCl'] },
    { q: 'Human body has how many lungs?', a: '2', opts: ['1','2','3','4'] },
  ],
  '23': [
    { q: 'Who was the first President of the USA?', a: 'George Washington', opts: ['Abraham Lincoln','Thomas Jefferson','George Washington','John Adams'] },
    { q: 'The Great Wall is in which country?', a: 'China', opts: ['India','China','Japan','Mongolia'] },
    { q: 'World War II ended in?', a: '1945', opts: ['1939','1942','1945','1948'] },
  ],
};

// Cache for loaded JSON banks
const offlineBankCache = {};

async function loadOfflineBank(category){
  if (offlineBankCache[category]) return offlineBankCache[category];
  const fileMap = { '19': 'math', '18': 'cs', '17': 'science', '23': 'history' };
  const name = fileMap[category];
  let loaded = [];
  if (name){
    try{
      const res = await fetch(`data/${name}.json`, { headers: { 'Accept': 'application/json' } });
      if (res.ok){
        loaded = await res.json();
      }
    }catch(err){ console.warn('Offline bank load failed:', err); }
  }
  const builtin = OFFLINE_BANK_BUILTIN[category] || [];
  const merged = Array.isArray(loaded) && loaded.length ? [...loaded, ...builtin] : builtin;
  offlineBankCache[category] = merged;
  return merged;
}

let state = {
  name: '',
  mode: 'offline',
  category: '19',
  difficulty: 'easy',
  offlineShowDifficulty: false,
  numQuestions: 5,
  questions: [],
  idx: 0,
  score: 0,
  timerId: null,
  timeLeft: 0,
  selected: null,
  quizStartAt: 0,
};

// ----- Presence (online users) -----
let presenceHeartbeatId = null;
let presencePollId = null;
function getClientId(){
  try{
    let id = localStorage.getItem('trivia_client_id');
    if (!id){
      id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem('trivia_client_id', id);
    }
    return id;
  }catch{ return Math.random().toString(36).slice(2); }
}
async function presencePing(){
  try{
    await fetch(apiUrl('/api/presence'), {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ id: getClientId(), name: state.name || els.name?.value || 'Player' })
    });
  }catch{}
}
async function presenceFetchCount(){
  try{
    const res = await fetch(apiUrl('/api/presence'));
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data.online || 0);
  }catch{ return null; }
}
function updateOnlineCount(n){
  const elP = document.getElementById('stat-players');
  if (elP) elP.textContent = String(n);
}
function startPresence(){
  if (presenceHeartbeatId) return; // already running
  // Immediately ping and update
  presencePing();
  presenceFetchCount().then(n=>{ if (n!=null) updateOnlineCount(n); });
  presenceHeartbeatId = setInterval(presencePing, 15000);
  presencePollId = setInterval(async ()=>{
    const n = await presenceFetchCount();
    if (n!=null) updateOnlineCount(n);
  }, 12000);
}
function stopPresence(){
  if (presenceHeartbeatId){ clearInterval(presenceHeartbeatId); presenceHeartbeatId = null; }
  if (presencePollId){ clearInterval(presencePollId); presencePollId = null; }
}

// Theme helpers
const THEME_CLASS_BY_CATEGORY = {
  '18': 'theme-cs',
  '19': 'theme-math',
  '17': 'theme-science',
  '23': 'theme-history',
};
const THEME_CLASSES = new Set(Object.values(THEME_CLASS_BY_CATEGORY));
function applyThemeForCategory(category){
  const cls = THEME_CLASS_BY_CATEGORY[category];
  // Remove any existing theme class first
  for (const c of THEME_CLASSES){ document.body.classList.remove(c); }
  if (cls){ document.body.classList.add(cls); }
}
function clearTheme(){
  for (const c of THEME_CLASSES){ document.body.classList.remove(c); }
}

// Update leaderboard header to reflect current subject in online mode
function updateLeaderboardTitle(){
  const h = document.getElementById('leaderboard-title');
  if (!h) return;
  if (els.mode.value === 'online'){
    const name = CATEGORY_NAMES[els.category.value] || 'Subject';
    h.textContent = `Leaderboard — ${name}`;
  } else {
    h.textContent = 'Leaderboard';
  }
}

// Persist/restore last settings for Quick Start
function saveLastSettings(){
  const s = {
    name: state.name,
    mode: state.mode,
    category: state.category,
    difficulty: state.difficulty,
    numQuestions: state.numQuestions,
  };
  try{ localStorage.setItem('trivia_last_settings', JSON.stringify(s)); }catch{}
}
function loadLastSettings(){
  try{
    const raw = localStorage.getItem('trivia_last_settings');
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}
function updateLastSettingsPreview(){
  const last = loadLastSettings();
  if (!els.lastSettings) return;
  if (last){
    els.lastSettings.textContent = `Last: ${CATEGORY_NAMES[last.category] || '—'} • ${last.mode} • ${last.difficulty} • ${last.numQuestions}`;
    if (els.quickStart) els.quickStart.disabled = false;
  } else {
    els.lastSettings.textContent = '';
    if (els.quickStart) els.quickStart.disabled = true;
  }
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function htmlDecode(str){
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function toQuestion(obj){
  // obj: { question, correct_answer, incorrect_answers } from OpenTDB
  const q = htmlDecode(obj.question);
  const answer = htmlDecode(obj.correct_answer);
  const incorrect = (obj.incorrect_answers || []).map(htmlDecode);
  const opts = shuffle([...incorrect, answer]);
  return { q, a: answer, opts };
}

function timePerDifficulty(diff){
  if (diff === 'hard') return 5;
  if (diff === 'medium') return 10;
  return 15; // easy
}

function apiUrl(path){
  // Ensure we hit the same host/port the app is served from
  const base = window.location.origin;
  return `${base}${path}`;
}

async function loadLeaderboard(category){
  // Try server first
  try{
    const url = category ? `/api/leaderboard?category=${encodeURIComponent(category)}` : '/api/leaderboard';
    const res = await fetch(apiUrl(url));
    if (res.ok){ return await res.json(); }
  }catch{}
  // Fallback to localStorage
  try{
    // v2 schema: { boards: { key: {name:score} } } stored as plain object under trivia_leaderboard_v2
    const raw2 = localStorage.getItem('trivia_leaderboard_v2');
    if (raw2){ const obj = JSON.parse(raw2)||{}; return obj[category||'global'] || {}; }
    // If a specific category is requested but no v2 store exists, do NOT fall back to legacy global
    if (category) return {};
    // legacy (only for global/non-category views)
    const raw = localStorage.getItem('trivia_leaderboard');
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
async function saveLeaderboardCumulative(name, score, category){
  // Try server cumulative update
  try{
    const res = await fetch(apiUrl('/api/leaderboard'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, category: category||'global' })
    });
    if (res.ok){
      const data = await res.json();
      return data.leaderboard || {};
    }
  }catch{}
  // Fallback to local cumulative
  const raw2 = localStorage.getItem('trivia_leaderboard_v2');
  const all = raw2 ? (JSON.parse(raw2)||{}) : {};
  const key = category||'global';
  const board = all[key] || {};
  board[name] = (board[name] || 0) + score;
  all[key] = board;
  localStorage.setItem('trivia_leaderboard_v2', JSON.stringify(all));
  return board;
}
async function computeStats(category){
  // Prefer server board, fallback to local
  let board = null;
  try{
    const stamp = Date.now();
    const url = category ? `/api/leaderboard?category=${encodeURIComponent(category)}&t=${stamp}` : `/api/leaderboard?t=${stamp}`;
    const res = await fetch(apiUrl(url), { headers: { 'Cache-Control':'no-cache' } });
    if (res.ok) board = await res.json();
  }catch{}
  if (!board){
    try{
      const raw2 = localStorage.getItem('trivia_leaderboard_v2');
      if (raw2){ const obj = JSON.parse(raw2)||{}; board = obj[category||'global'] || {}; }
      else {
        // If a specific category is requested, avoid legacy fallback (prevents bleeding global into a category)
        if (category){ board = {}; }
        else { const raw = localStorage.getItem('trivia_leaderboard'); board = raw ? JSON.parse(raw) : {}; }
      }
    }catch{ board = {}; }
  }
  const names = Object.keys(board);
  const totalPlayers = names.length;
  let topScore = 0;
  for(const n of names){ if (Number(board[n]) > topScore) topScore = Number(board[n]); }
  // Streak from local only
  const streak = Number(localStorage.getItem('trivia_streak') || '0');
  return { totalPlayers, topScore, streak };
}

async function renderHomeAside(){
  const cat = (els.mode.value === 'online') ? els.category.value : null;
  const s = await computeStats(cat);
  const elP = document.getElementById('stat-players');
  const elT = document.getElementById('stat-top-score');
  const elS = document.getElementById('stat-streak');
  if (elP) elP.textContent = String(s.totalPlayers);
  if (elT) elT.textContent = String(s.topScore);
  if (elS) elS.textContent = String(s.streak);
}
// Helpers for syncing local-only scores to the server
function getLocalLeaderboard(category){
  try{
    const raw2 = localStorage.getItem('trivia_leaderboard_v2');
    if (raw2){ const obj = JSON.parse(raw2)||{}; return obj[category||'global'] || {}; }
    // Only return legacy for non-category/global view
    if (category) return {};
    const raw = localStorage.getItem('trivia_leaderboard');
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
async function getServerLeaderboard(category){
  try{
    const stamp = Date.now();
    const url = category ? `/api/leaderboard?category=${encodeURIComponent(category)}&t=${stamp}` : `/api/leaderboard?t=${stamp}`;
    const res = await fetch(apiUrl(url), { headers: { 'Cache-Control':'no-cache' } });
    if (res.ok){ return await res.json(); }
  }catch{}
  return null; // null means unreachable
}
async function syncLocalToServerOnce(category){
  // Compute deltas and POST to server so other devices can see existing local scores
  const local = getLocalLeaderboard(category);
  // If nothing local, nothing to do
  if (!local || Object.keys(local).length === 0) return false;
  const server = await getServerLeaderboard(category);
  if (server === null) return false; // server not reachable
  let posted = false;
  for (const [name, lval] of Object.entries(local)){
    const sval = server[name] || 0;
    const delta = lval - sval;
    if (delta > 0){
      try{
        await fetch(apiUrl('/api/leaderboard'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, score: delta, category: category||'global' })
        });
        posted = true;
      }catch{}
    }
  }
  return posted;
}
async function renderLeaderboard(){
  // Prefer server data; if server is empty but local has entries, push local to server and then render
  // Always use the current subject key to avoid showing any global board by mistake
  const key = els.category.value;
  let board = null;
  let server = null;
  try{
    const stamp = Date.now();
    const url = key ? `/api/leaderboard?category=${encodeURIComponent(key)}&t=${stamp}` : `/api/leaderboard?t=${stamp}`;
    const res = await fetch(apiUrl(url), { headers: { 'Cache-Control':'no-cache' } });
    if (res.ok){ server = await res.json(); }
  }catch{}

  const local = getLocalLeaderboard(key);
    const serverEmpty = !server || Object.keys(server).length === 0;
  const localHas = local && Object.keys(local).length > 0;

  if (serverEmpty && localHas){
    // Try to sync local to server so other devices can see the scores
    await syncLocalToServerOnce(key);
    // After sync attempt, try fetching server again
    server = await getServerLeaderboard(key) || {};
  }

  board = (server && Object.keys(server).length > 0) ? server : (local || {});
  const entries = Object.entries(board).sort((a,b)=>b[1]-a[1]);
  els.leaderboardList.innerHTML = entries.map(([name,score])=>`<li>${name}: ${score}</li>`).join('') || '<li class="muted">No scores yet</li>';
}

async function fetchOpenTDB(category, amount, difficulty){
  const amt = Math.max(1, Math.min(20, amount));
  const url = new URL('https://opentdb.com/api.php');
  url.searchParams.set('amount', String(amt));
  url.searchParams.set('type', 'multiple');
  if (category) url.searchParams.set('category', category);
  if (difficulty) url.searchParams.set('difficulty', difficulty);

  // rudimentary backoff on 429
  for(let attempt=0; attempt<3; attempt++){
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'User-Agent': 'TriviaChampWeb/1.0' }
    });
    if (res.status === 429){
      const retryAfter = Number(res.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) ? retryAfter*1000 : Math.pow(2, attempt+1)*500;
      await new Promise(r=>setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results = (data && data.results) ? data.results : [];
    return results.map(toQuestion);
  }
  return [];
}

// async version loads from JSON banks and falls back to built-in
async function buildOfflineQuestions(category, count){
  const bank = await loadOfflineBank(category);
  // fall back to a tiny general list if category is empty
  const fallback = [
    { q: 'What is the capital of France?', a: 'Paris', opts: ['Paris','Rome','Berlin','Madrid'] },
    { q: "Who wrote 'Romeo and Juliet'?", a: 'Shakespeare', opts: ['Shakespeare','Hemingway','Dickens','Twain'] },
    { q: 'Which planet is known as the Red Planet?', a: 'Mars', opts: ['Jupiter','Venus','Mars','Mercury'] },
  ];
  const pool = Array.isArray(bank) && bank.length ? bank : fallback;
  const many = [];
  // repeat/shuffle to reach desired count
  while(many.length < count){
    many.push(...shuffle(pool));
  }
  return many.slice(0, count);
}

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

function startTimer(){
  clearInterval(state.timerId);
  if (state.mode === 'online'){
    state.timeLeft = timePerDifficulty(state.difficulty);
    els.timer.textContent = `⏱ ${state.timeLeft}s`;
    state.timerId = setInterval(()=>{
      state.timeLeft--;
      els.timer.textContent = `⏱ ${state.timeLeft}s`;
      if (state.timeLeft <= 0){
        clearInterval(state.timerId);
        // auto submit as wrong/no answer
        handleSubmit(true);
      }
    }, 1000);
  } else {
    els.timer.textContent = '';
  }
}

function renderQuestion(){
  const i = state.idx + 1;
  if (state.mode === 'online'){
    els.qCounter.textContent = `Question ${i} / ${state.questions.length}`;
  } else {
    els.qCounter.textContent = `Question ${i} (Offline • Unlimited)`;
  }
  const q = state.questions[state.idx];
  els.qText.textContent = q.q;
  els.options.innerHTML = '';
  state.selected = null;
  // Require an answer before allowing submit
  if (els.submit) els.submit.disabled = true;

  q.opts.forEach((opt, idx)=>{
    const li = document.createElement('li');
    li.textContent = opt;
    li.tabIndex = 0;
    li.addEventListener('click', ()=>{
      [...els.options.children].forEach(ch=>ch.classList.remove('selected'));
      li.classList.add('selected');
      state.selected = opt;
      if (els.submit) els.submit.disabled = false;
    });
    li.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' '){ li.click(); }
    });
    els.options.appendChild(li);
  });
  startTimer();
}

function nextQuestion(){
  state.idx++;
  if (state.mode === 'online'){
    if (state.idx >= state.questions.length){
      endQuiz();
    } else {
      renderQuestion();
    }
  } else {
    // offline: unlimited — keep refilling questions from offline bank
    if (state.idx >= state.questions.length){
      // extend with another shuffled batch asynchronously
      (async ()=>{
        const extra = await buildOfflineQuestions(state.category, 10);
        state.questions.push(...extra);
        renderQuestion();
      })();
      return;
    }
    renderQuestion();
  }
}

function handleSubmit(timeout=false){
  clearInterval(state.timerId);
  const q = state.questions[state.idx];
  const chosen = state.selected;
  // If user clicked Submit without selecting, do not advance
  if (!timeout && (chosen === null || chosen === undefined)){
    try{ alert('Please select an answer first.'); }catch{}
    return;
  }
  if (!timeout && chosen && chosen.toLowerCase() === q.a.toLowerCase()){
    state.score++;
  }
  nextQuestion();
}

async function endQuiz(){
  hide(els.quiz);
  show(els.results);
  try{ document.body.classList.remove('quiz-active'); }catch{}
  els.scoreLine.textContent = `${state.name}, your score is ${state.score} / ${state.questions.length}`;
  // update leaderboard ONLY for online mode
  if (state.mode === 'online'){
    await saveLeaderboardCumulative(state.name, state.score, state.category);
    await renderLeaderboard();
  }
  // Celebrate the finish
  try{ celebrate(); }catch{}
  // After finishing, expose Quick Start for same settings
  saveLastSettings();
  updateLastSettingsPreview();
  updateStreak();
  // Lifetime, achievements and recent activity
  const durationSec = state.quizStartAt ? Math.max(1, Math.round((Date.now() - state.quizStartAt)/1000)) : 0;
  try{ updateLifetime(state.score, state.questions.length, state.category); }catch{}
  try{ updateAchievements(state.score, durationSec); }catch{}
  try{ addRecentActivity({
    date: new Date().toISOString(),
    subject: CATEGORY_NAMES[state.category] || '—',
    mode: state.mode,
    difficulty: state.difficulty,
    score: state.score,
    total: state.questions.length,
    secs: durationSec
  }); }catch{}
  try{ renderAchievements(); renderRecentActivity(); }catch{}
  renderHomeAside();
  try{ renderPracticeDash(); }catch{}
}

async function startQuiz(){
  // collect state
  state.name = els.name.value.trim() || 'Player';
  state.mode = els.mode.value;
  state.category = els.category.value;
  state.difficulty = els.difficulty.value;
  state.numQuestions = Number(els.numQuestions.value);
  state.idx = 0; state.score = 0; state.questions = [];

  try{
    if (state.mode === 'online'){
      state.questions = await fetchOpenTDB(state.category, state.numQuestions, state.difficulty);
      if (!state.questions.length){
        alert('Could not fetch questions. Try again later.');
        return;
      }
    } else {
      // offline: start with an initial batch (e.g., 10) and grow as needed
      state.questions = await buildOfflineQuestions(state.category, 20);
    }
  }catch(err){
    console.error(err);
    alert('Error starting quiz: ' + err.message);
    return;
  }

  // Apply per-subject theme when entering the game
  applyThemeForCategory(state.category);
  try{ document.body.classList.add('quiz-active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }catch{}
  state.quizStartAt = Date.now();
  if (state.mode === 'online') startPresence();

  hide(els.setup);
  hide(els.results);
  show(els.quiz);
  renderQuestion();
  // Save last settings when a game starts successfully
  saveLastSettings();
  updateLastSettingsPreview();
}

// Events
els.setupForm.addEventListener('submit', (e)=>{ e.preventDefault(); startQuiz(); });
els.mode.addEventListener('change', ()=>{
  const offline = els.mode.value === 'offline';
  // hide difficulty and num-questions for true offline infinite mode
  els.difficultyWrap.style.display = (offline && !els.offlineDiffToggle.checked) ? 'none' : '';
  els.numQuestionsWrap.style.display = offline ? 'none' : '';
  els.offlineDiffToggleWrap.style.display = offline ? '' : 'none';
  // Toggle offline layout: hide leaderboard automatically in offline
  try{ document.body.classList.toggle('offline-mode', offline); }catch{}
  // Presence start/stop and players stat display
  if (!offline){
    startPresence();
    const lab = document.querySelector('#home-aside .stat:first-child .stat-label');
    if (lab) lab.textContent = 'Online';
    // refresh stats for current subject when entering online
    renderHomeAside();
  } else {
    stopPresence();
    const lab = document.querySelector('#home-aside .stat:first-child .stat-label');
    if (lab) lab.textContent = 'Players';
    // restore players stat to total unique players when offline
    renderHomeAside();
    try{ renderPracticeDash(); }catch{}
  }
  updateLeaderboardTitle();
  renderLeaderboard();
});
els.submit.addEventListener('click', ()=> handleSubmit(false));
els.skip.addEventListener('click', ()=> nextQuestion());
els.endSession.addEventListener('click', ()=> endQuiz());
els.playAgain.addEventListener('click', ()=>{ hide(els.results); show(els.setup); try{ document.body.classList.remove('quiz-active'); }catch{} });
els.goHome.addEventListener('click', ()=>{ hide(els.results); show(els.setup); clearTheme(); try{ document.body.classList.remove('quiz-active'); }catch{} });
els.clearLeaderboard.addEventListener('click', async ()=>{
  if(!confirm('Clear leaderboard?')) return;
  // Clear local fallback
  // For v2, clear current category board; for legacy, remove whole map
  try{
    const key = (els.mode.value === 'online') ? els.category.value : 'global';
    const raw2 = localStorage.getItem('trivia_leaderboard_v2');
    if (raw2){
      const obj = JSON.parse(raw2)||{};
      obj[key] = {};
      localStorage.setItem('trivia_leaderboard_v2', JSON.stringify(obj));
    } else {
      localStorage.removeItem('trivia_leaderboard');
    }
  }catch{}
  // Ask server to clear if available
  try{
    const key = (els.mode.value === 'online') ? els.category.value : '';
    const url = key ? `/api/leaderboard?category=${encodeURIComponent(key)}` : '/api/leaderboard';
    await fetch(apiUrl(url), { method: 'DELETE' });
  }catch{}
  await renderLeaderboard();
});

// Optional: Repair all leaderboards (clear every subject both locally and on server)
if (els.repairLeaderboards){
  els.repairLeaderboards.addEventListener('click', async ()=>{
    if (!confirm('This will clear ALL subject leaderboards (server + local). Continue?')) return;
    // Clear local storages
    try{ localStorage.removeItem('trivia_leaderboard_v2'); }catch{}
    try{ localStorage.removeItem('trivia_leaderboard'); }catch{}
    // Ask server to clear all
    try{ await fetch(apiUrl('/api/leaderboard'), { method: 'DELETE' }); }catch{}
    await renderLeaderboard();
    await renderHomeAside();
  });
}

// Init
renderLeaderboard();
// ensure initial UI matches selected mode
els.mode.dispatchEvent(new Event('change'));
updateLastSettingsPreview();
renderHomeAside();
try{ renderPracticeDash(); }catch{}
// Also render achievements and recent activity on load
try{ renderAchievements(); renderRecentActivity(); }catch{}
// If initial mode is online, kick off presence updates
if (els.mode.value === 'online'){
  startPresence();
  const lab = document.querySelector('#home-aside .stat:first-child .stat-label');
  if (lab) lab.textContent = 'Online';
}
updateLeaderboardTitle();

// Typewriter subtitle effect
function initTypewriter(){
  const el = els.subtitle;
  if (!el) return;
  let phrases = [];
  try{
    const raw = el.getAttribute('data-phrases');
    phrases = raw ? JSON.parse(raw) : [];
  }catch{ phrases = []; }
  if (!Array.isArray(phrases) || phrases.length === 0){
    phrases = ['Practice offline','Play timed online','Leaderboards by subject'];
  }
  let p = 0, i = 0, del = false;
  const baseDelay = 80; // typing speed
  const pauseFull = 1100; // pause on full word
  const pauseEmpty = 400;  // pause before next word
  function tick(){
    const text = phrases[p];
    if (!del){
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length){
        del = true;
        setTimeout(tick, pauseFull);
        return;
      }
      setTimeout(tick, baseDelay + Math.random()*60);
    } else {
      i--;
      el.textContent = text.slice(0, Math.max(0,i));
      if (i <= 0){
        del = false;
        p = (p+1) % phrases.length;
        setTimeout(tick, pauseEmpty);
        return;
      }
      setTimeout(tick, baseDelay/2);
    }
  }
  // Start after a tiny delay to avoid layout shift on load
  setTimeout(tick, 600);
}
initTypewriter();

// Quick Start and Daily Challenge
function applySettings(s){
  if (!s) return;
  if (s.name) els.name.value = s.name;
  if (s.mode) els.mode.value = s.mode;
  if (s.category) els.category.value = s.category;
  if (s.difficulty) els.difficulty.value = s.difficulty;
  if (s.numQuestions) els.numQuestions.value = String(s.numQuestions);
  // Reflect changes in UI
  els.mode.dispatchEvent(new Event('change'));
  els.category.dispatchEvent(new Event('change'));
}
if (els.quickStart){
  els.quickStart.addEventListener('click', ()=>{
    const last = loadLastSettings();
    if (!last) return;
    applySettings(last);
    startQuiz();
  });
}
function dailyChallengeSettings(){
  const today = new Date();
  const key = Number(`${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,'0')}${today.getDate().toString().padStart(2,'0')}`);
  const cats = ['19','18','17','23'];
  const diffs = ['easy','medium','hard'];
  const cat = cats[key % cats.length];
  const diff = diffs[key % diffs.length];
  return { name: els.name.value || 'Player', mode: 'online', category: cat, difficulty: diff, numQuestions: 10 };
}
if (els.daily){
  els.daily.addEventListener('click', ()=>{
    const s = dailyChallengeSettings();
    applySettings(s);
    startQuiz();
  });
}

// Streak tracking: increment if played today and consecutive to previous day
function yyyymmdd(d){ return `${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}`; }
function updateStreak(){
  try{
    const today = new Date();
    const todayKey = yyyymmdd(today);
    const lastKey = localStorage.getItem('trivia_last_played');
    let streak = Number(localStorage.getItem('trivia_streak') || '0');
    if (lastKey === todayKey){
      // already counted today
      return;
    }
    // Check if yesterday
    const y = new Date(today); y.setDate(today.getDate()-1);
    const yKey = yyyymmdd(y);
    if (lastKey === yKey){ streak = streak + 1; } else { streak = 1; }
    localStorage.setItem('trivia_streak', String(streak));
    localStorage.setItem('trivia_last_played', todayKey);
  }catch{}
}

// Offline difficulty toggle
els.offlineDiffToggle.addEventListener('change', ()=>{
  const offline = els.mode.value === 'offline';
  els.difficultyWrap.style.display = (offline && els.offlineDiffToggle.checked) ? '' : 'none';
});

// Live theme preview on subject change while on setup screen
els.category.addEventListener('change', ()=>{
  // Only preview on setup; once the quiz starts, startQuiz will set the theme again
  if (!els.setup.classList.contains('hidden')){
    applyThemeForCategory(els.category.value);
    // sync tile selection
    for (const t of els.subjectTiles){ t.classList.toggle('selected', t.dataset.category === els.category.value); t.setAttribute('aria-pressed', t.dataset.category === els.category.value ? 'true' : 'false'); }
  }
  updateLeaderboardTitle();
  renderLeaderboard();
  // When in online mode, recalc the subject-specific stats
  if (els.mode.value === 'online'){
    renderHomeAside();
  }
});

// Simple confetti effect
function celebrate(){
  const root = document.body;
  const styles = getComputedStyle(root);
  const c1 = styles.getPropertyValue('--accent').trim() || '#22c55e';
  const c2 = styles.getPropertyValue('--accent-2').trim() || '#3b82f6';
  const palette = [c1,c2,'#eab308','#ef4444','#10b981','#06b6d4','#a78bfa'];
  const pieces = 60;
  for(let i=0;i<pieces;i++){
    const d = document.createElement('div');
    d.className = 'confetti-piece';
    d.style.left = Math.random()*100 + 'vw';
    d.style.background = palette[(Math.random()*palette.length)|0];
    d.style.transform = `translateY(0) rotate(${Math.random()*360}deg)`;
    const delay = Math.random()*200;
    d.style.animationDelay = `${delay}ms`;
    root.appendChild(d);
    setTimeout(()=>{ try{ d.remove(); }catch{} }, 1600 + delay);
  }
}

// Keyboard shortcut: E to end session when quiz visible
document.addEventListener('keydown', (e)=>{
  const quizVisible = !els.quiz.classList.contains('hidden');
  if (!quizVisible) return;
  if (e.key.toLowerCase() === 'e'){
    e.preventDefault();
    endQuiz();
  }
});

// Subject tile wiring
function syncTilesToSelect(cat){
  if (!els.subjectTiles) return;
  for (const t of els.subjectTiles){ t.classList.toggle('selected', t.dataset.category === cat); t.setAttribute('aria-pressed', t.dataset.category === cat ? 'true' : 'false'); }
}
if (els.subjectTiles && els.subjectTiles.length){
  els.subjectTiles.forEach(tile=>{
    tile.addEventListener('click', ()=>{
      const cat = tile.dataset.category;
      els.category.value = cat;
      els.category.dispatchEvent(new Event('change'));
      syncTilesToSelect(cat);
    });
  });
  // init selection based on current select value
  syncTilesToSelect(els.category.value);
}

// Keyboard shortcuts: 1..4 select subject while on setup
document.addEventListener('keydown', (e)=>{
  if (!els.setup || els.setup.classList.contains('hidden')) return;
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  const map = { '1':'19', '2':'18', '3':'17', '4':'23' };
  const cat = map[e.key];
  if (cat){
    els.category.value = cat;
    els.category.dispatchEvent(new Event('change'));
    syncTilesToSelect(cat);
  }
});

// -------- Home right column extras: Achievements & Recent ---------
function getLifetime(){
  try{
    const raw = localStorage.getItem('trivia_lifetime');
    const base = { totalQuizzes:0, totalCorrect:0, totalAnswered:0, bestStreak:0, perSubject:{ '19':{c:0,a:0}, '18':{c:0,a:0}, '17':{c:0,a:0}, '23':{c:0,a:0} } };
    if (!raw) return base;
    const data = JSON.parse(raw);
    data.perSubject = Object.assign({}, base.perSubject, data.perSubject||{});
    return Object.assign(base, data);
  }catch{ return { totalQuizzes:0, totalCorrect:0, totalAnswered:0, bestStreak:0, perSubject:{ '19':{c:0,a:0}, '18':{c:0,a:0}, '17':{c:0,a:0}, '23':{c:0,a:0} } }; }
}
function saveLifetime(l){ try{ localStorage.setItem('trivia_lifetime', JSON.stringify(l)); }catch{} }
function updateLifetime(score, answered, category){
  const l = getLifetime();
  l.totalQuizzes += 1;
  l.totalCorrect += Number(score)||0;
  l.totalAnswered += Number(answered)||0;
  const streak = Number(localStorage.getItem('trivia_streak')||'0');
  if (streak > l.bestStreak) l.bestStreak = streak;
  if (category && l.perSubject && l.perSubject[category]){
    l.perSubject[category].c += Number(score)||0;
    l.perSubject[category].a += Number(answered)||0;
  }
  saveLifetime(l);
}

function getAchievements(){
  try{ const raw = localStorage.getItem('trivia_achievements'); return raw ? JSON.parse(raw) : {}; }catch{ return {}; }
}
function saveAchievements(a){ try{ localStorage.setItem('trivia_achievements', JSON.stringify(a)); }catch{} }
function updateAchievements(score, secs){
  const a = getAchievements();
  const l = getLifetime();
  const total = state.questions.length || 0;
  const bestStreak = l.bestStreak || 0;
  const speedThreshold = total ? total * 6 : 60; // ~6s per Q
  a.firstQuiz = (l.totalQuizzes >= 1) || a.firstQuiz || false;
  a.perfect10 = (total >= 10 && score === total) || a.perfect10 || false;
  a.streak3 = (bestStreak >= 3) || a.streak3 || false;
  a.streak7 = (bestStreak >= 7) || a.streak7 || false;
  a.speedster = (total >= 10 && secs > 0 && secs <= speedThreshold) || a.speedster || false;
  a.scholar50 = (l.totalCorrect >= 50) || a.scholar50 || false;
  saveAchievements(a);
}

function renderAchievements(){
  const host = document.getElementById('achv-badges');
  if (!host) return;
  const a = getAchievements();
  const items = [
    { key:'firstQuiz', label:'First Quiz', icon:'🎯', desc:'Complete your first quiz' },
    { key:'perfect10', label:'Perfect 10', icon:'🏆', desc:'Score 10/10 in a quiz' },
    { key:'streak3', label:'On Fire', icon:'🔥', desc:'3-day streak' },
    { key:'streak7', label:'Unstoppable', icon:'🧱', desc:'7-day streak' },
    { key:'speedster', label:'Speedster', icon:'⚡', desc:'Finish 10 Q in ~1 min' },
    { key:'scholar50', label:'Scholar', icon:'📚', desc:'50 total correct answers' },
  ];
  host.classList.remove('muted');
  host.classList.remove('small');
  host.classList.add('badges');
  host.innerHTML = items.map(it=>{
    const unlocked = !!a[it.key];
    return `<div class="badge ${unlocked?'':'locked'}"><span class="icon">${it.icon}</span><div><div><strong>${it.label}</strong></div><div class="muted small">${it.desc}</div></div></div>`;
  }).join('');
}

function getRecent(){
  try{ const raw = localStorage.getItem('trivia_recent'); return raw ? JSON.parse(raw) : []; }catch{ return []; }
}
function saveRecent(arr){ try{ localStorage.setItem('trivia_recent', JSON.stringify(arr)); }catch{} }
function addRecentActivity(entry){
  const arr = getRecent();
  arr.unshift(entry);
  while(arr.length > 5) arr.pop();
  saveRecent(arr);
}
function renderRecentActivity(){
  const ul = document.getElementById('recent-list');
  if (!ul) return;
  const arr = getRecent();
  if (!arr.length){ ul.innerHTML = '<li class="muted">No recent games</li>'; return; }
  ul.innerHTML = arr.map(x=>{
    const d = new Date(x.date);
    const time = d.toLocaleString();
    return `<li><strong>${x.subject}</strong> • ${x.mode} • ${x.difficulty} — <strong>${x.score}/${x.total}</strong> <span class="muted">(${time})</span></li>`;
  }).join('');
}

// Practice Dashboard renderer (goals + subject accuracy)
function renderPracticeDash(){
  const rec = getRecent();
  const todayKey = yyyymmdd(new Date());
  let answered = 0, scored = 0, online = 0;
  for (const x of rec){
    try{
      const d = new Date(x.date);
      if (yyyymmdd(d) === todayKey){
        answered += Number(x.total)||0;
        scored += Number(x.score)||0;
        if ((x.mode||'').toLowerCase() === 'online') online += 1;
      }
    }catch{}
  }
  const setBar = (barId, val, outOf, noteId, label) => {
    const pct = Math.max(0, Math.min(100, Math.round((val/outOf)*100)));
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = pct + '%';
    const note = document.getElementById(noteId);
    if (note) note.textContent = `${val}/${outOf} ${label}`;
  };
  setBar('goal-answered', answered, 20, 'goal-answered-note', 'today');
  setBar('goal-score', scored, 10, 'goal-score-note', 'today');
  setBar('goal-online', online, 1, 'goal-online-note', 'today');

  const l = getLifetime();
  const cats = ['19','18','17','23'];
  for (const cid of cats){
    const stats = (l.perSubject && l.perSubject[cid]) ? l.perSubject[cid] : { c:0, a:0 };
    const pct = stats.a ? Math.round((stats.c / stats.a) * 100) : 0;
    const bar = document.getElementById('sub-' + cid);
    if (bar) bar.style.width = pct + '%';
    const note = document.getElementById('sub-' + cid + '-note');
    if (note) note.textContent = `${pct}% accuracy`;
  }
}
