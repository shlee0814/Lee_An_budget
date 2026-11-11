'use strict';

// Interpret dated card and account screenshots, excluding the time/balance rows.
function parsePhotoLines(lines, year, type, width, height) {
  const rows = [];
  let date = '', continuation = null, clipped = 0;
  for (const line of lines) {
    let text = (line.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (line.bbox && line.bbox.y1 >= height - 3) { clipped++; continue; }
    const dateMatch = text.match(/^(\d{1,2})\s*[./월]\s*(\d{1,2})(?=\s|\(|$|[가-힣ㆍ·])/);
    if (dateMatch) {
      const month = Number(dateMatch[1]), day = Number(dateMatch[2]);
      const dt = new Date(year, month - 1, day);
      date = dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day ? localDate(dt) : '';
      continuation = null;
      continue;
    }
    if (!date) continue;
    if (/^\d{1,2}\s*:\s*\d{2}/.test(text) || /^(분할결제|가져오기|이체하기)/.test(text)) { continuation = null; continue; }
    if (type === 'card' && line.words?.length > 1 && line.words[0].bbox.x0 < width * .135 && line.words[1].bbox.x0 > width * .145) {
      text = text.slice(line.words[0].text.length).trim();
    }
    const amountMatch = text.match(/(-?\s*(?:\d{1,3}(?:,\d{3})+|\d+))\s*(원|2!)(?=\s|$)/);
    if (amountMatch && amountMatch.index > 0) {
      const description = text.slice(0, amountMatch.index).trim().replace(/^[|ㆍ·\s]+|[|ㆍ·\s]+$/g, '');
      const amount = Number(amountMatch[1].replace(/[\s,\-]/g, ''));
      if (!description || !Number.isSafeInteger(amount) || amount <= 0) { continuation = null; continue; }
      const kind = type === 'card' || amountMatch[1].includes('-') ? '지출' : '수입';
      const row = {id:uid(), date, kind, description, category:classify(description, kind), amount, uncertain:amountMatch[2] !== '원'};
      rows.push(row); continuation = row;
    } else if (continuation && text.length <= 30 && /^[가-힣a-zA-Z0-9()\s_-]+$/.test(text) && !/원|카드|일시불|신청|이체|잔액/.test(text)) {
      continuation.description += text;
      continuation.category = classify(continuation.description, continuation.kind);
      continuation = null;
    } else { continuation = null; }
  }
  return {rows, clipped};
}

let photoRows = [], photoUrl = '';
let photoLibraryPromise, photoWorker, photoWorkerIdleTimer, photoCurrent = 0, photoTotal = 0;
function loadPhotoLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!photoLibraryPromise) photoLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('ocr/tesseract.min.js', location.href).href;
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR library unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('OCR library failed')); };
    document.head.append(script);
  }).catch(err => { photoLibraryPromise = null; throw err; });
  return photoLibraryPromise;
}
async function getPhotoWorker() {
  clearTimeout(photoWorkerIdleTimer);
  if (photoWorker) return photoWorker;
  const library = await loadPhotoLibrary(), base = new URL('ocr/', location.href).href;
  photoWorker = await library.createWorker('kor+eng', 1, {workerPath:base+'worker.min.js', corePath:base, langPath:base, workerBlobURL:false, logger:m => { const percent = Math.round((m.progress || 0)*100); photoStatus.textContent = `사진 ${photoCurrent || 1}/${photoTotal} 준비·인식 중… ${percent}%`; }});
  return photoWorker;
}
function releasePhotoWorker() {
  clearTimeout(photoWorkerIdleTimer);
  photoWorkerIdleTimer = setTimeout(async () => { const worker = photoWorker; photoWorker = null; if (worker) await worker.terminate(); }, 120000);
}
window.addEventListener('pagehide', () => { clearTimeout(photoWorkerIdleTimer); if (photoWorker) { photoWorker.terminate(); photoWorker = null; } });
const photoFile = $('#photoFile'), photoImage = $('#photoImage'), photoStatus = $('#photoStatus'), photoResults = $('#photoResults');
photoFile.multiple = true;
const photoStyle = document.createElement('link'); photoStyle.rel = 'stylesheet'; photoStyle.href = 'photo-upload.css'; document.head.append(photoStyle);
$('#photoYear').value = selected.getFullYear();

photoFile.addEventListener('change', () => {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = '';
  photoStatus.textContent = '';
  if (!photoRows.length) $('#photoRawDetails').classList.add('hidden');
  if (!photoFile.files.length) { photoImage.classList.add('hidden'); return; }
  photoUrl = URL.createObjectURL(photoFile.files[0]);
  photoImage.src = photoUrl;
  photoImage.classList.remove('hidden');
  photoStatus.textContent = `${photoFile.files.length}장의 사진이 선택되었습니다. 미리보기는 첫 번째 사진입니다.`;
});
for (const control of [$('#photoType'), $('#photoYear')]) control.addEventListener('change', () => {
  if (!photoResults.innerHTML) return;
  photoStatus.textContent = '설정이 변경되었습니다. 기존 확인 내역은 유지됩니다. 새 설정으로 읽으려면 사진을 다시 읽어주세요.';
});

