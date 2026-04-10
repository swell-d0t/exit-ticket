// ─────────────────────────────────────────────────────────
// app.js — Unprompted (Supabase backend)
// ─────────────────────────────────────────────────────────

let db = null;
let currentTeacher = null;

// ── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const config = getConfig();
  if (!config) { showScreen('screen-config'); return; }
  db = window.supabase.createClient(config.url, config.key);
  const { data: { session } } = await db.auth.getSession();
  if (session) await loadTeacherAndOpenDashboard(session.user);
  else showScreen('screen-landing');
});

// ── SCREEN ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, duration = 2400) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ── ALERT HELPER ──────────────────────────────────────────
function showAlert(el, type, msg) {
  const icons = { info: 'ℹ', success: '✓', danger: '✕', warn: '⚠' };
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  el.style.display = 'flex';
}

function setLoading(btnId, loading, label = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.textContent = '…';
  else if (label) btn.textContent = label;
}

// ─────────────────────────────────────────────────────────
// TEACHER AUTH
// ─────────────────────────────────────────────────────────
async function teacherRegister() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('regError');
  const okEl     = document.getElementById('regSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  if (!name)           { showAlert(errEl, 'danger', 'Please enter your name.'); return; }
  if (!email)          { showAlert(errEl, 'danger', 'Please enter your email.'); return; }
  if (password.length < 6) { showAlert(errEl, 'danger', 'Password must be at least 6 characters.'); return; }

  setLoading('regBtn', true);
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) { showAlert(errEl, 'danger', error.message); setLoading('regBtn', false, 'Create account →'); return; }

  const { error: ie } = await db.from('teachers')
    .insert({ id: data.user.id, email, name, class_code: genCode(), questions: [], question_bank: [] });
  if (ie) { showAlert(errEl, 'danger', 'Account created but profile setup failed: ' + ie.message); setLoading('regBtn', false, 'Create account →'); return; }

  showAlert(okEl, 'success', 'Account created! Check your email to confirm, then sign in.');
  setLoading('regBtn', false, 'Create account →');
}

async function teacherLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!email || !password) { showAlert(errEl, 'danger', 'Please enter your email and password.'); return; }

  setLoading('loginBtn', true);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { showAlert(errEl, 'danger', error.message); setLoading('loginBtn', false, 'Sign in →'); return; }
  await loadTeacherAndOpenDashboard(data.user);
}

async function loadTeacherAndOpenDashboard(user) {
  const { data, error } = await db.from('teachers').select('*').eq('id', user.id).single();
  if (error || !data) { showScreen('screen-landing'); return; }
  currentTeacher = data;
  if (!currentTeacher.question_bank) currentTeacher.question_bank = [];
  openDashboard();
}

