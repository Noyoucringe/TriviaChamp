// TriviaChamp Web - mirrors the Java console app
// Features: offline/online, categories, difficulty, timed questions, leaderboard

const els = {
  setup: document.getElementById('setup'),
  setupForm: document.getElementById('setup-form'),
  name: document.getElementById('player-name'),
  mode: document.getElementById('mode'),
  category: document.getElementById('category'),
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
};

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

async function loadLeaderboard(){
  // Try server first
  try{
    const res = await fetch(apiUrl('/api/leaderboard'));
    if (res.ok){ return await res.json(); }
  }catch{}
  // Fallback to localStorage
  try{
    const raw = localStorage.getItem('trivia_leaderboard');
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
async function saveLeaderboardCumulative(name, score){
  // Try server cumulative update
  try{
    const res = await fetch(apiUrl('/api/leaderboard'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    if (res.ok){
      const data = await res.json();
      return data.leaderboard || {};
    }
  }catch{}
  // Fallback to local cumulative
  const board = await loadLeaderboard();
  board[name] = (board[name] || 0) + score;
  localStorage.setItem('trivia_leaderboard', JSON.stringify(board));
  return board;
}
// Helpers for syncing local-only scores to the server
function getLocalLeaderboard(){
  try{
    const raw = localStorage.getItem('trivia_leaderboard');
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
async function getServerLeaderboard(){
  try{
    const res = await fetch(apiUrl('/api/leaderboard'));
    if (res.ok){ return await res.json(); }
  }catch{}
  return null; // null means unreachable
}
async function syncLocalToServerOnce(){
  // Compute deltas and POST to server so other devices can see existing local scores
  const local = getLocalLeaderboard();
  // If nothing local, nothing to do
  if (!local || Object.keys(local).length === 0) return false;
  const server = await getServerLeaderboard();
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
          body: JSON.stringify({ name, score: delta })
        });
        posted = true;
      }catch{}
    }
  }
  return posted;
}
async function renderLeaderboard(){
  // Prefer server data; if server is empty but local has entries, push local to server and then render
  let board = null;
  let server = null;
  try{
    const res = await fetch(apiUrl('/api/leaderboard'));
    if (res.ok){ server = await res.json(); }
  }catch{}

  const local = getLocalLeaderboard();
  const serverEmpty = !server || Object.keys(server).length === 0;
  const localHas = local && Object.keys(local).length > 0;

  if (serverEmpty && localHas){
    // Try to sync local to server so other devices can see the scores
    await syncLocalToServerOnce();
    // After sync attempt, try fetching server again
    server = await getServerLeaderboard() || {};
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

  q.opts.forEach((opt, idx)=>{
    const li = document.createElement('li');
    li.textContent = opt;
    li.tabIndex = 0;
    li.addEventListener('click', ()=>{
      [...els.options.children].forEach(ch=>ch.classList.remove('selected'));
      li.classList.add('selected');
      state.selected = opt;
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
  if (!timeout && chosen && chosen.toLowerCase() === q.a.toLowerCase()){
    state.score++;
  }
  nextQuestion();
}

async function endQuiz(){
  hide(els.quiz);
  show(els.results);
  els.scoreLine.textContent = `${state.name}, your score is ${state.score} / ${state.questions.length}`;
  // update leaderboard (cumulative like Java)
  await saveLeaderboardCumulative(state.name, state.score);
  await renderLeaderboard();
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

  hide(els.setup);
  hide(els.results);
  show(els.quiz);
  renderQuestion();
}

// Events
els.setupForm.addEventListener('submit', (e)=>{ e.preventDefault(); startQuiz(); });
els.mode.addEventListener('change', ()=>{
  const offline = els.mode.value === 'offline';
  // hide difficulty and num-questions for true offline infinite mode
  els.difficultyWrap.style.display = (offline && !els.offlineDiffToggle.checked) ? 'none' : '';
  els.numQuestionsWrap.style.display = offline ? 'none' : '';
  els.offlineDiffToggleWrap.style.display = offline ? '' : 'none';
});
els.submit.addEventListener('click', ()=> handleSubmit(false));
els.skip.addEventListener('click', ()=> nextQuestion());
els.endSession.addEventListener('click', ()=> endQuiz());
els.playAgain.addEventListener('click', ()=>{ hide(els.results); show(els.setup); });
els.goHome.addEventListener('click', ()=>{ hide(els.results); show(els.setup); });
els.clearLeaderboard.addEventListener('click', async ()=>{
  if(!confirm('Clear leaderboard?')) return;
  // Clear local fallback
  localStorage.removeItem('trivia_leaderboard');
  // Ask server to clear if available
  try{
    await fetch(apiUrl('/api/leaderboard'), { method: 'DELETE' });
  }catch{}
  await renderLeaderboard();
});

// Init
renderLeaderboard();
// ensure initial UI matches selected mode
els.mode.dispatchEvent(new Event('change'));

// Offline difficulty toggle
els.offlineDiffToggle.addEventListener('change', ()=>{
  const offline = els.mode.value === 'offline';
  els.difficultyWrap.style.display = (offline && els.offlineDiffToggle.checked) ? '' : 'none';
});

// Keyboard shortcut: E to end session when quiz visible
document.addEventListener('keydown', (e)=>{
  const quizVisible = !els.quiz.classList.contains('hidden');
  if (!quizVisible) return;
  if (e.key.toLowerCase() === 'e'){
    e.preventDefault();
    endQuiz();
  }
});