function photoDuplicateKey(row) { return JSON.stringify([row.date, row.description, row.kind, Number(row.amount)]); }
async function checkPhotoDuplicates(rows) {
  const existing = new Set(data.transactions.map(photoDuplicateKey));
  return rows.map(row => existing.has(photoDuplicateKey(row)));
}

function photoRowMarkup(row, i, duplicateKeys) {
  const duplicate = (row.duplicate === true && row.duplicateKey === photoDuplicateKey(row)) || duplicateKeys.has(photoDuplicateKey(row));
  return `<div class="photo-row" data-photo-row="${i}"><div class="photo-row-head"><strong>내역 ${i + 1}</strong><button type="button" class="text-button" data-photo-remove="${i}">제외</button></div>${row.uncertain ? '<p class="warning">금액 인식이 불확실합니다. 사진과 꼭 비교해 주세요.</p>' : ''}${duplicate ? '<p class="warning">같은 날짜와 내용, 금액의 내역이 이미 있습니다. 중복 여부를 확인해 주세요.</p>' : ''}<div class="photo-fields"><label>날짜<input data-field="date" type="date" value="${esc(row.date)}" required></label><label>구분<select data-field="kind"><option ${row.kind === '지출' ? 'selected' : ''}>지출</option><option ${row.kind === '수입' ? 'selected' : ''}>수입</option></select></label><label class="photo-description">내용<input data-field="description" value="${esc(row.description)}" maxlength="100" required></label><label>카테고리<select data-field="category">${categories.map(c => `<option ${row.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label>금액<input data-field="amount" type="number" min="1" step="1" value="${row.amount || ''}" required></label></div></div>`;
}

function syncPhotoRows() {
  for (const node of photoResults.querySelectorAll('[data-photo-row]')) {
    const row = photoRows[Number(node.dataset.photoRow)];
    if (!row) continue;
    for (const input of node.querySelectorAll('[data-field]')) { if(input.dataset.field === 'category' && row.category !== input.value) row.categoryEdited = true; row[input.dataset.field] = input.dataset.field === 'amount' ? Number(input.value) : input.value; }
  }
}
function renderPhotoRows() {
  const duplicateKeys = new Set((data.transactions || []).map(photoDuplicateKey));
  photoResults.innerHTML = `<div class="photo-review"><h3>인식 결과 ${photoRows.length}건</h3><p class="hint">사진과 비교해 날짜, 수입·지출, 내용, 분류와 금액을 확인하세요. 잘못 읽거나 빠진 항목은 수정하거나 추가할 수 있습니다.</p>${photoRows.map((row, i) => photoRowMarkup(row, i, duplicateKeys)).join('')}<div class="photo-actions"><button type="button" class="outline" id="photoAdd">＋ 내역 추가</button><button type="button" class="primary" id="photoSave" ${photoRows.length ? '' : 'disabled'}>확인한 내역 저장</button></div></div>`;
  $('#photoAdd').onclick = () => { syncPhotoRows(); photoRows.push({id:uid(), date:`${$('#photoYear').value}-01-01`, kind:'지출', description:'', category:'기타', amount:0}); renderPhotoRows(); };
  $('#photoSave').onclick = savePhotoRows;
}
photoResults.addEventListener('click', e => {
  const index = e.target.dataset.photoRemove;
  if (index === undefined) return;
  syncPhotoRows(); photoRows.splice(Number(index), 1); renderPhotoRows();
});
async function savePhotoRows() {
  syncPhotoRows();
  if (!photoRows.length) return;
  const valid = photoRows.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.description.trim() && categories.includes(row.category) && ['수입','지출'].includes(row.kind) && Number.isSafeInteger(row.amount) && row.amount > 0);
  if (!valid) { photoStatus.textContent = '모든 내역의 날짜, 내용과 0보다 큰 금액을 확인해 주세요.'; return; }
  const saveButton = $('#photoSave');
  saveButton.disabled = true;
  photoResults.inert = true;
  const controls = [photoFile, $('#photoType'), $('#photoYear'), $('#photoRead')];
  controls.forEach(control => control.disabled = true);
  try {
    const rows = photoRows.map(({uncertain, categoryEdited, duplicate, duplicateKey, ...row}) => ({...row, description:row.description.trim()}));
    const duplicates = await checkPhotoDuplicates(rows);
    const withinBatch = new Set();
    const duplicateCount = rows.reduce((n, row, i) => { const key = photoDuplicateKey(row), duplicate = duplicates[i] || withinBatch.has(key); withinBatch.add(key); return n + Number(duplicate); }, 0);
    if (duplicateCount && !confirm(`이미 있거나 이번에 중복된 내역이 ${duplicateCount}건 있습니다. 그래도 저장할까요?`)) return;
    const outcome = await saveTransactionRows(rows);
    const savedIds = new Set(outcome.saved.map(row => row.id));
    let ruleFailures = 0;
    for (const row of photoRows) if (row.categoryEdited && savedIds.has(row.id)) {
      try { if (!await saveCategoryRule(row.description.trim(), row.kind, row.category)) ruleFailures++; }
      catch { ruleFailures++; }
    }
    photoRows = photoRows.filter(row => !savedIds.has(row.id));
    const savedCount = outcome.saved.length;
    if (photoRows.length) {
      renderPhotoRows();
      photoStatus.textContent = `${savedCount}건을 저장했습니다. ${photoRows.length}건은 저장하지 못해 남겨두었습니다. 다시 시도해 주세요.` + (ruleFailures ? ` 분류 기억 ${ruleFailures}건도 저장하지 못했습니다.` : '');
      return;
    }
    photoResults.innerHTML = ''; photoFile.value = ''; photoImage.classList.add('hidden');
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = ''; $('#photoRawDetails').classList.add('hidden');
    photoStatus.textContent = ruleFailures ? `내역 ${savedCount}건은 저장됐지만 분류 기억 ${ruleFailures}건은 저장되지 않았습니다. 해당 내역을 수정해 분류를 다시 저장해 주세요.` : '';
    toast(`${savedCount}건의 내역을 저장했습니다.`);
  } catch {
    photoStatus.textContent = '중복 확인 또는 저장에 실패했습니다. 내역은 그대로 남아 있으니 연결 상태를 확인한 후 다시 시도해 주세요.';
  } finally {
    photoResults.inert = false;
    controls.forEach(control => control.disabled = false);
    const button = $('#photoSave'); if (button) button.disabled = false;
  }
}

$('#photoRead').addEventListener('click', async () => {
  const files = [...photoFile.files], year = Number($('#photoYear').value), type = $('#photoType').value;
  if (!files.length) { photoStatus.textContent = '먼저 사진을 선택해 주세요.'; return; }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) { photoStatus.textContent = '거래 연도를 확인해 주세요.'; return; }
  if (files.some(file => file.size > 20 * 1024 * 1024)) { photoStatus.textContent = '각 사진은 20MB 이하여야 합니다.'; return; }
  const controls = [photoFile, $('#photoType'), $('#photoYear'), $('#photoRead')];
  if (photoRows.length && !confirm('현재 확인 중인 내역을 지우고 사진을 다시 읽을까요?')) return;
  controls.forEach(x => x.disabled = true);
  photoResults.inert = true;
  let worker;
  try {
    photoStatus.textContent = '사진을 준비하고 있습니다…';
    photoCurrent = 0; photoTotal = files.length;
    worker = await getPhotoWorker();
    const rawTexts = [], failed = [], nextRows = [];
    for (const [index, file] of files.entries()) {
    photoCurrent = index + 1;
    try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, Math.sqrt(5000000 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height); let brightness = 0, samples = 0;
    for (let i = 0; i < pixels.data.length; i += 400) { brightness += (pixels.data[i] + pixels.data[i+1] + pixels.data[i+2]) / 3; samples++; }
    if (brightness / samples < 128) { for (let i = 0; i < pixels.data.length; i += 4) { pixels.data[i] = 255-pixels.data[i]; pixels.data[i+1] = 255-pixels.data[i+1]; pixels.data[i+2] = 255-pixels.data[i+2]; } ctx.putImageData(pixels, 0, 0); }
    const result = await worker.recognize(canvas);
    const parsed = parsePhotoLines(result.data.lines || [], year, type, canvas.width, canvas.height);
    nextRows.push(...parsed.rows); rawTexts.push(`[${file.name}]\n${result.data.text || ''}`);
    } catch { failed.push(file.name); }
    }
    if (failed.length === files.length) throw new Error('모든 사진을 읽지 못했습니다.');
    try {
      const duplicates = await checkPhotoDuplicates(nextRows);
      nextRows.forEach((row, i) => { row.duplicate = !!duplicates[i]; row.duplicateKey = photoDuplicateKey(row); });
    } catch { /* A definitive duplicate check runs again before saving. */ }
    photoRows = nextRows;
    $('#photoRaw').textContent = rawTexts.join('\n\n'); $('#photoRawDetails').classList.remove('hidden'); renderPhotoRows();
    photoStatus.textContent = (photoRows.length ? `${files.length}장 중 ${files.length-failed.length}장을 읽어 ${photoRows.length}건을 찾았습니다. 원본과 비교해 주세요.` : '내역을 찾지 못했습니다. 날짜와 금액이 잘 보이는 사진을 사용하거나 아래에서 직접 추가해 주세요.') + (failed.length ? ` 읽지 못한 사진: ${failed.join(', ')}` : '');
  } catch (err) {
    if (photoWorker) { try { await photoWorker.terminate(); } catch {} photoWorker = null; }
    photoStatus.textContent = '사진을 읽지 못했습니다. 기존 확인 내역은 유지됩니다. PNG, JPG 또는 WebP 사진으로 다시 시도해 주세요.';
  }
  finally { if (photoWorker) releasePhotoWorker(); photoResults.inert = false; controls.forEach(x => x.disabled = false); }
});
