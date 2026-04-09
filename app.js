// ─────────────────────────────────────────────────────────
// app.js  —  Exit Ticket (Supabase / Postgres backend)
// ─────────────────────────────────────────────────────────

let db = null;
let currentTeacher = null;

// ── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const config = getConfig();

  if (!config) {
    showScreen('screen-config');
    return;
  }

  db = window.supabase.createClient(config.url, config.key);

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await loadTeacherAndOpenDashboard(session.user);
  } else {
    showScreen('screen-landing');
  }
});

// ── SCREEN HELPER ─────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
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
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regError');
  const successEl = document.getElementById('regSuccess');

  errEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!name) { showAlert(errEl, 'danger', 'Please enter your name.'); return; }
  if (!email) { showAlert(errEl, 'danger', 'Please enter your email.'); return; }
  if (password.length < 6) { showAlert(errEl, 'danger', 'Password must be at least 6 characters.'); return; }

  setLoading('regBtn', true);

  const { data, error } = await db.auth.signUp({ email, password });

  if (error) {
    showAlert(errEl, 'danger', error.message);
    setLoading('regBtn', false, 'Create account →');
    return;
  }

  const code = genCode();
  const { error: insertError } = await db
    .from('teachers')
    .insert({ id: data.user.id, email, name, class_code: code, questions: [] });

  if (insertError) {
    showAlert(errEl, 'danger', 'Account created but profile setup failed: ' + insertError.message);
    setLoading('regBtn', false, 'Create account →');
    return;
  }

  showAlert(successEl, 'success', 'Account created! Check your email to confirm, then sign in.');
  setLoading('regBtn', false, 'Create account →');
}

async function teacherLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email || !password) { showAlert(errEl, 'danger', 'Please enter your email and password.'); return; }

  setLoading('loginBtn', true);

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showAlert(errEl, 'danger', error.message);
    setLoading('loginBtn', false, 'Sign in →');
    return;
  }

  await loadTeacherAndOpenDashboard(data.user);
}

async function loadTeacherAndOpenDashboard(user) {
  const { data, error } = await db
    .from('teachers')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    showScreen('screen-landing');
    return;
  }

  currentTeacher = data;
  openDashboard();
}