async function teacherSignOut() {
  await db.auth.signOut();
  currentTeacher = null;
  showScreen('screen-landing');
  toast('Signed out');
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────
function openDashboard() {
  const name = currentTeacher.name || 'Teacher';
  document.getElementById('dashTeacherName').textContent = name + ''s Dashboard';
  document.getElementById('displayClassCode').textContent = currentTeacher.class_code;
  renderResponsesTable();
  renderQEditor();
  renderNewQForm();
  renderBankList();
  switchTab('responses');
  showScreen('screen-dashboard');
  setLoading('loginBtn', false, 'Sign in →');
}

function switchTab(name) {
  const names = ['responses','questions','bank','settings'];
  document.querySelectorAll('.tab-item').forEach((btn, i) => btn.classList.toggle('active', names[i] === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

// ── COPY CODE ─────────────────────────────────────────────
function copyCode() {
  navigator.clipboard.writeText(currentTeacher.class_code).then(() => toast('Class code copied!'));
}

async function regenerateCode() {
  const newCode = genCode();
  const { error } = await db.from('teachers').update({ class_code: newCode }).eq('id', currentTeacher.id);
  if (error) { toast('Could not update code'); return; }
  currentTeacher.class_code = newCode;
  document.getElementById('displayClassCode').textContent = newCode;
  toast('New code generated');
}

// ── STAT CARDS ────────────────────────────────────────────
// ── RESPONSES TABLE ───────────────────────────────────────
async function renderResponsesTable() {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  const qs = currentTeacher.questions || [];

  head.innerHTML = '';
  body.innerHTML = '<tr><td colspan="100"><div class="empty-state"><div class="spinner" style="margin:0 auto 10px"></div></div></td></tr>';

  ['Name','Submitted','Tab Warnings',...qs.map((_,i) => `Q${i+1}`)].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; head.appendChild(th);
  });

  const { data: responses, error } = await db
    .from('responses').select('*').eq('teacher_id', currentTeacher.id)
    .order('created_at', { ascending: false });

  body.innerHTML = '';
  if (error) { body.innerHTML = `<tr><td colspan="100"><div class="empty-state">Error: ${error.message}</div></td></tr>`; return; }

  if (!responses?.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 3 + qs.length;
    td.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>No responses yet.</div>';
    tr.appendChild(td); body.appendChild(tr); return;
  }

  responses.forEach(r => {
    const tr = document.createElement('tr');
    const answers = r.answers || {};

    // Row-level highlighting
    const shortQIds = qs.filter(q => q.type === 'short').map(q => q.id);
    const avgWc = shortQIds.length > 0
      ? shortQIds.reduce((sum, id) => sum + (answers[id] ? countWords(answers[id]) : 0), 0) / shortQIds.length
      : 999;

    if (r.tab_warnings > 0 && avgWc < 10) tr.className = 'row-danger';
    else if (r.tab_warnings > 0 || avgWc < 10) tr.className = 'row-warn';

    const cells = [r.student_name, new Date(r.created_at).toLocaleString(), r.tab_warnings, ...qs.map(q => answers[q.id] || '—')];
    cells.forEach((val, i) => {
      const td = document.createElement('td');
      td.className = i >= 3 ? 'wrap-cell' : '';
      if (i === 2 && parseInt(val) > 0) td.style.color = 'var(--amber-500)';

      const q = qs[i - 3];
      if (i >= 3 && q && q.type === 'short' && val !== '—') {
        const wc = countWords(val);
        const color = wc < 10 ? 'var(--red-400)' : wc < 20 ? 'var(--amber-500)' : 'var(--green-400)';
        td.innerHTML = `${val}<br><span style="font-size:11px; font-family:var(--font-mono); color:${color}; margin-top:3px; display:inline-block;">${wc} words</span>`;
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

// ── EXPORT CSV ────────────────────────────────────────────
async function exportCSV() {
  const qs = currentTeacher.questions || [];
  const { data: responses, error } = await db
    .from('responses').select('*').eq('teacher_id', currentTeacher.id)
    .order('created_at', { ascending: false });
  if (error) { toast('Export failed'); return; }

  const headers = ['Name','Submitted','Tab Warnings',
    ...qs.map((q,i) => `Q${i+1}: ${q.text.replace(/,/g,'').substring(0,60)}`),
    ...qs.filter(q => q.type === 'short').map((_,i) => `Q${i+1} Word Count`)
  ];
  const rows = (responses || []).map(r => {
    const ans = r.answers || {};
    return [
      r.student_name, new Date(r.created_at).toLocaleString(), r.tab_warnings,
      ...qs.map(q => (ans[q.id] || '').replace(/,/g,';')),
      ...qs.filter(q => q.type === 'short').map(q => ans[q.id] ? countWords(ans[q.id]) : 0)
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `unprompted-${currentTeacher.name.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported');
}

async function clearResponses() {
  const alertEl = document.getElementById('clearAlert');
  if (!confirm('Delete ALL responses? This cannot be undone.')) return;
  const { error } = await db.from('responses').delete().eq('teacher_id', currentTeacher.id);
  if (error) { showAlert(alertEl, 'danger', 'Failed: ' + error.message); return; }
  showAlert(alertEl, 'success', 'All responses cleared.');
  renderResponsesTable();
  toast('Responses cleared');
}

// ─────────────────────────────────────────────────────────
// QUESTION EDITOR
// ─────────────────────────────────────────────────────────
function renderQEditor() {
  const list = document.getElementById('qEditorList');
  const qs = currentTeacher.questions || [];
  list.innerHTML = '';
  if (!qs.length) {
    list.innerHTML = '<p style="font-size:13px; color:var(--text-3); padding:4px 0;">No questions yet. Add one below.</p>';
    return;
  }
  const labels = { short:'Short answer', mc:'Multiple choice', tf:'True / False', rank:'Ranking' };
  qs.forEach((q, i) => {
    const meta = q.type === 'mc' ? `${q.choices.length} choices` : q.type === 'rank' ? `${q.items.length} items` : '';
    const item = document.createElement('div');
    item.className = 'qe-item';
    item.innerHTML = `<div class="qe-row">
      <div style="flex:1">
        <div class="qe-type-tag">${labels[q.type]}</div>
        <div class="qe-text">${q.text}</div>
        ${meta ? `<div class="qe-meta">${meta}</div>` : ''}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-sm btn-outline" onclick="saveToBank(${i})" title="Save to bank">⊕ Bank</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteQuestion(${i})">Delete</button>
      </div>
    </div>`;
    list.appendChild(item);
  });
}

async function deleteQuestion(i) {
  if (!confirm('Delete this question?')) return;
  const qs = [...(currentTeacher.questions || [])];
  qs.splice(i, 1);
  await saveQuestions(qs);
}

async function addQuestion() {
  const type = document.getElementById('newQType').value;
  const text = (document.getElementById('nq-text')?.value || '').trim();
  if (!text) { toast('Please enter a question.'); return; }

  const q = { id: Date.now(), type, text };
  if (type === 'mc') {
    const choices = [...document.querySelectorAll('.nq-choice')].map(i => i.value.trim()).filter(Boolean);
    if (choices.length < 2) { toast('Add at least 2 choices.'); return; }
    const correctBtn = document.querySelector('.correct-toggle.is-correct');
    q.choices = choices;
    q.correct = correctBtn ? [...document.querySelectorAll('.correct-toggle')].indexOf(correctBtn) : 0;
  } else if (type === 'tf') {
    q.answer = document.getElementById('nq-tf-answer').value === 'true';
  } else if (type === 'rank') {
    const items = [...document.querySelectorAll('.nq-rank-item')].map(i => i.value.trim()).filter(Boolean);
    if (items.length < 2) { toast('Add at least 2 items.'); return; }
    q.items = items;
  }

  setLoading('addQBtn', true);
  const qs = [...(currentTeacher.questions || []), q];
  await saveQuestions(qs);
  renderNewQForm();
  switchTab('questions');
  toast('Question added');
}

async function saveQuestions(qs) {
  const { error } = await db.from('teachers').update({ questions: qs }).eq('id', currentTeacher.id);
  if (error) { toast('Failed to save: ' + error.message); return; }
  currentTeacher.questions = qs;
  renderQEditor();
  setLoading('addQBtn', false, '+ Add question');
}

// ── ADD QUESTION FORM ─────────────────────────────────────
function renderNewQForm() {
  _renderQForm('newQType', 'newQFormArea', 'nq-');
}

function _renderQForm(typeId, areaId, prefix) {
  const type = document.getElementById(typeId).value;
  const area = document.getElementById(areaId);
  area.innerHTML = '';

  const qField = document.createElement('div');
  qField.className = 'field'; qField.style.marginBottom = '14px';
  qField.innerHTML = `<label class="label">Question text</label><textarea id="${prefix}text" placeholder="Enter your question…" style="min-height:70px"></textarea>`;
  area.appendChild(qField);

  if (type === 'mc') {
    const wrap = document.createElement('div'); wrap.style.marginBottom = '14px';
    wrap.innerHTML = `<label class="label" style="display:block; margin-bottom:8px;">Answer choices <span style="color:var(--text-3); font-weight:400; text-transform:none; letter-spacing:0">(mark the correct one)</span></label>`;
    const choicesWrap = document.createElement('div'); choicesWrap.id = `${prefix}choices`;
    for (let i = 0; i < 4; i++) choicesWrap.appendChild(buildChoiceRow(i));
    wrap.appendChild(choicesWrap);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost btn-sm'; addBtn.type = 'button'; addBtn.textContent = '+ Add choice'; addBtn.style.marginTop = '4px';
    addBtn.onclick = () => { const n = choicesWrap.querySelectorAll('.choice-row').length; choicesWrap.appendChild(buildChoiceRow(n)); };
    wrap.appendChild(addBtn); area.appendChild(wrap);
  } else if (type === 'tf') {
    const f = document.createElement('div'); f.className = 'field'; f.style.marginBottom = '14px';
    f.innerHTML = `<label class="label">Correct answer</label><select id="${prefix}tf-answer"><option value="true">True</option><option value="false">False</option></select>`;
    area.appendChild(f);
  } else if (type === 'rank') {
    const wrap = document.createElement('div'); wrap.style.marginBottom = '14px';
    wrap.innerHTML = `<label class="label" style="display:block; margin-bottom:8px;">Items to rank</label>`;
    const rankWrap = document.createElement('div'); rankWrap.id = `${prefix}rank-items`;
    for (let i = 0; i < 3; i++) rankWrap.appendChild(buildRankInput());
    wrap.appendChild(rankWrap);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost btn-sm'; addBtn.type = 'button'; addBtn.textContent = '+ Add item'; addBtn.style.marginTop = '4px';
    addBtn.onclick = () => rankWrap.appendChild(buildRankInput());
    wrap.appendChild(addBtn); area.appendChild(wrap);
  }
}

function buildChoiceRow(i) {
  const row = document.createElement('div'); row.className = 'choice-row';
  row.innerHTML = `<input type="text" placeholder="Choice ${i+1}" class="nq-choice" /><button type="button" class="correct-toggle" onclick="toggleCorrect(this)">Correct?</button>`;
  return row;
}
function toggleCorrect(btn) {
  document.querySelectorAll('.correct-toggle').forEach(b => b.classList.remove('is-correct'));
  btn.classList.add('is-correct');
}
function buildRankInput() {
  const row = document.createElement('div'); row.className = 'choice-row';
  row.innerHTML = `<input type="text" placeholder="Item" class="nq-rank-item" /><button type="button" class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  return row;
}

// ─────────────────────────────────────────────────────────
// QUESTION BANK
// ─────────────────────────────────────────────────────────
let bankFilter = 'all';

function renderBankList() {
  const list = document.getElementById('bankList');
  const bank = currentTeacher.question_bank || [];
  const filtered = bankFilter === 'all' ? bank : bank.filter(q => q.type === bankFilter);

  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state" style="padding:32px 0;"><div class="empty-icon">${bank.length === 0 ? '📚' : '🔍'}</div>${bank.length === 0 ? 'Your bank is empty. Save questions to build your library.' : 'No questions match this filter.'}</div>`;
    return;
  }

  const labels = { short:'Short answer', mc:'Multiple choice', tf:'True / False', rank:'Ranking' };
  filtered.forEach((q, i) => {
    const originalIdx = bank.indexOf(q);
    const item = document.createElement('div'); item.className = 'bank-item';
    item.innerHTML = `
      <div style="flex:1">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span class="bank-item-tag">${labels[q.type]}</span>
          ${q.tag ? `<span class="bank-item-tag" style="color:var(--amber-600); background:var(--amber-50); border-color:var(--amber-200);">${q.tag}</span>` : ''}
        </div>
        <div class="bank-item-text">${q.text}</div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-sm btn-primary" onclick="pullFromBank(${originalIdx})">+ Use</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteFromBank(${originalIdx})">✕</button>
      </div>`;
    list.appendChild(item);
  });
}

function filterBank(filter, btn) {
  bankFilter = filter;
  document.querySelectorAll('.bank-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderBankList();
}

async function saveToBank(questionIdx) {
  const q = currentTeacher.questions[questionIdx];
  if (!q) return;
  const bank = [...(currentTeacher.question_bank || [])];
  // Avoid duplicates
  if (bank.some(b => b.text === q.text && b.type === q.type)) { toast('Already in your bank'); return; }
  bank.push({ ...q, id: Date.now(), tag: '' });
  await saveBank(bank);
  toast('Saved to question bank');
}

async function pullFromBank(bankIdx) {
  const q = currentTeacher.question_bank[bankIdx];
  if (!q) return;
  const qs = [...(currentTeacher.questions || []), { ...q, id: Date.now() }];
  await saveQuestions(qs);
  toast('Question added to active ticket');
  switchTab('questions');
}

async function deleteFromBank(bankIdx) {
  if (!confirm('Remove this question from your bank?')) return;
  const bank = [...(currentTeacher.question_bank || [])];
  bank.splice(bankIdx, 1);
  await saveBank(bank);
  toast('Removed from bank');
}

async function saveBank(bank) {
  const { error } = await db.from('teachers').update({ question_bank: bank }).eq('id', currentTeacher.id);
  if (error) { toast('Failed to save bank'); return; }
  currentTeacher.question_bank = bank;
  renderBankList();
}

// Add to bank from form
function showAddBankQuestion() {
  document.getElementById('bankAddForm').style.display = 'block';
  renderBankQForm();
}
function hideBankAddForm() { document.getElementById('bankAddForm').style.display = 'none'; }
function renderBankQForm() { _renderQForm('bankQType', 'bankQFormArea', 'bq-'); }

async function saveToBankFromForm() {
  const type = document.getElementById('bankQType').value;
  const text = (document.getElementById('bq-text')?.value || '').trim();
  const tag  = (document.getElementById('bankQTag')?.value || '').trim();
  if (!text) { toast('Please enter a question.'); return; }

  const q = { id: Date.now(), type, text, tag };
  if (type === 'mc') {
    const choices = [...document.querySelectorAll('#bankQFormArea .nq-choice')].map(i => i.value.trim()).filter(Boolean);
    if (choices.length < 2) { toast('Add at least 2 choices.'); return; }
    const correctBtn = document.querySelector('#bankQFormArea .correct-toggle.is-correct');
    q.choices = choices;
    q.correct = correctBtn ? [...document.querySelectorAll('#bankQFormArea .correct-toggle')].indexOf(correctBtn) : 0;
  } else if (type === 'tf') {
    q.answer = document.getElementById('bq-tf-answer').value === 'true';
  } else if (type === 'rank') {
    const items = [...document.querySelectorAll('#bankQFormArea .nq-rank-item')].map(i => i.value.trim()).filter(Boolean);
    if (items.length < 2) { toast('Add at least 2 items.'); return; }
    q.items = items;
  }

  const bank = [...(currentTeacher.question_bank || []), q];
  await saveBank(bank);
  hideBankAddForm();
  toast('Question saved to bank');
}

// ── CHANGE PASSWORD ───────────────────────────────────────
async function changePassword() {
  const p1 = document.getElementById('newPass1').value;
  const p2 = document.getElementById('newPass2').value;
  const alertEl = document.getElementById('passAlert');
  if (!p1) { showAlert(alertEl, 'danger', 'Password cannot be empty.'); return; }
  if (p1 !== p2) { showAlert(alertEl, 'danger', 'Passwords do not match.'); return; }
  if (p1.length < 6) { showAlert(alertEl, 'danger', 'Must be at least 6 characters.'); return; }
  const { error } = await db.auth.updateUser({ password: p1 });
  if (error) { showAlert(alertEl, 'danger', error.message); return; }
  document.getElementById('newPass1').value = '';
  document.getElementById('newPass2').value = '';
  showAlert(alertEl, 'success', 'Password updated.');
  toast('Password updated');
}

// ─────────────────────────────────────────────────────────
// STUDENT FLOW
// ─────────────────────────────────────────────────────────
let sess = { name:'', teacher:null, qOrder:[], idx:0, answers:{}, tabWarns:0, active:false };

async function joinMission() {
  const name   = document.getElementById('studentName').value.trim();
  const code   = document.getElementById('classCode').value.trim().toUpperCase();
  const errEl  = document.getElementById('joinError');
  errEl.style.display = 'none';

  if (!name) { showAlert(errEl, 'danger', 'Please enter your name.'); return; }
  if (!code) { showAlert(errEl, 'danger', 'Please enter the class code.'); return; }

  setLoading('joinBtn', true);
  const { data: teacher, error } = await db.from('teachers')
    .select('id, name, class_code, questions').eq('class_code', code).single();
  setLoading('joinBtn', false, 'Start ticket →');

  if (error || !teacher) { showAlert(errEl, 'danger', 'That class code is incorrect. Check with your teacher.'); return; }
  if (!teacher.questions?.length) { showAlert(errEl, 'danger', "Your teacher hasn't added any questions yet."); return; }

  // Show teacher name on wordmark
  const wm = document.getElementById('studentWordmark');
  if (wm) wm.textContent = `${teacher.name}'s Exit Ticket`;

  sess = { name, teacher, qOrder: shuffle(teacher.questions.map((_,i) => i)), idx:0, answers:{}, tabWarns:0, active:true };
  startTabDetection();
  renderQuestion();
  showScreen('screen-question');
}

// ── RENDER QUESTION ───────────────────────────────────────
function renderQuestion() {
  const total = sess.qOrder.length;
  const i = sess.idx;
  const pct = Math.round((i / total) * 100);

  document.getElementById('q-label').textContent = `Question ${i+1} of ${total}`;
  document.getElementById('q-pct').textContent = pct + '%';

  // Animated progress fill with pulse
  const fill = document.getElementById('progressFill');
  fill.style.width = pct + '%';
  fill.classList.remove('pulse');
  void fill.offsetWidth; // force reflow
  fill.classList.add('pulse');

  const q = sess.teacher.questions[sess.qOrder[i]];
  const typeLabels = { short:'Short answer', mc:'Multiple choice', tf:'True / False', rank:'Ranking' };
  document.getElementById('q-type-tag').textContent = typeLabels[q.type];
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-error').style.display = 'none';

  const area = document.getElementById('q-input-area');
  area.innerHTML = '';

  if (q.type === 'short') {
    const ta = document.createElement('textarea');
    ta.id = 'ans-short';
    ta.placeholder = 'Write your answer here…';
    ta.style.marginBottom = '4px';
    ta.onpaste = e => e.preventDefault();

    // Live word count
    const wcEl = document.createElement('div');
    wcEl.className = 'word-count-live wc-low';
    wcEl.textContent = '0 words';
    ta.oninput = () => {
      const wc = countWords(ta.value);
      wcEl.textContent = wc + (wc === 1 ? ' word' : ' words');
      wcEl.className = 'word-count-live ' + (wc < 10 ? 'wc-low' : wc < 20 ? 'wc-medium' : 'wc-good');
    };

    area.appendChild(ta);
    area.appendChild(wcEl);
    // spacer
    const sp = document.createElement('div'); sp.style.marginBottom = '14px';
    area.appendChild(sp);
    ta.focus();

  } else if (q.type === 'mc') {
    const list = document.createElement('div'); list.className = 'mc-list'; list.id = 'ans-mc';
    q.choices.forEach((choice, ci) => {
      const item = document.createElement('div'); item.className = 'mc-item';
      item.innerHTML = `<div class="mc-radio"><div class="mc-radio-dot"></div></div><span class="mc-item-label">${choice}</span>`;
      item.onclick = () => {
        list.querySelectorAll('.mc-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected'); list.dataset.selected = ci;
      };
      list.appendChild(item);
    });
    area.appendChild(list);

  } else if (q.type === 'tf') {
    const row = document.createElement('div'); row.className = 'tf-row'; row.id = 'ans-tf';
    ['True','False'].forEach(val => {
      const btn = document.createElement('button'); btn.className = 'tf-btn'; btn.textContent = val;
      btn.onclick = () => {
        row.querySelectorAll('.tf-btn').forEach(b => b.className = 'tf-btn');
        btn.className = val === 'True' ? 'tf-btn sel-true' : 'tf-btn sel-false';
        row.dataset.selected = val;
      };
      row.appendChild(btn);
    });
    area.appendChild(row);
    const sp = document.createElement('div'); sp.style.marginBottom = '16px'; area.appendChild(sp);

  } else if (q.type === 'rank') {
    const list = document.createElement('div'); list.className = 'rank-list'; list.id = 'ans-rank';
    shuffle([...q.items]).forEach((item, ri) => list.appendChild(buildRankRow(item, ri+1)));
    area.appendChild(list);
    const sp = document.createElement('div'); sp.style.marginBottom = '16px'; area.appendChild(sp);
    initRankDrag(list);
  }
}

function buildRankRow(text, num) {
  const row = document.createElement('div'); row.className = 'rank-item'; row.draggable = true; row.dataset.text = text;
  row.innerHTML = `<span class="rank-num">${num}</span><span class="rank-handle">⠿</span><span class="rank-label">${text}</span>`;
  return row;
}

function initRankDrag(list) {
  let dragged = null;
  list.addEventListener('dragstart', e => { dragged = e.target.closest('.rank-item'); if(dragged) dragged.classList.add('dragging'); });
  list.addEventListener('dragend', () => { if(dragged) dragged.classList.remove('dragging'); dragged = null; list.querySelectorAll('.rank-item').forEach(el => el.classList.remove('drag-over')); updateRankNums(list); });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.rank-item');
    if (target && target !== dragged) {
      list.querySelectorAll('.rank-item').forEach(el => el.classList.remove('drag-over'));
      target.classList.add('drag-over');
      const items = [...list.querySelectorAll('.rank-item')];
      if (items.indexOf(dragged) < items.indexOf(target)) target.after(dragged);
      else target.before(dragged);
    }
  });
}
function updateRankNums(list) { list.querySelectorAll('.rank-item').forEach((el,i) => el.querySelector('.rank-num').textContent = i+1); }

// ── KEYBOARD SHORTCUT: Enter to advance ───────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  const qScreen = document.getElementById('screen-question');
  if (!qScreen.classList.contains('active')) return;
  // Allow Enter inside textarea for newlines — only trigger on non-textarea
  if (document.activeElement.tagName === 'TEXTAREA') return;
  e.preventDefault();
  submitAnswer();
});

// ── SUBMIT ANSWER ─────────────────────────────────────────
async function submitAnswer() {
  const q = sess.teacher.questions[sess.qOrder[sess.idx]];
  const errEl = document.getElementById('q-error');
  let answer = null;

  if (q.type === 'short') {
    const val = (document.getElementById('ans-short')?.value || '').trim();
    if (!val) { errEl.textContent = 'Please write an answer before continuing.'; errEl.style.display = 'block'; return; }
    answer = val;
  } else if (q.type === 'mc') {
    const list = document.getElementById('ans-mc');
    if (list.dataset.selected === undefined || list.dataset.selected === '') { errEl.textContent = 'Please select an answer.'; errEl.style.display = 'block'; return; }
    answer = q.choices[parseInt(list.dataset.selected)];
  } else if (q.type === 'tf') {
    const row = document.getElementById('ans-tf');
    if (!row.dataset.selected) { errEl.textContent = 'Please select True or False.'; errEl.style.display = 'block'; return; }
    answer = row.dataset.selected;
  } else if (q.type === 'rank') {
    answer = [...document.getElementById('ans-rank').querySelectorAll('.rank-item')].map(el => el.dataset.text).join(' → ');
  }

  errEl.style.display = 'none';
  sess.answers[q.id] = answer;
  sess.idx++;
  if (sess.idx >= sess.qOrder.length) await finishTicket();
  else renderQuestion();
}

async function finishTicket() {
  document.getElementById('continueBtn').disabled = true;
  const { error } = await db.from('responses').insert({
    teacher_id: sess.teacher.id, student_name: sess.name,
    tab_warnings: sess.tabWarns, answers: sess.answers
  });
  document.getElementById('continueBtn').disabled = false;
  if (error) {
    const errEl = document.getElementById('q-error');
    errEl.textContent = 'Submission failed. Please try again or tell your teacher.';
    errEl.style.display = 'block'; return;
  }
  sess.active = false;
  stopTabDetection();
  showScreen('screen-complete');
  launchConfetti();
}

// ─────────────────────────────────────────────────────────
// TAB DETECTION
// ─────────────────────────────────────────────────────────
let tabHandler = null;
function startTabDetection() {
  tabHandler = () => { if (document.hidden && sess.active) { sess.tabWarns++; showTabWarning(); } };
  document.addEventListener('visibilitychange', tabHandler);
}
function stopTabDetection() { if (tabHandler) document.removeEventListener('visibilitychange', tabHandler); }
function showTabWarning() {
  document.getElementById('warnBadge').textContent = `Warning ${sess.tabWarns}`;
  document.getElementById('tabWarning').classList.add('show');
}
function dismissTabWarning() { document.getElementById('tabWarning').classList.remove('show'); }

// ─────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.style.display = 'block';
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#5C53C7','#F4A833','#2DB87A','#E5534B','#EC4899','#0891B2','#7C3AED','#D97706','#16A34A','#DC2626','#F59E0B','#06B6D4'];
  const pieces = Array.from({length: 90}, () => ({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.4,
    r: Math.random() * 7 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: Math.random() * 3 + 1.5, dx: (Math.random() - 0.5) * 2,
    rot: Math.random() * 360, drot: (Math.random() - 0.5) * 7,
    shape: Math.random() > 0.5 ? 'rect' : 'circle'
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = Math.max(0, 1 - frame / 130);
    pieces.forEach(p => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
      if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      p.y += p.speed; p.x += p.dx; p.rot += p.drot;
    });
    frame++;
    if (frame < 150) requestAnimationFrame(draw);
    else canvas.style.display = 'none';
  }
  draw();
}

// ─────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────
function countWords(str) { return str.trim().split(/\s+/).filter(Boolean).length; }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i+1)); [a[i],a[j]] = [a[j],a[i]]; }
  return a;
}
