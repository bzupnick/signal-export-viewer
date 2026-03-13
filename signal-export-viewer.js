let allMsgs = [], chatMap = {}, activeChatId = null;
// hashHex -> object URL
let fileIndex = {};
let jsonRaw = '';
// chatId -> display name
let chatNames = {};

// --- base64 → hex (for matching plaintextHash to filename) ---
function b64toHex(b64) {
  try {
    const bin = atob(b64.replace(/-/g,'+').replace(/_/g,'/'));
    return Array.from(bin, c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  } catch { return null; }
}

// Build index: SHA-256(content) hex -> object URL from the files the user dropped
// (plaintextHash in the JSONL is SHA-256 of the decrypted file content, not the filename)
async function buildFileIndex(fileList) {
  fileIndex = {};
  const label = document.getElementById('dz-files-label');
  let done = 0;
  const total = fileList.length;
  for (const f of fileList) {
    try {
      const buf = await f.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      const hex = Array.from(new Uint8Array(hashBuf), b => b.toString(16).padStart(2,'0')).join('');
      fileIndex[hex] = URL.createObjectURL(f);
    } catch {}
    done++;
    if (done % 20 === 0 || done === total) {
      label.textContent = `Indexing… ${done}/${total}`;
    }
  }
  label.textContent = `${total} files indexed`;
}

function getAttachmentUrl(pointer) {
  if (!pointer) return null;
  const hash = pointer.locatorInfo?.plaintextHash;
  if (!hash) return null;
  const hex = b64toHex(hash);
  if (!hex) return null;
  return fileIndex[hex.toLowerCase()] || null;
}

function chatLabel(id) {
  return (chatNames[id] && chatNames[id].trim()) ? chatNames[id].trim() : `Chat ${id}`;
}

function isSkippable(m) {
  return !!(m.updateMessage || m.directionless);
}

function parseMessages(raw) {
  return raw.trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l).chatItem; } catch { return null; }
  }).filter(m => m && !isSkippable(m));
}

function buildChatMap(msgs) {
  const map = {};
  for (const m of msgs) {
    const id = m.chatId || 'unknown';
    if (!map[id]) map[id] = [];
    map[id].push(m);
  }
  return map;
}

function fmt(ts) {
  const d = new Date(Number(ts));
  return isNaN(d) ? '' : d.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}
function fmtDay(ts) {
  const d = new Date(Number(ts));
  return isNaN(d) ? 'Unknown' : d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

function load(text) {
  const msgs = parseMessages(text);
  if (!msgs.length) { showError('No messages found. Check the file format.'); return; }
  allMsgs = msgs;
  chatMap = buildChatMap(msgs);
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  renderSidebar();
  const first = Object.keys(chatMap).sort((a,b) => Number(chatMap[b].at(-1)?.dateSent||0) - Number(chatMap[a].at(-1)?.dateSent||0))[0];
  if (first) selectChat(first);
}

function doLoad() {
  const txt = jsonRaw || document.getElementById('paste-area').value;
  if (!txt.trim()) { showError('Please provide a JSONL file or paste content.'); return; }
  load(txt);
}

function showError(msg) { document.getElementById('error-msg').textContent = msg; }

function reset() {
  allMsgs = []; chatMap = {}; activeChatId = null; jsonRaw = ''; chatNames = {};
  Object.values(fileIndex).forEach(u => URL.revokeObjectURL(u));
  fileIndex = {};
  document.getElementById('upload-screen').style.display = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('paste-area').value = '';
  document.getElementById('chat-search').value = '';
  document.getElementById('msg-search').value = '';
  document.getElementById('dz-json').classList.remove('done');
  document.getElementById('dz-files').classList.remove('done');
  document.getElementById('dz-json-label').innerHTML = 'Drop <strong>main.jsonl</strong> here, or click to browse';
  document.getElementById('dz-files-label').innerHTML = 'Drop the <strong>files/</strong> folder here, or click to browse';
  document.getElementById('dz-names').classList.remove('done');
  document.getElementById('dz-names-label').innerHTML = 'Drop <strong>chat-names.json</strong> here, or click to browse';
  showError('');
}

function renderSidebar() {
  const q = document.getElementById('chat-search').value.toLowerCase();
  const ids = Object.keys(chatMap).filter(id => !q || id.toLowerCase().includes(q));
  ids.sort((a,b) => Number(chatMap[b].at(-1)?.dateSent||0) - Number(chatMap[a].at(-1)?.dateSent||0));
  document.getElementById('chat-list').innerHTML = ids.map(id => {
    const c = chatMap[id].length;
    const active = id === activeChatId ? ' active' : '';
    return `<div class="chat-item${active}" onclick="selectChat('${id}')">
      <div class="chat-item-id">${esc(chatLabel(id))}</div>
      <div class="chat-item-count">${c} message${c!==1?'s':''}</div>
    </div>`;
  }).join('');
}

function selectChat(id) {
  activeChatId = id;
  document.getElementById('msg-search').value = '';
  document.getElementById('chat-title').textContent = chatLabel(id);
  renderSidebar();
  renderMessages();
}

function attachmentHtml(attachments, isMe) {
  if (!attachments?.length) return '';
  return attachments.map(a => {
    const p = a.pointer;
    const ct = p?.contentType || '';
    const fname = p?.fileName || 'attachment';
    const url = getAttachmentUrl(p);
    if (ct.startsWith('image/')) {
      if (url) return `<img class="attach-img" src="${url}" alt="${esc(fname)}" onclick="openLightbox(this.src); event.stopPropagation();">`;
      return `<div class="attach-missing">[image: ${esc(fname)}]</div>`;
    }
    if (url) return `<div class="attach-file"><a href="${url}" download="${esc(fname)}" style="color:inherit;">${esc(fname)}</a></div>`;
    return `<div class="attach-missing">[file: ${esc(fname)}]</div>`;
  }).join('');
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderMessages() {
  if (!activeChatId) return;
  const msgs = chatMap[activeChatId] || [];
  const q = document.getElementById('msg-search').value.toLowerCase();
  const filtered = msgs.filter(m => {
    if (!q) return true;
    const body = m.standardMessage?.text?.body || '';
    const fnames = (m.standardMessage?.attachments||[]).map(a => a.pointer?.fileName||'').join(' ');
    return (body + fnames).toLowerCase().includes(q);
  });

  document.getElementById('search-count').textContent = q ? `${filtered.length} result${filtered.length!==1?'s':''}` : '';

  const sent = msgs.filter(m => m.outgoing).length;
  const withImages = msgs.filter(m => (m.standardMessage?.attachments||[]).some(a => a.pointer?.contentType?.startsWith('image/'))).length;
  const statsEl = document.getElementById('stats');
  statsEl.innerHTML = [
    ['Messages', msgs.length], ['Sent', sent], ['Received', msgs.length - sent],
    ...(withImages ? [['With images', withImages]] : [])
  ].map(([l,v]) => `<div class="stat"><span>${l} </span><strong>${v}</strong></div>`).join('');

  const container = document.getElementById('messages');
  if (!filtered.length) { container.innerHTML = '<div class="no-results">No messages match your search.</div>'; return; }

  let html = '', lastDay = null;
  for (const m of filtered) {
    const day = fmtDay(m.dateSent);
    if (day !== lastDay) {
      html += `<div class="day-divider"><hr><span>${day}</span><hr></div>`;
      lastDay = day;
    }
    const isMe = !!m.outgoing;
    const cls = isMe ? 'me' : 'them';
    const body = esc(m.standardMessage?.text?.body || '');
    const quote = m.standardMessage?.quote;
    const attachments = m.standardMessage?.attachments;
    const reactions = (m.standardMessage?.reactions||[]).map(r=>r.emoji).join('');
    const ts = fmt(m.dateSent);
    const quoteHtml = quote ? `<div class="quote">${esc(quote.text?.body)}</div>` : '';
    const attHtml = attachmentHtml(attachments, isMe);
    html += `<div class="msg-row ${cls}">
      <div class="bubble">${quoteHtml}${attHtml}${body}</div>
      ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
      ${ts ? `<div class="ts">${ts}</div>` : ''}
    </div>`;
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// --- File inputs ---
document.getElementById('fi-json').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = ev => {
    jsonRaw = ev.target.result;
    document.getElementById('dz-json').classList.add('done');
    document.getElementById('dz-json-label').textContent = f.name + ' — ready';
  }; r.readAsText(f);
});

document.getElementById('fi-files').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  await buildFileIndex(files);
  document.getElementById('dz-files').classList.add('done');
});

