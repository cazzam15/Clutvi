let contentCount = parseInt(localStorage.getItem('rr_count') || '0');
let contentHistory = JSON.parse(localStorage.getItem('rr_history') || '[]');
let viralLibrary = JSON.parse(localStorage.getItem('rr_viral') || '[]');

function init() {
  document.getElementById('content-count').textContent = contentCount;
  renderRecentList();
  renderViralLib();
  initAuth();
}

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('main').scrollTop = 0;
}

function selectChip(el, group) {
  const parent = el.closest('.chip-row') || el.parentElement;
  parent.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function getActiveChip(group) {
  const chips = document.querySelectorAll(`[onclick*="'${group}'"]`);
  for (const c of chips) { if (c.classList.contains('active')) return c.textContent.trim(); }
  return '';
}

function setLoading(id, on) {
  document.getElementById(id + '-loading').classList.toggle('visible', on);
  const btn = document.querySelector(`[onclick="run${id.charAt(0).toUpperCase()+id.slice(1)}()"]`) || document.querySelector(`[onclick*="run${id.charAt(0).toUpperCase()}"]`);
  if (btn) btn.disabled = on;
}

function showOutput(id, text) {
  const box = document.getElementById(id + '-output');
  box.textContent = text;
  box.classList.add('visible');
  const acts = document.getElementById(id + '-actions');
  if (acts) acts.style.display = 'flex';
}

async function runCaption() {
  const text = document.getElementById('caption-input').value.trim();
  if (!text) { showToast('Describe your post first'); return; }
  const plat = getActiveChip('plat');
  const tone = getActiveChip('tone');
  setLoading('caption', true);
  try {
    const result = await callClaude(`You are a top social media content creator. Write 3 ${tone.toLowerCase()} captions for a ${plat} post about: "${text}". Each caption should have a strong hook, engaging body, and 10-15 relevant hashtags. Format as Caption 1, Caption 2, Caption 3 with clear spacing.`);
    showOutput('caption', result);
    incrementCount();
    addToHistory('Caption Writer', text.substring(0,60), 'badge-caption');
  } catch(e) { showToast(e.message); }
  setLoading('caption', false);
}

async function runAlgo() {
  const text = document.getElementById('algo-input').value.trim();
  if (!text) { showToast('Describe your content idea first'); return; }
  const plat = getActiveChip('algo-plat');
  setLoading('algo', true);
  try {
    const result = await callClaude(`You are a ${plat} algorithm expert. Analyse this content idea and give it an algorithm score out of 100: "${text}". Start your response with SCORE: [number] on its own line, then provide: 1) Why it will/won't perform, 2) Specific improvements to boost the score, 3) Best time to post, 4) Recommended format. Be direct and specific.`);
    const scoreMatch = result.match(/SCORE:\s*(\d+)/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1]);
      document.getElementById('algo-score-wrap').style.display = 'block';
      document.getElementById('algo-bar').style.width = score + '%';
      const numEl = document.getElementById('algo-score-num');
      numEl.textContent = score + '/100';
      numEl.className = 'score-num ' + (score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low');
    }
    showOutput('algo', result.replace(/SCORE:\s*\d+\n?/, '').trim());
    document.getElementById('algo-actions').style.display = 'flex';
    incrementCount();
    addToHistory('Algo Analyzer', text.substring(0,60), 'badge-algo');
  } catch(e) { showToast(e.message); }
  setLoading('algo', false);
}

async function runHistory() {
  const text = document.getElementById('history-input').value.trim();
  if (!text) { showToast('Paste your post history first'); return; }
  setLoading('history', true);
  try {
    const result = await callClaude(`You are a social media strategist. Analyse these posts and engagement data: "${text}". Identify: 1) What content types perform best, 2) Patterns in top performers, 3) What to do more of, 4) What to stop doing, 5) Three specific content ideas based on what's working. Be direct with actionable insights.`);
    showOutput('history', result);
    incrementCount();
    addToHistory('Post History', text.substring(0,60), 'badge-history');
  } catch(e) { showToast(e.message); }
  setLoading('history', false);
}

async function runBrain() {
  const text = document.getElementById('brain-input').value.trim();
  if (!text) { showToast('Do the brain dump first'); return; }
  const count = getActiveChip('dump-count');
  const plat = getActiveChip('dump-plat');
  setLoading('brain', true);
  try {
    const result = await callClaude(`You are a social media content strategist. Take this brain dump and turn it into a structured ${plat} content plan for ${count}: "${text}". For each post include: post number, format (reel/carousel/static), hook, content outline, and best day to post. Make it specific and ready to execute.`);
    showOutput('brain', result);
    incrementCount();
    addToHistory('Brain Dump', text.substring(0,60), 'badge-brain');
  } catch(e) { showToast(e.message); }
  setLoading('brain', false);
}

async function runComment() {
  const text = document.getElementById('comment-input').value.trim();
  if (!text) { showToast('Paste some comments first'); return; }
  const tone = getActiveChip('reply-tone');
  const comments = text.split('\n').filter(c => c.trim());
  setLoading('comment', true);
  try {
    const result = await callClaude(`You are a social media manager. Write ${tone.toLowerCase()} replies to each of these comments. Keep replies genuine, concise (1-2 sentences), and engaging. Format as Comment: [original] → Reply: [your reply]\n\n${comments.map((c,i)=>`${i+1}. ${c}`).join('\n')}`);
    showOutput('comment', result);
    incrementCount();
    addToHistory('Comment Reply', comments[0].substring(0,60), 'badge-comment');
  } catch(e) { showToast(e.message); }
  setLoading('comment', false);
}