async function teacherSignOut() {
  await db.auth.signOut();
  currentTeacher = null;
  showScreen('screen-landing');
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────

function openDashboard() {
  document.getElementById('dashTeacherName').textContent = currentTeacher.name || 'Teacher Dashboard';
  document.getElementById('displayClassCode').textContent = currentTeacher.class_code;
  renderResponsesTable();
  renderQEditor();
  renderNewQForm();
  switchTab('responses');
  showScreen('screen-dashboard');
  setLoading('loginBtn', false, 'Sign in →');
}

function switchTab(name) {
  const names = ['responses', 'questions', 'settings'];
  document.querySelectorAll('.tab-item').forEach((btn, i) => {
    btn.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

async function regenerateCode() {
  const newCode = genCode();
  const { error } = await db
    .from('teachers')
    .update({ class_code: newCode })
    .eq('id', currentTeacher.id);

  if (error) {
    showAlert(document.getElementById('responseAlert'), 'danger', 'Could not update code: ' + error.message);
    return;
  }

  currentTeacher.class_code = newCode;
  document.getElementById('displayClassCode').textContent = newCode;
  showAlert(document.getElementById('responseAlert'), 'info', 'New code generated. Share it with your students.');
}

// ── RESPONSES TABLE ───────────────────────────────────────
async function renderResponsesTable() {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  const qs = currentTeacher.questions || [];

  head.innerHTML = '';
  body.innerHTML = '<tr><td colspan="100"><div class="empty-state"><div class="spinner" style="margin:0 auto 12px"></div></div></td></tr>';

  ['Name', 'Submitted', 'Tab Warnings', ...qs.map((_, i) => `Q${i + 1}`)].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  });

  const { data: responses, error } = await db
    .from('responses')
    .select('*')
    .eq('teacher_id', currentTeacher.id)
    .order('created_at', { ascending: false });

  body.innerHTML = '';

  if (error) {
    body.innerHTML = `<tr><td colspan="100"><div class="empty-state">Error loading responses: ${error.message}</div></td></tr>`;
    return;
  }

  if (!responses || !responses.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3 + qs.length;
    td.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>No responses yet.</div>';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  responses.forEach(r => {
    const tr = document.createElement('tr');
    const answers = r.answers || {};
    const cells = [
      r.student_name,
      new Date(r.created_at).toLocaleString(),
      r.tab_warnings,
      ...qs.map(q => answers[q.id] || '—')
    ];

    cells.forEach((val, i) => {
      const td = document.createElement('td');
      td.className = i >= 3 ? 'wrap-cell' : '';

      // Tab warnings — amber if > 0
      if (i === 2 && parseInt(val) > 0) td.style.color = 'var(--warn)';

      // Word count badge — only for short answer columns
      const colIsAnswer = i >= 3;
      const q = qs[i - 3];
      if (colIsAnswer && q && q.type === 'short' && val !== '—') {
        const count = wordCount(val);
        const color = count < 10
          ? 'var(--danger)'
          : count < 20
          ? 'var(--warn)'
          : 'var(--success)';
        td.innerHTML = `${val}<br><span style="font-size:11px; font-family:var(--font-mono); color:${color}; margin-top:3px; display:inline-block;">${count} words</span>`;
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
    .from('responses')
    .select('*')
    .eq('teacher_id', currentTeacher.id)
    .order('created_at', { ascending: false });

  if (error) { alert('Export failed: ' + error.message); return; }

  // Include a word count column for each short answer question in the CSV too
  const headers = [
    'Name', 'Submitted', 'Tab Warnings',
    ...qs.map((q, i) => `Q${i + 1}: ${q.text.replace(/,/g, '').substring(0, 60)}`),
    ...qs.filter(q => q.type === 'short').map((_, i) => `Q${i + 1} Word Count`)
  ];

  const rows = (responses || []).map(r => {
    const answers = r.answers || {};
    const answerCols = qs.map(q => (answers[q.id] || '').replace(/,/g, ';'));
    const wordCountCols = qs
      .filter(q => q.type === 'short')
      .map(q => answers[q.id] ? wordCount(answers[q.id]) : 0);
    return [
      r.student_name,
      new Date(r.created_at).toLocaleString(),
      r.tab_warnings,
      ...answerCols,
      ...wordCountCols
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exit-ticket-${currentTeacher.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CLEAR RESPONSES ───────────────────────────────────────
async function clearResponses() {
  const alertEl = document.getElementById('clearAlert');
  if (!confirm('Delete ALL responses for your class? This cannot be undone.')) return;

  const { error } = await db
    .from('responses')
    .delete()
    .eq('teacher_id', currentTeacher.id);

  if (error) {
    showAlert(alertEl, 'danger', 'Failed to clear: ' + error.message);
    return;
  }

  showAlert(alertEl, 'success', 'All responses cleared.');
  renderResponsesTable();
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

  const typeLabels = { short: 'Short answer', mc: 'Multiple choice', tf: 'True / False', rank: 'Ranking' };

  qs.forEach((q, i) => {
    const meta =
      q.type === 'mc' ? `${q.choices.length} choices` :
      q.type === 'rank' ? `${q.items.length} items` : '';

    const item = document.createElement('div');
    item.className = 'qe-item';
    item.innerHTML = `
      <div class="qe-row">
        <div style="flex:1">
          <div class="qe-type-tag">${typeLabels[q.type]}</div>
          <div class="qe-text">${q.text}</div>
          ${meta ? `<div class="qe-meta">${meta}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-ghost" onclick="deleteQuestion(${i})">Delete</button>
      </div>`;
    list.appendChild(item);
  });
}

async function deleteQuestion(i) {
  if (!confirm('Delete this question? Students who already answered will keep their data.')) return;
  const qs = [...(currentTeacher.questions || [])];
  qs.splice(i, 1);
  await saveQuestions(qs);
}

async function addQuestion() {
  const type = document.getElementById('newQType').value;
  const text = (document.getElementById('nq-text')?.value || '').trim();
  if (!text) { alert('Please enter a question.'); return; }

  const q = { id: Date.now(), type, text };

  if (type === 'mc') {
    const choices = [...document.querySelectorAll('.nq-choice')].map(i => i.value.trim()).filter(Boolean);
    if (choices.length < 2) { alert('Add at least 2 answer choices.'); return; }
    const correctBtn = document.querySelector('.correct-toggle.is-correct');
    q.choices = choices;
    q.correct = correctBtn ? [...document.querySelectorAll('.correct-toggle')].indexOf(correctBtn) : 0;

  } else if (type === 'tf') {
    q.answer = document.getElementById('nq-tf-answer').value === 'true';

  } else if (type === 'rank') {
    const items = [...document.querySelectorAll('.nq-rank-item')].map(i => i.value.trim()).filter(Boolean);
    if (items.length < 2) { alert('Add at least 2 items.'); return; }
    q.items = items;
  }

  setLoading('addQBtn', true);
  const qs = [...(currentTeacher.questions || []), q];
  await saveQuestions(qs);
  renderNewQForm();
  switchTab('questions');
}

async function saveQuestions(qs) {
  const { error } = await db
    .from('teachers')
    .update({ questions: qs })
    .eq('id', currentTeacher.id);

  if (error) { alert('Failed to save questions: ' + error.message); return; }

  currentTeacher.questions = qs;
  renderQEditor();
  setLoading('addQBtn', false, '+ Add question');
}

// ── ADD QUESTION FORM ─────────────────────────────────────
function renderNewQForm() {
  const type = document.getElementById('newQType').value;
  const area = document.getElementById('newQFormArea');
  area.innerHTML = '';

  const qField = document.createElement('div');
  qField.className = 'field';
  qField.style.marginBottom = '14px';
  qField.innerHTML = `<label class="label">Question text</label><textarea id="nq-text" placeholder="Enter your question…" style="min-height:70px"></textarea>`;
  area.appendChild(qField);

  if (type === 'mc') {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '14px';
    wrap.innerHTML = `<label class="label" style="display:block; margin-bottom:8px;">Answer choices <span style="color:var(--text-3); font-weight:400">(mark the correct one)</span></label>`;
    const choicesWrap = document.createElement('div');
    choicesWrap.id = 'nq-choices';
    for (let i = 0; i < 4; i++) choicesWrap.appendChild(buildChoiceRow(i));
    wrap.appendChild(choicesWrap);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost btn-sm';
    addBtn.type = 'button';
    addBtn.textContent = '+ Add choice';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => { const n = choicesWrap.querySelectorAll('.choice-row').length; choicesWrap.appendChild(buildChoiceRow(n)); };
    wrap.appendChild(addBtn);
    area.appendChild(wrap);

  } else if (type === 'tf') {
    const f = document.createElement('div');
    f.className = 'field';
    f.style.marginBottom = '14px';
    f.innerHTML = `<label class="label">Correct answer</label><select id="nq-tf-answer"><option value="true">True</option><option value="false">False</option></select>`;
    area.appendChild(f);

  } else if (type === 'rank') {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '14px';
    wrap.innerHTML = `<label class="label" style="display:block; margin-bottom:8px;">Items to rank</label>`;
    const rankWrap = document.createElement('div');
    rankWrap.id = 'nq-rank-items';
    for (let i = 0; i < 3; i++) rankWrap.appendChild(buildRankInput());
    wrap.appendChild(rankWrap);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost btn-sm';
    addBtn.type = 'button';
    addBtn.textContent = '+ Add item';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => rankWrap.appendChild(buildRankInput());
    wrap.appendChild(addBtn);
    area.appendChild(wrap);
  }
}

function buildChoiceRow(i) {
  const row = document.createElement('div');
  row.className = 'choice-row';
  row.innerHTML = `<input type="text" placeholder="Choice ${i + 1}" class="nq-choice" /><button type="button" class="correct-toggle" onclick="toggleCorrect(this)">Correct?</button>`;
  return row;
}

function toggleCorrect(btn) {
  document.querySelectorAll('.correct-toggle').forEach(b => b.classList.remove('is-correct'));
  btn.classList.add('is-correct');
}

function buildRankInput() {
  const row = document.createElement('div');
  row.className = 'choice-row';
  row.innerHTML = `<input type="text" placeholder="Item" class="nq-rank-item" /><button type="button" class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  return row;
}

// ── CHANGE PASSWORD ───────────────────────────────────────
async function changePassword() {
  const p1 = document.getElementById('newPass1').value;
  const p2 = document.getElementById('newPass2').value;
  const alertEl = document.getElementById('passAlert');

  if (!p1) { showAlert(alertEl, 'danger', 'Password cannot be empty.'); return; }
  if (p1 !== p2) { showAlert(alertEl, 'danger', 'Passwords do not match.'); return; }
  if (p1.length < 6) { showAlert(alertEl, 'danger', 'Password must be at least 6 characters.'); return; }

  const { error } = await db.auth.updateUser({ password: p1 });
  if (error) { showAlert(alertEl, 'danger', error.message); return; }

  document.getElementById('newPass1').value = '';
  document.getElementById('newPass2').value = '';
  showAlert(alertEl, 'success', 'Password updated successfully.');
}

// ─────────────────────────────────────────────────────────
// STUDENT FLOW
// ─────────────────────────────────────────────────────────

let sess = { name: '', teacher: null, qOrder: [], idx: 0, answers: {}, tabWarns: 0, active: false };

async function joinMission() {
  const name = document.getElementById('studentName').value.trim();
  const code = document.getElementById('classCode').value.trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.style.display = 'none';

  if (!name) { showAlert(errEl, 'danger', 'Please enter your name.'); return; }
  if (!code) { showAlert(errEl, 'danger', 'Please enter the class code.'); return; }

  setLoading('joinBtn', true);

  const { data: teacher, error } = await db
    .from('teachers')
    .select('id, name, class_code, questions')
    .eq('class_code', code)
    .single();

  setLoading('joinBtn', false, 'Start ticket →');

  if (error || !teacher) {
    showAlert(errEl, 'danger', 'That class code is incorrect. Check with your teacher.');
    return;
  }

  if (!teacher.questions || !teacher.questions.length) {
    showAlert(errEl, 'danger', "Your teacher hasn't added any questions yet.");
    return;
  }

  sess = {
    name,
    teacher,
    qOrder: shuffle(teacher.questions.map((_, i) => i)),
    idx: 0,
    answers: {},
    tabWarns: 0,
    active: true
  };

  startTabDetection();
  renderQuestion();
  showScreen('screen-question');
}

// ── RENDER QUESTION ───────────────────────────────────────
function renderQuestion() {
  const total = sess.qOrder.length;
  const i = sess.idx;
  const pct = Math.round((i / total) * 100);

  document.getElementById('q-label').textContent = `Question ${i + 1} of ${total}`;
  document.getElementById('q-pct').textContent = pct + '%';
  document.getElementById('progressBar').style.width = pct + '%';

  const q = sess.teacher.questions[sess.qOrder[i]];
  const typeLabels = { short: 'Short answer', mc: 'Multiple choice', tf: 'True / False', rank: 'Ranking' };
  document.getElementById('q-type-tag').textContent = typeLabels[q.type];
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-error').style.display = 'none';

  const area = document.getElementById('q-input-area');
  area.innerHTML = '';

  if (q.type === 'short') {
    const ta = document.createElement('textarea');
    ta.id = 'ans-short';
    ta.placeholder = 'Write your answer here…';
    ta.style.marginBottom = '16px';
    ta.onpaste = e => e.preventDefault();
    area.appendChild(ta);
    ta.focus();

  } else if (q.type === 'mc') {
    const list = document.createElement('div');
    list.className = 'mc-list';
    list.id = 'ans-mc';
    q.choices.forEach((choice, ci) => {
      const item = document.createElement('div');
      item.className = 'mc-item';
      item.innerHTML = `<div class="mc-radio"><div class="mc-radio-dot"></div></div><span class="mc-item-label">${choice}</span>`;
      item.onclick = () => {
        list.querySelectorAll('.mc-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        list.dataset.selected = ci;
      };
      list.appendChild(item);
    });
    area.appendChild(list);

  } else if (q.type === 'tf') {
    const row = document.createElement('div');
    row.className = 'tf-row';
    row.id = 'ans-tf';
    ['True', 'False'].forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'tf-btn';
      btn.textContent = val;
      btn.onclick = () => {
        row.querySelectorAll('.tf-btn').forEach(b => (b.className = 'tf-btn'));
        btn.className = val === 'True' ? 'tf-btn sel-true' : 'tf-btn sel-false';
        row.dataset.selected = val;
      };
      row.appendChild(btn);
    });
    area.appendChild(row);
    const spacer = document.createElement('div');
    spacer.style.marginBottom = '16px';
    area.appendChild(spacer);

  } else if (q.type === 'rank') {
    const list = document.createElement('div');
    list.className = 'rank-list';
    list.id = 'ans-rank';
    shuffle([...q.items]).forEach((item, ri) => {
      list.appendChild(buildRankRow(item, ri + 1));
    });
    area.appendChild(list);
    const spacer = document.createElement('div');
    spacer.style.marginBottom = '16px';
    area.appendChild(spacer);
    initRankDrag(list);
  }
}

function buildRankRow(text, num) {
  const row = document.createElement('div');
  row.className = 'rank-item';
  row.draggable = true;
  row.dataset.text = text;
  row.innerHTML = `<span class="rank-num">${num}</span><span class="rank-handle">⠿</span><span class="rank-label">${text}</span>`;
  return row;
}

function initRankDrag(list) {
  let dragged = null;
  list.addEventListener('dragstart', e => { dragged = e.target.closest('.rank-item'); if (dragged) dragged.classList.add('dragging'); });
  list.addEventListener('dragend', () => {
    if (dragged) dragged.classList.remove('dragging');
    dragged = null;
    list.querySelectorAll('.rank-item').forEach(el => el.classList.remove('drag-over'));
    updateRankNums(list);
  });
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

function updateRankNums(list) {
  list.querySelectorAll('.rank-item').forEach((el, i) => {
    el.querySelector('.rank-num').textContent = i + 1;
  });
}

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
    answer = [...document.getElementById('ans-rank').querySelectorAll('.rank-item')]
      .map(el => el.dataset.text).join(' → ');
  }

  errEl.style.display = 'none';
  sess.answers[q.id] = answer;
  sess.idx++;

  if (sess.idx >= sess.qOrder.length) {
    await finishTicket();
  } else {
    renderQuestion();
  }
}

async function finishTicket() {
  document.getElementById('continueBtn').disabled = true;

  const { error } = await db.from('responses').insert({
    teacher_id: sess.teacher.id,
    student_name: sess.name,
    tab_warnings: sess.tabWarns,
    answers: sess.answers
  });

  document.getElementById('continueBtn').disabled = false;

  if (error) {
    const errEl = document.getElementById('q-error');
    errEl.textContent = 'Submission failed. Please try again or tell your teacher.';
    errEl.style.display = 'block';
    return;
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

function stopTabDetection() {
  if (tabHandler) document.removeEventListener('visibilitychange', tabHandler);
}

function showTabWarning() {
  document.getElementById('warnBadge').textContent = `Warning ${sess.tabWarns}`;
  document.getElementById('tabWarning').classList.add('show');
}

function dismissTabWarning() {
  document.getElementById('tabWarning').classList.remove('show');
}

// ─────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#EC4899'];
  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    r: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: Math.random() * 3 + 1.5,
    dx: (Math.random() - 0.5) * 2,
    rot: Math.random() * 360,
    drot: (Math.random() - 0.5) * 7,
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

// Counts words in a string.
// Used to show word count on short answer responses in the teacher dashboard.
// Color coding: red = under 10 words, amber = 10-19 words, green = 20+ words
function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
