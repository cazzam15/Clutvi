// Loaded after app.js — upgrades Algo Analyzer into a coach
// without rewriting the rest of the app.

function formatAlgo(d) {
  const why = Array.isArray(d.why) && d.why.length
    ? d.why
    : (d.improvements || []);
  const change = d.change_this || why[0] || '';
  const hook = d.rewritten_hook || '';
  const parts = [];
  if (d.verdict) parts.push(d.verdict);
  if (why.length) parts.push('Why it scored this way:\n' + why.map(x => '• ' + x).join('\n'));
  if (change) parts.push('Change this:\n' + change);
  if (hook) parts.push('Stronger hook:\n' + hook);
  if (Array.isArray(d.improvements) && d.improvements.length && !d.why) {
    parts.push('How to boost it:\n' + d.improvements.map(x => '• ' + x).join('\n'));
  }
  if (d.best_time) parts.push('Best time to post: ' + d.best_time);
  if (d.format) parts.push('Recommended format: ' + d.format);
  return parts.join('\n\n');
}

let lastAlgo = { idea: '', hook: '' };

function hideAlgoExample() {
  const ex = document.getElementById('algo-example');
  if (ex) ex.style.display = 'none';
}

function improveAlgoIdea() {
  const idea = (lastAlgo.idea || document.getElementById('algo-input').value || '').trim();
  const hook = (lastAlgo.hook || '').trim();
  if (!idea && !hook) { showToast('Score an idea first'); return; }
  document.getElementById('algo-input').value = hook
    ? (hook + '\n\nImproved take on: ' + idea)
    : idea;
  runAlgo();
}

function captionFromAlgo() {
  const idea = (lastAlgo.idea || document.getElementById('algo-input').value || '').trim();
  const hook = (lastAlgo.hook || '').trim();
  if (!idea && !hook) { showToast('Score an idea first'); return; }
  const box = document.getElementById('caption-input');
  if (box) box.value = hook ? (hook + '\n\n' + idea) : idea;
  nav('caption');
}

async function runAlgo() {
  const text = document.getElementById('algo-input').value.trim();
  if (!text) { showToast('Describe your content idea first'); return; }
  const plat = getActiveChip('algo-plat');
  setLoading('algo', true);
  try {
    const data = await callClaude('algo', text, { platform: plat });
    lastAlgo = { idea: text, hook: data.rewritten_hook || '' };
    hideAlgoExample();
    const score = data.score;
    document.getElementById('algo-score-wrap').style.display = 'block';
    document.getElementById('algo-bar').style.width = score + '%';
    const numEl = document.getElementById('algo-score-num');
    numEl.textContent = score + '/100';
    numEl.className = 'score-num ' + (score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low');
    showOutput('algo', formatAlgo(data));
    document.getElementById('algo-actions').style.display = 'flex';
    incrementCount();
    addToHistory('algo', text, data);
  } catch (e) { if (!e.handled) showToast(e.message); }
  setLoading('algo', false);
}