document.getElementById('fi-names').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = ev => {
    try {
      chatNames = JSON.parse(ev.target.result);
      document.getElementById('dz-names').classList.add('done');
      document.getElementById('dz-names-label').textContent = f.name + ' — ready';
      if (activeChatId) { renderSidebar(); renderMessages(); }
    } catch { showError('Could not parse chat-names.json — check it is valid JSON.'); }
  }; r.readAsText(f);
});

// --- Drag & drop ---
setupDrop('dz-json', false);
setupDrop('dz-files', true);
setupDrop('dz-names', false, true);

function setupDrop(id, isFolder, isNames) {
  const el = document.getElementById(id);
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    if (isFolder) {
      buildFileIndex(files).then(() => el.classList.add('done'));
    } else if (isNames) {
      const r = new FileReader(); r.onload = ev => {
        try {
          chatNames = JSON.parse(ev.target.result);
          el.classList.add('done');
          document.getElementById('dz-names-label').textContent = files[0].name + ' — ready';
          if (activeChatId) { renderSidebar(); renderMessages(); }
        } catch { showError('Could not parse chat-names.json — check it is valid JSON.'); }
      }; r.readAsText(files[0]);
    } else {
      const r = new FileReader(); r.onload = ev => {
        jsonRaw = ev.target.result;
        el.classList.add('done');
        document.getElementById('dz-json-label').textContent = files[0].name + ' — ready';
      }; r.readAsText(files[0]);
    }
  });
}

// --- One-click open via folder input (works in Chrome, Firefox, Safari) ---
document.getElementById('fi-folder').addEventListener('change', async e => {
  const all = Array.from(e.target.files);
  if (!all.length) return;

  // Find main.jsonl by relative path (it's one level inside the chosen folder)
  const jsonlFile = all.find(f => f.webkitRelativePath.split('/').pop() === 'main.jsonl'
                                  && f.webkitRelativePath.split('/').length === 2);
  if (!jsonlFile) { showError('main.jsonl not found — make sure you selected the export folder itself.'); return; }

  jsonRaw = await jsonlFile.text();

  // Find chat-names.json (optional)
  const namesFile = all.find(f => f.webkitRelativePath.split('/').pop() === 'chat-names.json'
                                  && f.webkitRelativePath.split('/').length === 2);
  if (namesFile) {
    try { chatNames = JSON.parse(await namesFile.text()); } catch {}
  }

  // Everything inside files/ (optional, for images)
  const mediaFiles = all.filter(f => f.webkitRelativePath.split('/')[1] === 'files');
  if (mediaFiles.length) await buildFileIndex(mediaFiles);

  load(jsonRaw);
});