function saveViralPost() {
  const text = document.getElementById('viral-save-input').value.trim();
  if (!text) { showToast('Paste a post to save'); return; }
  const plat = getActiveChip('viral-plat');
  const note = document.getElementById('viral-note-input').value.trim();
  const post = { id: Date.now(), platform: plat, text, note, saved: new Date().toLocaleDateString() };
  viralLibrary.unshift(post);
  localStorage.setItem('rr_viral', JSON.stringify(viralLibrary));
  document.getElementById('viral-save-input').value = '';
  document.getElementById('viral-note-input').value = '';
  renderViralLib();
  showToast('✅ Saved to your library!', 'success');
}

function renderViralLib() {
  const el = document.getElementById('viral-lib-content');
  if (viralLibrary.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0;">No saved posts yet. Save a viral post to start your library.</div>';
    return;
  }
  el.innerHTML = '<div class="viral-lib">' + viralLibrary.map(p => `
    <div class="viral-card">
      <div class="viral-card-platform">${p.platform} · ${p.saved}</div>
      <div class="viral-card-text">${escapeHtml(p.text.substring(0,120))}${p.text.length > 120 ? '...' : ''}</div>
      ${p.note ? `<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;">💡 ${escapeHtml(p.note)}</div>` : ''}
      <div class="viral-card-actions">
        <button class="btn-sm" data-text="${escapeAttr(p.text)}" onclick="copyText(this)">Copy</button>
        <button class="btn-sm" onclick="prefillRemix(${p.id})">Remix</button>
        <button class="btn-sm" onclick="deleteViral(${p.id})" style="color:var(--red)">Delete</button>
      </div>
    </div>
  `).join('') + '</div>';
}

function prefillRemix(id) {
  const post = viralLibrary.find(p => p.id === id);
  if (!post) return;
  document.getElementById('remix-input').value = post.text;
  switchTab('remix', document.querySelector('.tab-btn:last-child'));
}

function deleteViral(id) {
  viralLibrary = viralLibrary.filter(p => p.id !== id);
  localStorage.setItem('rr_viral', JSON.stringify(viralLibrary));
  renderViralLib();
}

async function runRemix() {
  const niche = document.getElementById('remix-niche').value.trim();
  const text = document.getElementById('remix-input').value.trim();
  if (!text) { showToast('Paste a post to remix'); return; }
  setLoading('remix', true);
  try {
    const result = await callClaude(`You are a viral content strategist. Take this viral post and remix it for ${niche || 'a general audience'}. Keep the same structure, hook style, and viral elements but completely adapt the content for the new niche. Provide 2 remix versions.\n\nOriginal viral post:\n${text}`);
    showOutput('remix', result);
    incrementCount();
    addToHistory('Viral Inspiration', text.substring(0,60), 'badge-viral');
  } catch(e) { showToast(e.message); }
  setLoading('remix', false);
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function incrementCount() {
  contentCount++;
  localStorage.setItem('rr_count', contentCount);
  document.getElementById('content-count').textContent = contentCount;
}

function addToHistory(tool, preview, badgeClass) {
  const record = { tool, preview, badgeClass, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
  contentHistory.unshift(record);
  if (contentHistory.length > 20) contentHistory.pop();
  localStorage.setItem('rr_history', JSON.stringify(contentHistory));
  renderRecentList();
}

function renderRecentList() {
  const list = document.getElementById('recent-list');
  if (contentHistory.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:24px 0;">Your AI-generated content will appear here.<br>Start with a tool to see your history.</div>';
    return;
  }
  list.innerHTML = contentHistory.slice(0,5).map(r => `
    <div class="recent-item fade-in">
      <span class="recent-tool-badge ${r.badgeClass}">${r.tool}</span>
      <div class="recent-text">
        <strong>${escapeHtml(r.tool)}</strong>
        ${escapeHtml(r.preview)}...
        <div class="recent-time">${r.time}</div>
      </div>
    </div>
  `).join('');
}

function copyOutput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || el.innerText).then(() => {
    showToast('✅ Copied to clipboard!', 'success');
  });
}

function copyText(btn) {
  navigator.clipboard.writeText(btn.dataset.text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

const toolBadges = {
  'Caption Writer': 'badge-caption',
  'Algo Analyzer': 'badge-algo',
  'Post History': 'badge-history',
  'Brain Dump': 'badge-brain',
  'Comment Reply': 'badge-comment',
  'Viral Inspiration': 'badge-viral'
};

function saveToHistory(id, tool) {
  const text = document.getElementById(id)?.textContent;
  if (text) addToHistory(tool, text.substring(0,60), toolBadges[tool] || 'badge-brain');
  showToast('✅ Saved to your history!', 'success');
}

function showToast(msg, type = 'error') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast visible ' + (type === 'success' ? 'success' : '');
  setTimeout(() => t.classList.remove('visible'), 3500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
