'use strict';

const STORAGE_KEY = 'quiz_exams';
const RESULT_KEY = 'quiz_results';
const SESSION_KEY = 'quiz_active_session';
const DB_NAME = 'quizflow_local_db';
const DB_VERSION = 2;
const $ = (id) => document.getElementById(id);
const letters = ['A', 'B', 'C', 'D'];

let exams = readJson(STORAGE_KEY, []) || [];
if (!exams.length && typeof window !== 'undefined' && window.DEFAULT_DATA?.exams) {
  exams = structuredClone(window.DEFAULT_DATA.exams);
}
let results = readJson(RESULT_KEY, []) || [];
let currentExam = { questions: [] };
let currentQuestionIndex = 0;
let userAnswers = [];
let flaggedQuestions = [];
let resultDetailHtml = '';
let answerLocked = false;
let audioContext = null;
let analysisRunId = 0;
let trueFalseActiveIndex = 0;
let trueFalsePending = null;
let clozeActiveIndex = 0;
let clozePending = null;
let pendingClozeDraft = null;
let directFillActiveIndex = 0;
let directFillPending = '';
let directFillWrongIndex = -1;

const ACCESS_CODE = 'khachhangMinhPhuong';
const ACCESS_STORAGE_KEY = 'quiz_access_authenticated';

function initAuth() {
  const isAuthed = localStorage.getItem(ACCESS_STORAGE_KEY) === ACCESS_CODE;
  const loginGate = $('login-gate');
  const loginForm = $('login-form');
  const loginInput = $('access-code-input');
  const loginError = $('login-error');
  const btnTogglePwd = $('btn-toggle-pwd');
  const btnLogout = $('btn-logout');
  const btnSidebarLogout = $('btn-sidebar-logout');

  if (!isAuthed) {
    loginGate?.classList.remove('hidden');
    document.body.classList.add('locked');
    setTimeout(() => loginInput?.focus(), 150);
  } else {
    loginGate?.classList.add('hidden');
    document.body.classList.remove('locked');
  }

  loginForm?.addEventListener('submit', event => {
    event.preventDefault();
    const typed = (loginInput.value || '').trim();
    if (typed.toLowerCase() === ACCESS_CODE.toLowerCase()) {
      localStorage.setItem(ACCESS_STORAGE_KEY, ACCESS_CODE);
      loginGate.classList.add('hidden');
      document.body.classList.remove('locked');
      loginError?.classList.add('hidden');
      toast('Đăng nhập thành công! Chúc bạn ôn tập tốt.');
    } else {
      loginError?.classList.remove('hidden');
      loginInput.classList.add('shake');
      setTimeout(() => loginInput.classList.remove('shake'), 400);
      loginInput.focus();
    }
  });

  btnTogglePwd?.addEventListener('click', () => {
    const isPwd = loginInput.type === 'password';
    loginInput.type = isPwd ? 'text' : 'password';
    btnTogglePwd.textContent = isPwd ? '🔒' : '👁';
  });

  function doLogout() {
    if (!confirm('Khóa ứng dụng và đăng xuất?')) return;
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    if (loginInput) loginInput.value = '';
    loginError?.classList.add('hidden');
    loginGate?.classList.remove('hidden');
    document.body.classList.add('locked');
    document.querySelector('.sidebar')?.classList.remove('open');
    setTimeout(() => loginInput?.focus(), 150);
  }

  btnLogout?.addEventListener('click', doLogout);
  btnSidebarLogout?.addEventListener('click', doLogout);
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initAuth();
  await loadFromLocalDatabase();
  normalizeQuestionIds();
  normalizeResultIds();
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  $('sidebar-overlay')?.addEventListener('click', () => document.querySelector('.sidebar').classList.remove('open'));
  $('manage-create').addEventListener('click', () => { clearForm(); switchTab('create'); });
  $('btn-add-question').addEventListener('click', () => openQuestionModal());
  $('btn-paste-true-false').addEventListener('click', () => pasteTrueFalseSet());
  $('btn-paste-cloze').addEventListener('click', () => pasteClozeSet());
  $('btn-paste-direct-fill').addEventListener('click', () => pasteDirectFillSet());
  $('empty-add').addEventListener('click', () => openQuestionModal());
  $('btn-clear-form').addEventListener('click', () => { if (currentExam.questions.length && !confirm('Xóa nội dung đang soạn?')) return; clearForm(); });
  $('exam-form').addEventListener('submit', event => { event.preventDefault(); saveExam(); });
  $('questions-container').addEventListener('click', handleQuestionAction);
  initModal();
  initClozeAnswerModal();
  initTaking();
  initManage();
  initKeyboard();
  renderQuestionsList();
  updateExamSelect();
  renderExamList();
  updateStats();
  syncLocalDatabase();
  if (exams.length) switchTab('take');
}

function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(section => section.classList.toggle('active', section.id === `tab-${name}`));
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  const titles = { create: 'Tạo đề thi', take: 'Làm bài thi', manage: 'Kho đề thi' };
  $('page-title').textContent = titles[name];
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.answer-map')?.classList.remove('mobile-open');
  if (name === 'manage') { renderExamList(); updateStats(); }
  if (name === 'take') updateExamSelect();
}

function initModal() {
  simplifyQuestionForm();
  const quickPasteButton = document.createElement('button');
  quickPasteButton.type = 'button';
  quickPasteButton.id = 'btn-quick-paste';
  quickPasteButton.className = 'btn quick-paste';
  quickPasteButton.innerHTML = '⚡ Dán nhanh từ clipboard';
  document.querySelector('#question-form .upload-row').prepend(quickPasteButton);
  quickPasteButton.addEventListener('click', quickPasteQuestion);
  $('question-form').addEventListener('submit', event => { event.preventDefault(); saveQuestion(); });
  $('btn-cancel-modal').addEventListener('click', closeQuestionModal);
  $('modal-x').addEventListener('click', closeQuestionModal);
  $('question-modal').addEventListener('click', event => { if (event.target === $('question-modal')) closeQuestionModal(); });
  $('q-image').addEventListener('change', event => loadImage(event.target.files[0], 'q-image-preview'));
  letters.forEach(letter => {
    const lower = letter.toLowerCase();
    $(`q-option-image-${lower}`).addEventListener('change', event => loadImage(event.target.files[0], `q-option-preview-${lower}`));
    $(`q-option-${lower}`).addEventListener('paste', event => handlePastedImage(event, `q-option-preview-${lower}`));
  });
  $('q-content').addEventListener('paste', event => {
    handlePastedImage(event, 'q-image-preview');
  });
  $('question-form').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-preview]');
    if (!button) return;
    removePreviewImage(button.dataset.removePreview);
  });
}

function simplifyQuestionForm() {
  const answerTitle = document.querySelector('#question-form .field-title');
  const correctField = $('q-correct').closest('.field');
  const settingsGrid = correctField.parentElement;
  correctField.classList.add('correct-answer-field');
  answerTitle.before(correctField);
  $('q-level')?.closest('.field')?.remove();
  $('q-explanation')?.closest('.field')?.remove();
  settingsGrid.remove();
}

async function quickPasteQuestion() {
  let clipboardText = '';
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (error) {
    console.warn('Không đọc được clipboard:', error);
    toast('Hãy cho phép trình duyệt đọc clipboard rồi thử lại.');
    return;
  }
  if (!clipboardText.trim()) return toast('Clipboard không có văn bản.');

  const parsed = parseQuestionBlock(clipboardText);
  if (!parsed.foundOptions.length) {
    $('q-content').value = clipboardText.trim();
    toast('Đã dán vào nội dung câu hỏi; không tìm thấy mẫu A., B., C.');
    return;
  }

  $('q-content').value = parsed.question;
  letters.forEach(letter => {
    $(`q-option-${letter.toLowerCase()}`).value = parsed.options[letter] || '';
  });
  if (!parsed.foundOptions.includes($('q-correct').value)) {
    $('q-correct').value = parsed.foundOptions[0];
  }
  toast(`Đã tách câu hỏi và ${parsed.foundOptions.length} phương án.`);
}

function parseQuestionBlock(rawText) {
  const text = String(rawText).replace(/\r\n?/g, '\n').trim();
  // Nhận A. / A) / A: ở đầu dòng và cho phép nội dung đáp án xuống dòng.
  const marker = /^\s*([A-D])\s*[.):]\s*/gim;
  const matches = [...text.matchAll(marker)];
  const options = { A: '', B: '', C: '', D: '' };
  if (!matches.length) return { question: text, options, foundOptions: [] };

  const question = cleanPastedText(text.slice(0, matches[0].index));
  matches.forEach((match, index) => {
    const letter = match[1].toUpperCase();
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    options[letter] = cleanPastedText(text.slice(start, end));
  });
  return { question, options, foundOptions: letters.filter(letter => options[letter]) };
}

function cleanPastedText(value) {
  return value.trim().replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ');
}

async function pasteTrueFalseSet(replaceIndex = null) {
  let clipboardText = '';
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (error) {
    console.warn('Không đọc được clipboard:', error);
    return toast('Hãy cấp quyền đọc clipboard rồi bấm lại.');
  }
  const parsed = parseTrueFalseSet(clipboardText);
  if (!parsed) return toast('Không nhận ra đủ 10 ý và khóa đáp án dạng 1F 2F 3T ... 10F.');
  const previous = replaceIndex === null ? null : currentExam.questions[replaceIndex];
  const question = {
    id: previous?.id || makeId(),
    type: 'true-false',
    content: 'True / False',
    statements: parsed.statements,
    trueFalseAnswers: parsed.answers,
    image: null,
    options: { A: '', B: '', C: '', D: '' },
    optionImages: { A: null, B: null, C: null, D: null },
    correct: 'A'
  };
  if (replaceIndex === null) currentExam.questions.push(question);
  else currentExam.questions[replaceIndex] = question;
  renderQuestionsList();
  toast(replaceIndex === null ? 'Đã tạo 1 câu True/False gồm 10 ý.' : 'Đã cập nhật câu True/False từ clipboard.');
}

function parseTrueFalseSet(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  const lines = text.split('\n');
  const answerPattern = /\b(10|[1-9])\s*[.):=-]?\s*([TF])\b/gi;
  const keyLineIndex = lines.findIndex(line => [...line.matchAll(answerPattern)].length >= 5);
  if (keyLineIndex < 0) return null;
  const answerMap = {};
  [...lines.slice(keyLineIndex).join(' ').matchAll(answerPattern)].forEach(match => {
    answerMap[Number(match[1])] = match[2].toUpperCase();
  });
  const numbers = Array.from({ length: 10 }, (_, index) => index + 1);
  if (numbers.some(number => !answerMap[number])) return null;

  const questionText = lines.slice(0, keyLineIndex).join('\n').trim();
  const marker = /^\s*(10|[1-9])\s*[.)]\s*/gm;
  const markers = [...questionText.matchAll(marker)];
  const statementMap = {};
  markers.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = markers[index + 1]?.index ?? questionText.length;
    statementMap[Number(match[1])] = cleanPastedText(questionText.slice(start, end));
  });
  if (numbers.some(number => !statementMap[number])) return null;
  return {
    statements: numbers.map(number => statementMap[number]),
    answers: numbers.map(number => answerMap[number])
  };
}

async function pasteClozeSet(replaceIndex = null) {
  let clipboardText = '';
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (error) {
    console.warn('Không đọc được clipboard:', error);
    return toast('Hãy cấp quyền đọc clipboard rồi bấm lại.');
  }
  const parsed = parseClozeSet(clipboardText);
  if (!parsed) return toast('Không nhận ra đoạn văn và đủ 10 dòng lựa chọn A–D.');
  const previousAnswers = replaceIndex === null ? null : currentExam.questions[replaceIndex]?.clozeAnswers;
  pendingClozeDraft = { parsed, replaceIndex, answers: parsed.answers || previousAnswers || Array(10).fill(null) };
  renderClozeAnswerForm();
  $('cloze-key-modal').classList.remove('hidden');
}

function initClozeAnswerModal() {
  $('cloze-key-list').addEventListener('click', event => {
    const button = event.target.closest('[data-cloze-key]');
    if (!button || !pendingClozeDraft) return;
    pendingClozeDraft.answers[Number(button.dataset.index)] = button.dataset.clozeKey;
    renderClozeAnswerForm();
  });
  $('cloze-key-save').addEventListener('click', saveClozeDraft);
  $('cloze-key-cancel').addEventListener('click', closeClozeAnswerModal);
  $('cloze-key-x').addEventListener('click', closeClozeAnswerModal);
  $('cloze-key-modal').addEventListener('click', event => { if (event.target === $('cloze-key-modal')) closeClozeAnswerModal(); });
}

function renderClozeAnswerForm() {
  if (!pendingClozeDraft) return;
  const { parsed, answers, replaceIndex } = pendingClozeDraft;
  $('cloze-key-title').textContent = replaceIndex === null ? 'Chọn đáp án đúng cho 10 ý' : 'Cập nhật đáp án đúng cho 10 ý';
  $('cloze-key-list').innerHTML = parsed.subQuestions.map((subQuestion, index) => `
    <section class="cloze-key-row ${answers[index] ? 'complete' : ''}">
      <span class="cloze-key-number">${index + 1}</span>
      <div class="cloze-key-options">${letters.map(letter => `<button type="button" class="cloze-key-option ${answers[index] === letter ? 'selected' : ''}" data-cloze-key="${letter}" data-index="${index}"><b>${letter}</b><span>${escapeHtml(subQuestion.options[letter])}</span></button>`).join('')}</div>
    </section>`).join('');
  const selectedCount = answers.filter(Boolean).length;
  $('cloze-key-save').textContent = selectedCount === 10 ? (replaceIndex === null ? 'Tạo câu 10 ý' : 'Lưu thay đổi') : `Đã chọn ${selectedCount}/10`;
  $('cloze-key-save').disabled = selectedCount !== 10;
}

function saveClozeDraft() {
  if (!pendingClozeDraft || pendingClozeDraft.answers.some(answer => !answer)) return;
  const { parsed, replaceIndex, answers } = pendingClozeDraft;
  const previous = replaceIndex === null ? null : currentExam.questions[replaceIndex];
  const question = {
    id: previous?.id || makeId(),
    type: 'cloze-bundle',
    content: parsed.passage,
    subQuestions: parsed.subQuestions,
    clozeAnswers: [...answers],
    image: null,
    options: { A: '', B: '', C: '', D: '' },
    optionImages: { A: null, B: null, C: null, D: null },
    correct: 'A'
  };
  if (replaceIndex === null) currentExam.questions.push(question);
  else currentExam.questions[replaceIndex] = question;
  closeClozeAnswerModal();
  renderQuestionsList();
  toast(replaceIndex === null ? 'Đã tạo 1 câu đoạn văn gồm 10 ý A–D.' : 'Đã cập nhật câu đoạn văn từ clipboard.');
}

function closeClozeAnswerModal() {
  $('cloze-key-modal').classList.add('hidden');
  pendingClozeDraft = null;
}

function parseClozeSet(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  const lines = text.split('\n');
  const answerLinePattern = /\b(10|[1-9])\s*[.):=-]?\s*([A-D])\b/gi;
  const keyLineIndex = lines.findIndex(line => [...line.matchAll(answerLinePattern)].length >= 5);
  const body = (keyLineIndex >= 0 ? lines.slice(0, keyLineIndex) : lines).join('\n').trim();
  const questionMarker = /^\s*(10|[1-9])\s*[.)]\s*(?=A\s*[.)])/gim;
  const markers = [...body.matchAll(questionMarker)];
  if (markers.length !== 10) return null;
  const passage = body.slice(0, markers[0].index).trim();
  if (!passage) return null;
  const subQuestionMap = {};
  markers.forEach((match, index) => {
    const number = Number(match[1]);
    const start = match.index + match[0].length;
    const end = markers[index + 1]?.index ?? body.length;
    const block = body.slice(start, end).trim();
    const optionMarker = /(?:^|\s)([A-D])\s*[.)]\s*/g;
    const optionMatches = [...block.matchAll(optionMarker)];
    const options = {};
    optionMatches.forEach((optionMatch, optionIndex) => {
      const optionStart = optionMatch.index + optionMatch[0].length;
      const optionEnd = optionMatches[optionIndex + 1]?.index ?? block.length;
      options[optionMatch[1]] = cleanPastedText(block.slice(optionStart, optionEnd));
    });
    if (letters.every(letter => options[letter])) subQuestionMap[number] = options;
  });
  const numbers = Array.from({ length: 10 }, (_, index) => index + 1);
  if (numbers.some(number => !subQuestionMap[number])) return null;
  const answers = keyLineIndex >= 0 ? parseNumberedAnswerKey(lines.slice(keyLineIndex).join(' '), letters) : null;
  return { passage, subQuestions: numbers.map(number => ({ number, options: subQuestionMap[number] })), answers };
}

function parseNumberedAnswerKey(value, allowedAnswers) {
  const matches = [...String(value || '').matchAll(/\b(10|[1-9])\s*[.):=-]?\s*([A-Z])\b/gi)];
  const answerMap = {};
  matches.forEach(match => {
    const answer = match[2].toUpperCase();
    if (allowedAnswers.includes(answer)) answerMap[Number(match[1])] = answer;
  });
  const numbers = Array.from({ length: 10 }, (_, index) => index + 1);
  return numbers.every(number => answerMap[number]) ? numbers.map(number => answerMap[number]) : null;
}

async function pasteDirectFillSet(replaceIndex = null) {
  let clipboardText = '';
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (error) {
    console.warn('Không đọc được clipboard:', error);
    return toast('Hãy cấp quyền đọc clipboard rồi bấm lại.');
  }
  const items = parseDirectFillSet(clipboardText);
  if (!items) return toast('Không nhận ra form điền trực tiếp. Mỗi ý cần có câu chứa dấu chấm và đáp án ở dòng cuối.');
  const previous = replaceIndex === null ? null : currentExam.questions[replaceIndex];
  const question = {
    id: previous?.id || makeId(),
    type: 'direct-fill',
    content: items[0].prompt,
    fillItems: items,
    image: null,
    options: { A: '', B: '', C: '', D: '' },
    optionImages: { A: null, B: null, C: null, D: null },
    correct: 'A'
  };
  if (replaceIndex === null) currentExam.questions.push(question);
  else currentExam.questions[replaceIndex] = question;
  renderQuestionsList();
  toast(`Đã tạo 1 câu điền trực tiếp gồm ${items.length} ý.`);
}

function parseDirectFillSet(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  const marker = /^\s*(\d+)\s*[.)]\s*/gm;
  const markers = [...text.matchAll(marker)];
  if (!markers.length) return null;
  const items = [];
  markers.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = markers[index + 1]?.index ?? text.length;
    const lines = text.slice(start, end).split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return;
    const answerLine = lines.pop().replace(/[;；]\s*$/, '').trim();
    const answers = answerLine.split(/\s*\/\s*/).map(answer => answer.trim()).filter(Boolean);
    const promptText = lines.join('\n').trim();
    if (!/\.{3,}/.test(promptText) || !answers.length) return;
    items.push({ number: Number(match[1]), prompt: promptText, answers });
  });
  if (items.length !== markers.length) return null;
  return items;
}

function handlePastedImage(event, previewId) {
  const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
  if (item) { event.preventDefault(); loadImage(item.getAsFile(), previewId); }
}

function openQuestionModal(index = null) {
  $('question-form').reset();
  $('question-index').value = index ?? '';
  $('q-image-preview').innerHTML = '';
  $('q-image-preview').classList.add('hidden');
  letters.forEach(letter => {
    const preview = $(`q-option-preview-${letter.toLowerCase()}`);
    preview.innerHTML = '';
    preview.classList.add('hidden');
  });
  if (index !== null) {
    const q = currentExam.questions[index];
    $('modal-title').textContent = 'Chỉnh sửa câu hỏi';
    $('q-content').value = q.content;
    letters.forEach(letter => $(`q-option-${letter.toLowerCase()}`).value = q.options?.[letter] || '');
    $('q-correct').value = q.correct;
    if (q.image) showImage(q.image, 'q-image-preview', 'Ảnh câu hỏi');
    letters.forEach(letter => {
      const source = q.optionImages?.[letter];
      if (source) showImage(source, `q-option-preview-${letter.toLowerCase()}`, `Ảnh đáp án ${letter}`);
    });
  } else {
    $('modal-title').textContent = 'Thêm câu hỏi';
  }
  $('question-modal').classList.remove('hidden');
  setTimeout(() => $('q-content').focus(), 50);
}

function closeQuestionModal() { $('question-modal').classList.add('hidden'); }

function loadImage(file, previewId) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Tệp đã chọn không phải hình ảnh.');
  if (file.size > 2.5 * 1024 * 1024) return toast('Ảnh cần nhỏ hơn 2,5 MB.');
  const reader = new FileReader();
  reader.onload = event => showImage(event.target.result, previewId, 'Ảnh đã chọn');
  reader.readAsDataURL(file);
}

function showImage(source, previewId, alt) {
  $(previewId).innerHTML = `<img src="${source}" alt="${alt}"><button type="button" class="remove-image" data-remove-preview="${previewId}" aria-label="Gỡ ảnh">× <span>Gỡ ảnh</span></button>`;
  $(previewId).classList.remove('hidden');
}

function removePreviewImage(previewId) {
  const preview = $(previewId);
  preview.innerHTML = '';
  preview.classList.add('hidden');
  const inputId = previewId === 'q-image-preview'
    ? 'q-image'
    : `q-option-image-${previewId.slice(-1)}`;
  const fileInput = $(inputId);
  if (fileInput) fileInput.value = '';
  toast('Đã gỡ ảnh.');
}

function saveQuestion() {
  const indexValue = $('question-index').value;
  const previous = indexValue === '' ? null : currentExam.questions[Number(indexValue)];
  const question = {
    id: previous?.id || makeId(),
    content: $('q-content').value.trim(),
    image: $('q-image-preview').querySelector('img')?.src || null,
    options: Object.fromEntries(letters.map(letter => [letter, $(`q-option-${letter.toLowerCase()}`).value.trim()])),
    optionImages: Object.fromEntries(letters.map(letter => [letter, $(`q-option-preview-${letter.toLowerCase()}`).querySelector('img')?.src || null])),
    correct: $('q-correct').value
  };
  const available = availableOptions(question);
  if (available.length < 2) {
    return toast('Cần ít nhất hai phương án có chữ hoặc hình ảnh.');
  }
  if (!available.includes(question.correct)) {
    return toast(`Đáp án đúng ${question.correct} đang để trống.`);
  }
  if (indexValue === '') {
    currentExam.questions.push(question);
    renderQuestionsList();
    openQuestionModal();
    $('modal-title').textContent = `Thêm câu hỏi ${currentExam.questions.length + 1}`;
    toast(`Đã lưu câu ${currentExam.questions.length}. Tiếp tục nhập câu mới.`);
  } else {
    currentExam.questions[Number(indexValue)] = question;
    closeQuestionModal();
    renderQuestionsList();
    toast('Đã cập nhật câu hỏi.');
  }
}

function handleQuestionAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'edit') {
    if (currentExam.questions[index]?.type === 'true-false') pasteTrueFalseSet(index);
    else if (currentExam.questions[index]?.type === 'cloze-bundle') pasteClozeSet(index);
    else if (currentExam.questions[index]?.type === 'direct-fill') pasteDirectFillSet(index);
    else openQuestionModal(index);
  }
  if (button.dataset.action === 'copy') {
    const copy = structuredClone(currentExam.questions[index]);
    copy.id = makeId();
    currentExam.questions.splice(index + 1, 0, copy);
    renderQuestionsList(); toast('Đã nhân bản câu hỏi.');
  }
  if (button.dataset.action === 'delete' && confirm(`Xóa câu ${index + 1}?`)) {
    currentExam.questions.splice(index, 1); renderQuestionsList();
  }
}

function renderQuestionsList() {
  const questions = currentExam.questions || [];
  $('question-count').textContent = questions.length ? `${questions.length} câu hỏi` : 'Chưa có câu hỏi';
  $('empty-add').classList.toggle('hidden', questions.length > 0);
  $('questions-container').innerHTML = questions.map((q, index) => `
    <article class="question-item">
      <span class="q-number">${index + 1}</span>
      <div><div class="q-content">${escapeHtml(q.type === 'true-false' ? q.statements?.[0] || 'True / False' : q.content || '[Câu hỏi bằng hình ảnh]')}</div><div class="q-meta">${q.type === 'true-false' ? '<span>True/False</span><span>•</span><span>10 ý nhỏ</span>' : q.type === 'cloze-bundle' ? '<span>Đoạn văn điền từ</span><span>•</span><span>10 ý A–D</span>' : q.type === 'direct-fill' ? `<span>Điền trực tiếp</span><span>•</span><span>${q.fillItems.length} ý nhỏ</span>` : `<span>${availableOptions(q).length} phương án</span><span>•</span><span>Đáp án ${escapeHtml(q.correct)}</span>`}${q.image ? '<span>• Có hình ảnh</span>' : ''}</div></div>
      <div class="q-actions"><button type="button" data-action="edit" data-index="${index}" title="${['true-false','cloze-bundle','direct-fill'].includes(q.type) ? 'Dán lại từ clipboard' : 'Sửa'}">${['true-false','cloze-bundle','direct-fill'].includes(q.type) ? '↻' : '✎'}</button><button type="button" data-action="copy" data-index="${index}" title="Nhân bản">⧉</button><button type="button" data-action="delete" data-index="${index}" title="Xóa">×</button></div>
    </article>`).join('');
}

function saveExam() {
  const title = $('exam-title').value.trim();
  if (!title || !currentExam.questions.length) return toast(!title ? 'Hãy nhập tên đề thi.' : 'Hãy thêm ít nhất một câu hỏi.');
  const now = new Date().toISOString();
  const data = { id: currentExam.id || makeId(), title, description: $('exam-desc').value.trim(), passScore: clamp(Number($('exam-pass').value), 0, 100), questions: currentExam.questions, createdAt: currentExam.createdAt || now, updatedAt: now };
  const index = exams.findIndex(exam => exam.id === data.id);
  if (index < 0) exams.unshift(data); else exams[index] = data;
  saveData();
  if (index < 0) {
    clearForm();
    switchTab('create');
    toast('Tạo đề thi thành công. Trang tạo đề mới đã sẵn sàng.');
  } else {
    clearForm();
    switchTab('manage');
    toast('Đã lưu thay đổi.');
  }
}

function clearForm() {
  currentExam = { questions: [] };
  $('exam-form').reset(); $('exam-pass').value = 50;
  $('draft-badge').textContent = 'Bản nháp mới'; renderQuestionsList();
}

function initTaking() {
  $('exam-select').addEventListener('change', event => $('btn-start-exam').disabled = !event.target.value);
  $('btn-start-exam').addEventListener('click', startExam);
  $('btn-prev').addEventListener('click', () => navigate(-1));
  $('btn-next').addEventListener('click', () => navigate(1));
  $('btn-flag').addEventListener('click', toggleFlag);
  $('btn-submit').addEventListener('click', submitExam);
  $('btn-submit-top').addEventListener('click', submitExam);
  $('btn-exit-exam').addEventListener('click', exitExam);
  $('btn-toggle-answer-map')?.addEventListener('click', () => {
    document.querySelector('.answer-map')?.classList.toggle('mobile-open');
  });
  $('btn-review-result').addEventListener('click', () => { $('result-detail').innerHTML = resultDetailHtml; $('result-detail').classList.toggle('hidden'); $('btn-review-result').textContent = $('result-detail').classList.contains('hidden') ? 'Xem chi tiết' : 'Ẩn chi tiết'; });
  $('btn-close-result').addEventListener('click', () => { $('result-modal').classList.add('hidden'); switchTab('manage'); });
}

function exitExam() {
  if (!confirm('Thoát bài thi? Tiến độ hiện tại vẫn được lưu để bạn có thể tiếp tục sau.')) return;
  answerLocked = false;
  trueFalsePending = null;
  clozePending = null;
  directFillPending = '';
  document.querySelector('.answer-map')?.classList.remove('mobile-open');
  $('exam-taking').classList.add('hidden');
  $('exam-selector').classList.remove('hidden');
  document.body.classList.remove('exam-focus');
  $('exam-select').value = '';
  $('btn-start-exam').disabled = true;
  toast('Đã thoát bài. Tiến độ vẫn được lưu.');
}

function updateExamSelect() {
  const selected = $('exam-select').value;
  $('exam-select').innerHTML = '<option value="">— Chọn một đề thi —</option>' + exams.map(exam => `<option value="${escapeAttr(exam.id)}">${escapeHtml(exam.title)} · ${exam.questions.length} câu</option>`).join('');
  if (exams.some(exam => exam.id === selected)) {
    $('exam-select').value = selected;
  } else if (exams.length > 0) {
    $('exam-select').value = exams[0].id;
  }
  $('btn-start-exam').disabled = !$('exam-select').value;
}

function startExam() {
  const exam = exams.find(item => item.id === $('exam-select').value);
  if (!exam) return;
  // Tách bản làm bài khỏi dữ liệu gốc để mọi thao tác trong phiên thi
  // không thể vô tình thay đổi đề đã lưu.
  currentExam = structuredClone(exam);
  const saved = readJson(SESSION_KEY, null);
  const canResume = saved?.examId === exam.id && saved.answers?.length === exam.questions.length;
  if (canResume && confirm('Bạn có một bài đang làm dở. Tiếp tục bài cũ?')) {
    userAnswers = saved.answers; flaggedQuestions = saved.flagged || []; currentQuestionIndex = saved.index || 0;
  } else {
    userAnswers = exam.questions.map(question => {
      if (question.type === 'true-false') return Array(question.statements.length).fill(null);
      if (question.type === 'cloze-bundle') return Array(question.subQuestions.length).fill(null);
      if (question.type === 'direct-fill') return Array(question.fillItems.length).fill(null);
      return null;
    }); flaggedQuestions = Array(exam.questions.length).fill(false); currentQuestionIndex = 0;
  }
  trueFalsePending = null;
  trueFalseActiveIndex = firstUnansweredTrueFalse(currentExam.questions[currentQuestionIndex], userAnswers[currentQuestionIndex]);
  clozePending = null;
  clozeActiveIndex = firstUnansweredCloze(currentExam.questions[currentQuestionIndex], userAnswers[currentQuestionIndex]);
  directFillPending = '';
  directFillWrongIndex = -1;
  directFillActiveIndex = firstUnansweredDirectFill(currentExam.questions[currentQuestionIndex], userAnswers[currentQuestionIndex]);
  $('exam-selector').classList.add('hidden'); $('exam-taking').classList.remove('hidden'); $('current-exam-title').textContent = exam.title; document.body.classList.add('exam-focus');
  renderCurrentQuestion(); renderQuestionNav(); updateProgress(); saveSession();
}

function renderCurrentQuestion() {
  const q = currentExam.questions[currentQuestionIndex];
  if (q.type === 'true-false') return renderTrueFalseQuestion(q);
  if (q.type === 'cloze-bundle') return renderClozeQuestion(q);
  if (q.type === 'direct-fill') return renderDirectFillQuestion(q);
  const visibleLetters = availableOptions(q);
  $('question-number').textContent = `Câu ${currentQuestionIndex + 1} / ${currentExam.questions.length}`;
  $('question-content').innerHTML = `${escapeHtml(q.content)}${q.image ? `<img src="${q.image}" alt="Hình minh họa câu hỏi">` : ''}`;
  $('options-container').innerHTML = visibleLetters.map(letter => `<label class="option ${userAnswers[currentQuestionIndex] === letter ? 'selected' : ''}"><input type="radio" name="answer" value="${letter}" ${userAnswers[currentQuestionIndex] === letter ? 'checked' : ''}><span class="option-letter">${letter}</span><span class="option-body">${q.options[letter] ? `<span>${escapeHtml(q.options[letter])}</span>` : ''}${q.optionImages?.[letter] ? `<span class="option-media"><img src="${q.optionImages[letter]}" alt="Hình ảnh đáp án ${letter}"></span>` : ''}</span></label>`).join('');
  $('options-container').querySelectorAll('.option').forEach(option => option.addEventListener('click', () => selectOption(option.querySelector('input').value)));
  $('btn-prev').disabled = currentQuestionIndex === 0; $('btn-next').disabled = currentQuestionIndex === currentExam.questions.length - 1;
  $('btn-flag').classList.toggle('active', !!flaggedQuestions[currentQuestionIndex]); $('btn-flag').textContent = flaggedQuestions[currentQuestionIndex] ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại';
}

function renderTrueFalseQuestion(question) {
  const answers = Array.isArray(userAnswers[currentQuestionIndex]) ? userAnswers[currentQuestionIndex] : Array(10).fill(null);
  userAnswers[currentQuestionIndex] = answers;
  $('question-number').textContent = `Câu ${currentQuestionIndex + 1} / ${currentExam.questions.length} · True/False`;
  $('question-content').innerHTML = '<span class="tf-instruction">Nhấn <b>1 = True</b>, <b>2 = False</b>, sau đó <b>Enter</b> để kiểm tra và sang ý tiếp theo.</span>';
  $('options-container').innerHTML = question.statements.map((statement, index) => {
    const answer = answers[index];
    const isActive = index === trueFalseActiveIndex;
    const isCorrect = answer && answer === question.trueFalseAnswers[index];
    const status = answer ? (isCorrect ? 'correct' : 'incorrect') : (isActive ? 'active' : '');
    const selected = isActive ? trueFalsePending : null;
    return `<article class="tf-row ${status}" data-tf-index="${index}"><span class="tf-number">${index + 1}</span><div class="tf-statement">${escapeHtml(statement)}</div><div class="tf-actions"><button type="button" class="tf-choice ${selected === 'T' || answer === 'T' ? 'selected' : ''}" data-tf-value="T" data-tf-index="${index}" ${answer ? 'disabled' : ''}>1 · T</button><button type="button" class="tf-choice ${selected === 'F' || answer === 'F' ? 'selected' : ''}" data-tf-value="F" data-tf-index="${index}" ${answer ? 'disabled' : ''}>2 · F</button>${answer ? `<span class="tf-result">${isCorrect ? '✓' : `✕ ${question.trueFalseAnswers[index]}`}</span>` : ''}</div></article>`;
  }).join('') + '<button type="button" id="btn-check-tf" class="btn primary tf-check">Kiểm tra ý hiện tại · Enter</button>';
  $('options-container').querySelectorAll('[data-tf-value]').forEach(button => button.addEventListener('click', () => selectTrueFalse(button.dataset.tfValue, Number(button.dataset.tfIndex))));
  $('btn-check-tf').addEventListener('click', checkTrueFalseAnswer);
  $('btn-prev').disabled = currentQuestionIndex === 0; $('btn-next').disabled = currentQuestionIndex === currentExam.questions.length - 1;
  $('btn-flag').classList.toggle('active', !!flaggedQuestions[currentQuestionIndex]);
  $('btn-flag').textContent = flaggedQuestions[currentQuestionIndex] ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại';
}

function selectTrueFalse(value, index = trueFalseActiveIndex) {
  if (answerLocked) return;
  const answers = userAnswers[currentQuestionIndex];
  if (!Array.isArray(answers) || index < 0 || answers[index]) return;
  trueFalseActiveIndex = index;
  trueFalsePending = value;
  renderCurrentQuestion();
}

function checkTrueFalseAnswer() {
  const question = currentExam.questions[currentQuestionIndex];
  if (question?.type !== 'true-false' || answerLocked) return;
  if (!trueFalsePending) return toast('Chọn 1 = True hoặc 2 = False trước khi nhấn Enter.');
  const answers = userAnswers[currentQuestionIndex];
  answers[trueFalseActiveIndex] = trueFalsePending;
  const wasCorrect = trueFalsePending === question.trueFalseAnswers[trueFalseActiveIndex];
  trueFalsePending = null;
  if (wasCorrect) playCorrectChime();
  answerLocked = true;
  renderCurrentQuestion(); renderQuestionNav(); updateProgress(); saveSession();
  setTimeout(() => {
    answerLocked = false;
    const next = firstUnansweredTrueFalse(question, answers);
    if (next >= 0) {
      trueFalseActiveIndex = next;
      renderCurrentQuestion();
    } else if (currentQuestionIndex < currentExam.questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    }
  }, 420);
}

function firstUnansweredTrueFalse(question, answers) {
  if (question?.type !== 'true-false') return 0;
  const index = Array.isArray(answers) ? answers.findIndex(answer => !answer) : 0;
  return index;
}

function renderClozeQuestion(question) {
  const answers = Array.isArray(userAnswers[currentQuestionIndex]) ? userAnswers[currentQuestionIndex] : Array(10).fill(null);
  userAnswers[currentQuestionIndex] = answers;
  $('question-number').textContent = `Câu ${currentQuestionIndex + 1} / ${currentExam.questions.length} · Điền từ`;
  $('question-content').innerHTML = `<div class="cloze-passage">${escapeHtml(question.content)}</div><span class="tf-instruction">Nhấn <b>1–4 = A–D</b>, sau đó <b>Enter</b> để kiểm tra và sang ý tiếp theo.</span>`;
  $('options-container').innerHTML = question.subQuestions.map((subQuestion, index) => {
    const answer = answers[index];
    const isActive = index === clozeActiveIndex;
    const isCorrect = answer && answer === question.clozeAnswers[index];
    const status = answer ? (isCorrect ? 'correct' : 'incorrect') : (isActive ? 'active' : '');
    const selected = isActive ? clozePending : null;
    return `<article class="tf-row cloze-row ${status}"><span class="tf-number">${index + 1}</span><div class="cloze-options">${letters.map((letter, keyIndex) => `<button type="button" class="cloze-choice ${selected === letter || answer === letter ? 'selected' : ''}" data-cloze-value="${letter}" data-cloze-index="${index}" ${answer ? 'disabled' : ''}><b>${keyIndex + 1} · ${letter}</b><span>${escapeHtml(subQuestion.options[letter])}</span></button>`).join('')}</div>${answer ? `<span class="tf-result">${isCorrect ? '✓' : `✕ ${question.clozeAnswers[index]}`}</span>` : ''}</article>`;
  }).join('') + '<button type="button" id="btn-check-cloze" class="btn primary tf-check">Kiểm tra ý hiện tại · Enter</button>';
  $('options-container').querySelectorAll('[data-cloze-value]').forEach(button => button.addEventListener('click', () => selectClozeAnswer(button.dataset.clozeValue, Number(button.dataset.clozeIndex))));
  $('btn-check-cloze').addEventListener('click', checkClozeAnswer);
  $('btn-prev').disabled = currentQuestionIndex === 0; $('btn-next').disabled = currentQuestionIndex === currentExam.questions.length - 1;
  $('btn-flag').classList.toggle('active', !!flaggedQuestions[currentQuestionIndex]);
  $('btn-flag').textContent = flaggedQuestions[currentQuestionIndex] ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại';
}

function selectClozeAnswer(value, index = clozeActiveIndex) {
  if (answerLocked) return;
  const answers = userAnswers[currentQuestionIndex];
  if (!Array.isArray(answers) || index < 0 || answers[index]) return;
  clozeActiveIndex = index;
  clozePending = value;
  renderCurrentQuestion();
}

function checkClozeAnswer() {
  const question = currentExam.questions[currentQuestionIndex];
  if (question?.type !== 'cloze-bundle' || answerLocked) return;
  if (!clozePending) return toast('Chọn 1–4 tương ứng A–D trước khi nhấn Enter.');
  const answers = userAnswers[currentQuestionIndex];
  answers[clozeActiveIndex] = clozePending;
  const wasCorrect = clozePending === question.clozeAnswers[clozeActiveIndex];
  clozePending = null;
  if (wasCorrect) playCorrectChime();
  answerLocked = true;
  renderCurrentQuestion(); renderQuestionNav(); updateProgress(); saveSession();
  setTimeout(() => {
    answerLocked = false;
    const next = firstUnansweredCloze(question, answers);
    if (next >= 0) {
      clozeActiveIndex = next;
      renderCurrentQuestion();
    } else if (currentQuestionIndex < currentExam.questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    }
  }, 420);
}

function firstUnansweredCloze(question, answers) {
  if (question?.type !== 'cloze-bundle') return 0;
  return Array.isArray(answers) ? answers.findIndex(answer => !answer) : 0;
}

function renderDirectFillQuestion(question) {
  const answers = Array.isArray(userAnswers[currentQuestionIndex]) ? userAnswers[currentQuestionIndex] : Array(question.fillItems.length).fill(null);
  userAnswers[currentQuestionIndex] = answers;
  $('question-number').textContent = `Câu ${currentQuestionIndex + 1} / ${currentExam.questions.length} · Điền từ`;
  
  const titleHtml = question.passageTitle ? `<div class="passage-heading"><strong>📖 ${escapeHtml(question.passageTitle)}</strong></div>` : '';
  const togglePassageHtml = question.passage ? `<div class="passage-toggle-wrap"><button type="button" id="btn-toggle-passage" class="btn ghost btn-sm">📜 Xem toàn bộ bài đọc</button><div id="full-passage-box" class="cloze-passage full-passage hidden">${escapeHtml(question.passage)}</div></div>` : '';
  
  $('question-content').innerHTML = `${titleHtml}${togglePassageHtml}<span class="tf-instruction">Đọc dòng chứa chỗ trống bên dưới, gõ từ cần điền vào ô rồi bấm <b>Enter</b> hoặc bấm nút <b>Kiểm tra đáp án</b>.</span>`;

  $('btn-toggle-passage')?.addEventListener('click', () => {
    const box = $('full-passage-box');
    if (box) {
      box.classList.toggle('hidden');
      $('btn-toggle-passage').textContent = box.classList.contains('hidden') ? '📜 Xem toàn bộ bài đọc' : 'Ẩn bài đọc';
    }
  });

  $('options-container').innerHTML = question.fillItems.map((item, index) => {
    const answer = answers[index];
    const isActive = index === directFillActiveIndex;
    const value = answer || (isActive ? directFillPending : '');
    const status = answer ? 'correct' : (directFillWrongIndex === index ? 'incorrect active' : (isActive ? 'active' : ''));
    const promptSentence = item.prompt || question.content || `Chỗ trống (${item.number || index + 1})`;
    const badgeNum = item.number ? item.number : (question.fillItems.length > 1 ? index + 1 : currentQuestionIndex + 1);
    return `<article class="direct-fill-row single-entry ${status}">
      <span class="tf-number">${badgeNum}</span>
      <div class="direct-fill-body">
        <div class="direct-fill-prompt">${escapeHtml(promptSentence)}</div>
        <div class="direct-fill-entry">
          <input type="text" data-direct-index="${index}" value="${escapeAttr(value)}" placeholder="Gõ đáp án..." ${answer ? 'disabled' : ''} autocomplete="off" spellcheck="false" autofocus>
          <span class="direct-status-msg">${answer ? '✓ Đúng (Đáp án: ' + escapeHtml(answer) + ')' : directFillWrongIndex === index ? 'Chưa đúng, thử lại' : 'Enter để kiểm tra'}</span>
        </div>
      </div>
    </article>`;
  }).join('') + '<button type="button" id="btn-check-direct" class="btn primary tf-check">Kiểm tra đáp án · Enter</button>';

  $('options-container').querySelectorAll('[data-direct-index]').forEach(input => {
    input.addEventListener('focus', () => activateDirectFill(Number(input.dataset.directIndex), input.value));
    input.addEventListener('input', () => { if (Number(input.dataset.directIndex) === directFillActiveIndex) { directFillPending = input.value; directFillWrongIndex = -1; } });
  });
  $('btn-check-direct').addEventListener('click', checkDirectFillAnswer);
  $('btn-prev').disabled = currentQuestionIndex === 0; $('btn-next').disabled = currentQuestionIndex === currentExam.questions.length - 1;
  $('btn-flag').classList.toggle('active', !!flaggedQuestions[currentQuestionIndex]);
  $('btn-flag').textContent = flaggedQuestions[currentQuestionIndex] ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại';
  setTimeout(() => {
    const input = document.querySelector(`input[data-direct-index="${directFillActiveIndex}"]`);
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }, 0);
}

function activateDirectFill(index, value = '') {
  const answers = userAnswers[currentQuestionIndex];
  if (!Array.isArray(answers) || answers[index]) return;
  directFillActiveIndex = index;
  directFillPending = value;
  directFillWrongIndex = -1;
  document.querySelectorAll('.direct-fill-row').forEach((row, rowIndex) => row.classList.toggle('active', rowIndex === index));
}

function checkDirectFillAnswer() {
  const question = currentExam.questions[currentQuestionIndex];
  if (question?.type !== 'direct-fill' || answerLocked || directFillActiveIndex < 0) return;
  const inputEl = document.querySelector(`input[data-direct-index="${directFillActiveIndex}"]`);
  if (inputEl && inputEl.value) directFillPending = inputEl.value;
  const typed = directFillPending.trim();
  if (!typed) return toast('Hãy gõ đáp án trước khi nhấn Enter.');
  const item = question.fillItems[directFillActiveIndex];
  const isCorrect = item.answers.some(answer => normalizeDirectAnswer(answer) === normalizeDirectAnswer(typed));
  if (!isCorrect) {
    directFillWrongIndex = directFillActiveIndex;
    renderCurrentQuestion();
    return;
  }
  userAnswers[currentQuestionIndex][directFillActiveIndex] = typed;
  directFillPending = '';
  directFillWrongIndex = -1;
  playCorrectChime();
  answerLocked = true;
  renderCurrentQuestion(); renderQuestionNav(); updateProgress(); saveSession();
  setTimeout(() => {
    answerLocked = false;
    const next = firstUnansweredDirectFill(question, userAnswers[currentQuestionIndex]);
    if (next >= 0) {
      directFillActiveIndex = next;
      renderCurrentQuestion();
    } else if (currentQuestionIndex < currentExam.questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    }
  }, 360);
}

function normalizeDirectAnswer(value) {
  return String(value || '').trim().toLocaleLowerCase('en').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');
}

function firstUnansweredDirectFill(question, answers) {
  if (question?.type !== 'direct-fill') return 0;
  return Array.isArray(answers) ? answers.findIndex(answer => !answer) : 0;
}

function selectOption(letter) {
  if (answerLocked) return;
  if (!availableOptions(currentExam.questions[currentQuestionIndex]).includes(letter)) return;
  userAnswers[currentQuestionIndex] = letter;
  const isCorrect = letter === currentExam.questions[currentQuestionIndex].correct;
  renderCurrentQuestion(); renderQuestionNav(); updateProgress(); saveSession();
  if (!isCorrect) return;
  playCorrectChime();
  if (currentQuestionIndex < currentExam.questions.length - 1) {
    answerLocked = true;
    setTimeout(() => { answerLocked = false; goToQuestion(currentQuestionIndex + 1); }, 360);
  }
}

function playCorrectChime() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    [[659.25, 0], [880, 0.1]].forEach(([frequency, delay]) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.075, now + delay + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + delay); oscillator.stop(now + delay + 0.23);
    });
  } catch { /* Trình duyệt không hỗ trợ âm thanh thì vẫn tiếp tục làm bài. */ }
}
function navigate(step) { goToQuestion(currentQuestionIndex + step); }
function goToQuestion(index) {
  if (index < 0 || index >= currentExam.questions.length) return;
  document.querySelector('.answer-map')?.classList.remove('mobile-open');
  currentQuestionIndex = index;
  trueFalsePending = null;
  trueFalseActiveIndex = firstUnansweredTrueFalse(currentExam.questions[index], userAnswers[index]);
  if (trueFalseActiveIndex < 0) trueFalseActiveIndex = 9;
  clozePending = null;
  clozeActiveIndex = firstUnansweredCloze(currentExam.questions[index], userAnswers[index]);
  if (clozeActiveIndex < 0) clozeActiveIndex = 9;
  directFillPending = '';
  directFillWrongIndex = -1;
  directFillActiveIndex = firstUnansweredDirectFill(currentExam.questions[index], userAnswers[index]);
  renderCurrentQuestion();
  renderQuestionNav();
  saveSession();
}
function toggleFlag() { flaggedQuestions[currentQuestionIndex] = !flaggedQuestions[currentQuestionIndex]; renderCurrentQuestion(); renderQuestionNav(); saveSession(); }

function renderQuestionNav() {
  $('question-nav').innerHTML = currentExam.questions.map((question, index) => `<button class="nav-btn ${isQuestionComplete(question, userAnswers[index]) ? 'answered' : ''} ${flaggedQuestions[index] ? 'flagged' : ''} ${index === currentQuestionIndex ? 'current' : ''}" data-index="${index}">${index + 1}</button>`).join('');
  $('question-nav').querySelectorAll('button').forEach(button => button.addEventListener('click', () => goToQuestion(Number(button.dataset.index))));
}

function updateProgress() {
  const counts = currentExam.questions.reduce((total, question, index) => {
    if (question.type === 'true-false' || question.type === 'cloze-bundle' || question.type === 'direct-fill') {
      total.total += question.type === 'true-false' ? question.statements.length : question.type === 'cloze-bundle' ? question.subQuestions.length : question.fillItems.length;
      total.answered += Array.isArray(userAnswers[index]) ? userAnswers[index].filter(Boolean).length : 0;
    } else {
      total.total += 1;
      total.answered += userAnswers[index] ? 1 : 0;
    }
    return total;
  }, { answered: 0, total: 0 });
  const { answered, total } = counts, percent = total ? Math.round(answered / total * 100) : 0;
  $('answered-count').textContent = `Đã trả lời ${answered}/${total}`; $('progress-percent').textContent = `${percent}%`; $('progress-fill').style.width = `${percent}%`;
}

function isQuestionComplete(question, answer) {
  if (question.type === 'true-false' || question.type === 'cloze-bundle' || question.type === 'direct-fill') {
    const length = question.type === 'true-false' ? question.statements.length : question.type === 'cloze-bundle' ? question.subQuestions.length : question.fillItems.length;
    return Array.isArray(answer) && answer.length === length && answer.every(Boolean);
  }
  return Boolean(answer);
}

function saveSession() { localStorage.setItem(SESSION_KEY, JSON.stringify({ examId: currentExam.id, answers: userAnswers, flagged: flaggedQuestions, index: currentQuestionIndex })); }

function submitExam() {
  const scores = currentExam.questions.map((question, index) => {
    if (question.type === 'true-false' || question.type === 'cloze-bundle' || question.type === 'direct-fill') {
      const answers = Array.isArray(userAnswers[index]) ? userAnswers[index] : [];
      if (question.type === 'direct-fill') {
        const correct = question.fillItems.reduce((sum, item, subIndex) => sum + (item.answers.some(answer => normalizeDirectAnswer(answer) === normalizeDirectAnswer(answers[subIndex])) ? 1 : 0), 0);
        return { total: question.fillItems.length, answered: answers.filter(Boolean).length, correct };
      }
      const correctAnswers = question.type === 'true-false' ? question.trueFalseAnswers : question.clozeAnswers;
      const total = correctAnswers.length;
      return { total, answered: answers.filter(Boolean).length, correct: correctAnswers.reduce((sum, answer, subIndex) => sum + (answers[subIndex] === answer ? 1 : 0), 0) };
    }
    return { total: 1, answered: userAnswers[index] ? 1 : 0, correct: userAnswers[index] === question.correct ? 1 : 0 };
  });
  const unanswered = scores.reduce((sum, score) => sum + score.total - score.answered, 0);
  if (!confirm(unanswered ? `Bạn còn ${unanswered} câu chưa trả lời. Vẫn nộp bài?` : 'Bạn chắc chắn muốn nộp bài?')) return;
  localStorage.removeItem(SESSION_KEY);
  const correct = scores.reduce((sum, score) => sum + score.correct, 0);
  const total = scores.reduce((sum, score) => sum + score.total, 0), percent = Math.round(correct / total * 100), passed = percent >= (currentExam.passScore ?? 50);
  const newResult = { id: makeId(), examId: currentExam.id, correct, total, percent, questions: currentExam.questions.map((q, index) => ({ questionId: q.id, correct: scores[index].correct === scores[index].total, correctCount: scores[index].correct, total: scores[index].total })), completedAt: new Date().toISOString() };
  results.unshift(newResult);
  saveData();
  if (typeof saveResultToSupabase === 'function') {
    saveResultToSupabase(newResult);
  }
  $('result-icon').textContent = passed ? '✓' : '!'; $('result-icon').style.color = passed ? 'var(--success)' : 'var(--warning)';
  $('result-title').textContent = passed ? 'Làm tốt lắm!' : 'Hãy thử lại nhé!';
  $('result-percent').textContent = `${percent}%`; $('result-score').textContent = `${correct}/${total} câu đúng · ${passed ? 'Đạt' : 'Chưa đạt'}`;
  resultDetailHtml = currentExam.questions.map((q, index) => {
    if (q.type === 'true-false' || q.type === 'cloze-bundle' || q.type === 'direct-fill') {
      const answers = Array.isArray(userAnswers[index]) ? userAnswers[index] : [];
      const labels = q.type === 'true-false' ? q.statements : q.type === 'cloze-bundle' ? q.subQuestions.map(item => Object.values(item.options).join(' · ')) : q.fillItems.map(item => item.prompt);
      const correctAnswers = q.type === 'true-false' ? q.trueFalseAnswers : q.type === 'cloze-bundle' ? q.clozeAnswers : q.fillItems.map(item => item.answers.join(' / '));
      const modeName = q.type === 'true-false' ? 'True/False' : q.type === 'cloze-bundle' ? 'Điền từ' : 'Điền trực tiếp';
      return `<article class="result-question ${scores[index].correct === scores[index].total ? 'correct' : 'incorrect'}"><header><span>Câu ${index + 1} · ${modeName}</span><span>${scores[index].correct}/${scores[index].total} đúng</span></header>${labels.map((label, subIndex) => `<div class="result-tf-line"><b>${subIndex + 1}.</b> ${escapeHtml(shorten(label, 80))}<span>${escapeHtml(answers[subIndex] || '—')} / ${correctAnswers[subIndex]}</span></div>`).join('')}</article>`;
    }
    const ok = userAnswers[index] === q.correct;
    return `<article class="result-question ${ok ? 'correct' : 'incorrect'}"><header><span>Câu ${index + 1}</span><span>${ok ? 'Đúng' : 'Sai'}</span></header><div>Bạn chọn: <b>${escapeHtml(userAnswers[index] || 'Chưa trả lời')}</b> · Đáp án: <b>${escapeHtml(q.correct)}</b></div></article>`;
  }).join('');
  $('result-detail').classList.add('hidden'); $('btn-review-result').textContent = 'Xem chi tiết'; $('result-modal').classList.remove('hidden');
  runQuestionAnalysis();
  $('exam-taking').classList.add('hidden'); $('exam-selector').classList.remove('hidden'); $('exam-select').value = ''; $('btn-start-exam').disabled = true; document.body.classList.remove('exam-focus'); updateStats();
}

function runQuestionAnalysis() {
  const runId = ++analysisRunId;
  const attempts = results.filter(result => result.examId === currentExam.id && Array.isArray(result.questions));
  const ranking = currentExam.questions.map((question, index) => {
    const records = attempts.flatMap(result => result.questions.filter(item => item.questionId === question.id));
    const wrong = records.filter(item => !item.correct).length;
    return { index, question, attempts: records.length, wrong, rate: records.length ? Math.round(wrong / records.length * 100) : 0 };
  }).sort((a, b) => b.rate - a.rate || b.wrong - a.wrong).slice(0, 5);

  $('analysis-list').innerHTML = '';
  $('analysis-status').textContent = 'Đang đọc lịch sử các lượt làm...';
  $('analysis-value').textContent = '0%';
  $('analysis-progress').style.width = '0%';
  let progress = 0;
  const timer = setInterval(() => {
    if (runId !== analysisRunId) return clearInterval(timer);
    progress = Math.min(100, progress + 10);
    $('analysis-value').textContent = `${progress}%`;
    $('analysis-progress').style.width = `${progress}%`;
    const revealCount = Math.ceil(progress / 20);
    $('analysis-list').innerHTML = ranking.slice(0, revealCount).map(item => `
      <article class="analysis-item">
        <div class="analysis-rank">${item.index + 1}</div>
        <div class="analysis-copy"><b>${escapeHtml(shorten(item.question.content, 62))}</b><span>${item.wrong}/${item.attempts} lượt trả lời sai</span><div class="wrong-meter"><i style="width:${item.rate}%"></i></div></div>
        <strong class="wrong-rate ${item.rate >= 50 ? 'high' : ''}">${item.rate}% sai</strong>
      </article>`).join('');
    if (progress === 100) {
      clearInterval(timer);
      $('analysis-status').textContent = attempts.length > 1 ? `Hoàn tất · tổng hợp ${attempts.length} lượt làm` : 'Hoàn tất · cần thêm lượt làm để chính xác hơn';
    }
  }, 120);
}

function initManage() {
  $('exam-search').addEventListener('input', renderExamList);
  $('exam-list').addEventListener('click', event => {
    const button = event.target.closest('[data-exam-action]'); if (!button) return;
    const { examAction: action, id } = button.dataset;
    if (action === 'take') takeExam(id); if (action === 'edit') editExam(id); if (action === 'delete') deleteExam(id);
  });
  $('btn-export').addEventListener('click', exportData);
  $('import-file').addEventListener('change', importData);
}

function renderExamList() {
  const term = ($('exam-search')?.value || '').trim().toLocaleLowerCase('vi');
  const filtered = exams.filter(exam => `${exam.title} ${exam.description || ''}`.toLocaleLowerCase('vi').includes(term));
  if (!filtered.length) { $('exam-list').innerHTML = `<div class="empty-state"><span>▦</span><h3>${exams.length ? 'Không tìm thấy đề thi' : 'Kho đề đang trống'}</h3><p>${exams.length ? 'Thử tìm bằng từ khóa khác.' : 'Tạo đề đầu tiên để bắt đầu luyện tập.'}</p></div>`; return; }
  $('exam-list').innerHTML = filtered.map(exam => { const attempts = results.filter(r => r.examId === exam.id); const best = attempts.length ? Math.max(...attempts.map(r => r.percent)) : null; return `<article class="exam-list-item"><div class="exam-list-info"><h4>${escapeHtml(exam.title)}</h4><p>${escapeHtml(exam.description || 'Chưa có mô tả')}</p><div class="exam-list-meta"><span>${exam.questions.length} câu hỏi</span><span>Không giới hạn thời gian</span><span>Điểm đạt ${exam.passScore ?? 50}%</span>${best !== null ? `<span>Kỷ lục ${best}%</span>` : ''}<span>Cập nhật ${formatDate(exam.updatedAt)}</span></div></div><div class="exam-list-actions"><button class="btn primary" data-exam-action="take" data-id="${escapeAttr(exam.id)}">Làm bài</button><button class="btn ghost" data-exam-action="edit" data-id="${escapeAttr(exam.id)}">Sửa</button><button class="btn ghost" data-exam-action="delete" data-id="${escapeAttr(exam.id)}" title="Xóa">×</button></div></article>`; }).join('');
}

function updateStats() { const totalQuestions = exams.reduce((sum, exam) => sum + exam.questions.length, 0), avg = results.length ? Math.round(results.reduce((sum, result) => sum + result.percent, 0) / results.length) : 0; $('stats').innerHTML = `<div class="stat"><span>Tổng đề thi</span><strong>${exams.length}</strong></div><div class="stat"><span>Tổng câu hỏi</span><strong>${totalQuestions}</strong></div><div class="stat"><span>Điểm trung bình</span><strong>${avg}%</strong></div>`; }
function takeExam(id) { switchTab('take'); $('exam-select').value = id; $('btn-start-exam').disabled = false; }
function editExam(id) { const exam = exams.find(item => item.id === id); if (!exam) return; currentExam = structuredClone(exam); $('exam-title').value = exam.title; $('exam-desc').value = exam.description || ''; $('exam-pass').value = exam.passScore ?? 50; $('draft-badge').textContent = 'Đang chỉnh sửa'; renderQuestionsList(); switchTab('create'); }
async function deleteExam(id) {
  const exam = exams.find(item => item.id === id);
  if (!exam || !confirm(`Xóa đề “${exam.title}”? Thao tác này không thể hoàn tác.`)) return;
  exams = exams.filter(item => item.id !== id);
  results = results.filter(item => item.examId !== id);
  saveData();
  renderExamList(); updateStats();
  toast('Đã xóa đề thi.');
}

function exportData() { const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), exams, results }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `quizflow-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); toast('Đã xuất dữ liệu.'); }
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const data = normalizeImportedPackage(raw);
      if (!data || !data.exams.length || !data.exams.every(validExam)) throw new Error('Không tìm thấy đề thi hợp lệ trong tệp.');
      if (!confirm(`Nhập ${data.exams.length} đề thi và thay thế dữ liệu hiện tại?`)) return;
      exams = data.exams;
      results = data.results;
      normalizeQuestionIds(); normalizeResultIds(); saveData(); updateExamSelect(); renderExamList(); updateStats();
      toast(`Đã khôi phục ${exams.length} đề từ file backup.`);
    } catch (error) {
      console.warn('Không thể nhập backup:', error);
      toast(`Tệp dữ liệu không hợp lệ: ${error.message || 'sai định dạng JSON'}`);
    } finally { event.target.value = ''; }
  };
  reader.readAsText(file);
}

function normalizeImportedPackage(raw) {
  if (Array.isArray(raw)) return { exams: raw, results: [] };
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.exams)) return { exams: raw.exams, results: Array.isArray(raw.results) ? raw.results : [] };
  if (raw.exam && typeof raw.exam === 'object') return { exams: [raw.exam], results: Array.isArray(raw.results) ? raw.results : [] };
  if (raw.database?.exam) return { exams: [raw.database.exam], results: Array.isArray(raw.database.results) ? raw.database.results : [] };
  return null;
}
function validExam(exam) { return exam && typeof exam.id === 'string' && typeof exam.title === 'string' && Array.isArray(exam.questions) && exam.questions.every(q => {
  if (!q || typeof q.content !== 'string') return false;
  if (q.type === 'true-false') return Array.isArray(q.statements) && q.statements.length === 10 && q.statements.every(item => typeof item === 'string') && Array.isArray(q.trueFalseAnswers) && q.trueFalseAnswers.length === 10 && q.trueFalseAnswers.every(answer => answer === 'T' || answer === 'F');
  if (q.type === 'cloze-bundle') return Array.isArray(q.subQuestions) && q.subQuestions.length === 10 && q.subQuestions.every(item => item?.options && letters.every(letter => typeof item.options[letter] === 'string')) && Array.isArray(q.clozeAnswers) && q.clozeAnswers.length === 10 && q.clozeAnswers.every(answer => letters.includes(answer));
  if (q.type === 'direct-fill') return Array.isArray(q.fillItems) && q.fillItems.length > 0 && q.fillItems.every(item => typeof item?.prompt === 'string' && Array.isArray(item.answers) && item.answers.length > 0 && item.answers.every(answer => typeof answer === 'string'));
  return q.options && letters.every(letter => typeof q.options[letter] === 'string') && letters.includes(q.correct);
}); }

function initKeyboard() { document.addEventListener('keydown', event => {
  if ($('exam-taking').classList.contains('hidden') || !$('result-modal').classList.contains('hidden') || !$('question-modal').classList.contains('hidden')) return;
  const question = currentExam.questions[currentQuestionIndex];
  if (question?.type === 'true-false') {
    if (event.key === '1' || event.key === '2') { selectTrueFalse(event.key === '1' ? 'T' : 'F'); event.preventDefault(); }
    if (event.key === 'Enter') { checkTrueFalseAnswer(); event.preventDefault(); }
  } else if (question?.type === 'cloze-bundle') {
    if (['1','2','3','4'].includes(event.key)) { selectClozeAnswer(letters[Number(event.key) - 1]); event.preventDefault(); }
    if (event.key === 'Enter') { checkClozeAnswer(); event.preventDefault(); }
  } else if (question?.type === 'direct-fill') {
    if (event.key === 'Enter') { directFillPending = document.querySelector(`input[data-direct-index="${directFillActiveIndex}"]`)?.value || directFillPending; checkDirectFillAnswer(); event.preventDefault(); }
    return;
  } else if (['1','2','3','4'].includes(event.key)) {
    selectOption(letters[Number(event.key) - 1]); event.preventDefault();
  }
  if (event.key === 'ArrowLeft') { navigate(-1); event.preventDefault(); }
  if (event.key === 'ArrowRight') { navigate(1); event.preventDefault(); }
  if (event.key.toLowerCase() === 'f' && question?.type !== 'true-false') { toggleFlag(); event.preventDefault(); }
}); document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!$('cloze-key-modal').classList.contains('hidden')) closeClozeAnswerModal();
  else if (!$('question-modal').classList.contains('hidden')) closeQuestionModal();
}); }

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
    localStorage.setItem(RESULT_KEY, JSON.stringify(results));
  } catch (error) {
    // Ảnh nhúng có thể làm vượt giới hạn localStorage; IndexedDB vẫn lưu được.
    console.warn('localStorage đầy, chuyển sang IndexedDB:', error);
    $('save-status').textContent = '● Ảnh lớn — đang lưu bằng IndexedDB';
  }
  syncLocalDatabase(); updateExamSelect();
  if (!$('save-status').textContent.includes('Ảnh lớn')) $('save-status').textContent = '● Đã lưu dữ liệu';
  setTimeout(() => $('save-status').textContent = '● IndexedDB đang hoạt động', 1800);
}
function normalizeQuestionIds() {
  let changed = false;
  exams.forEach(exam => exam.questions?.forEach(question => {
    if (!question.id) { question.id = makeId(); changed = true; }
  }));
  if (changed) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(exams)); } catch (e) {}
  }
}
function normalizeResultIds() {
  let changed = false;
  results.forEach(result => {
    if (!result.id) { result.id = makeId(); changed = true; }
  });
  if (changed) {
    try { localStorage.setItem(RESULT_KEY, JSON.stringify(results)); } catch (e) {}
  }
}

function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB không được hỗ trợ'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('exams')) database.createObjectStore('exams', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('results')) database.createObjectStore('results', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromLocalDatabase() {
  try {
    const database = await openLocalDatabase();
    const transaction = database.transaction(['exams', 'results'], 'readonly');
    const [savedExams, savedResults] = await Promise.all([
      requestToPromise(transaction.objectStore('exams').getAll()),
      requestToPromise(transaction.objectStore('results').getAll())
    ]);
    database.close();

    const defaultExams = (window.DEFAULT_DATA && Array.isArray(window.DEFAULT_DATA.exams)) ? window.DEFAULT_DATA.exams : [];
    const CURRENT_DATA_VERSION = '20261120_v3';
    const storedVersion = localStorage.getItem('quizflow_data_version');

    if (storedVersion !== CURRENT_DATA_VERSION && defaultExams.length) {
      exams = structuredClone(defaultExams);
      await syncLocalDatabase();
      localStorage.setItem('quizflow_data_version', CURRENT_DATA_VERSION);
    } else if (savedExams.length) {
      exams = savedExams.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      let needSync = false;
      for (const defExam of defaultExams) {
        const existing = exams.find(e => e.id === defExam.id);
        if (!existing) {
          exams.push(structuredClone(defExam));
          needSync = true;
        } else if (
          (existing.questions?.length || 0) !== (defExam.questions?.length || 0) ||
          String(existing.updatedAt || '') < String(defExam.updatedAt || '') ||
          existing.questions?.some((q, qi) => q.fillItems?.[0]?.prompt !== defExam.questions?.[qi]?.fillItems?.[0]?.prompt)
        ) {
          Object.assign(existing, structuredClone(defExam));
          needSync = true;
        }
      }
      if (needSync) await syncLocalDatabase();
    } else if (defaultExams.length) {
      exams = structuredClone(defaultExams);
      await syncLocalDatabase();
      localStorage.setItem('quizflow_data_version', CURRENT_DATA_VERSION);
    }

    if (savedResults.length) results = savedResults.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    $('save-status').textContent = '● Đã kết nối database local';

    // Đồng bộ đề thi mới nhất từ Supabase Cloud nếu có kết nối
    if (typeof loadExamsFromSupabase === 'function') {
      loadExamsFromSupabase().then(async remoteExams => {
        if (remoteExams && remoteExams.length) {
          exams = remoteExams;
          await syncLocalDatabase();
          if (typeof renderExamSelector === 'function') renderExamSelector();
          if (typeof renderExamManageList === 'function') renderExamManageList();
          $('save-status').textContent = '● Đã kết nối Supabase Cloud (Live)';
        }
      }).catch(e => console.warn('Lỗi kiểm tra Supabase:', e));
    }
  } catch (error) {
    console.warn('Không thể mở IndexedDB, đang dùng bộ nhớ dự phòng:', error);
    if (!exams.length && window.DEFAULT_DATA?.exams) {
      exams = structuredClone(window.DEFAULT_DATA.exams);
    }
    $('save-status').textContent = '● Đang dùng bộ nhớ dự phòng';
  }
}

async function syncLocalDatabase() {
  try {
    const database = await openLocalDatabase();
    const transaction = database.transaction(['exams', 'results'], 'readwrite');
    const examStore = transaction.objectStore('exams');
    const resultStore = transaction.objectStore('results');
    examStore.clear(); resultStore.clear();
    exams.forEach(exam => examStore.put(structuredClone(exam)));
    results.forEach(result => resultStore.put(structuredClone(result)));
    await transactionToPromise(transaction);
    database.close();
  } catch (error) {
    console.warn('Không thể đồng bộ IndexedDB:', error);
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
function makeId() { return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replace(/`/g, '&#96;'); }
function availableOptions(question) { return letters.filter(letter => Boolean(question.options?.[letter]?.trim() || question.optionImages?.[letter])); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value || min)); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN'); }
function shorten(value, length) { const text = String(value || 'Câu hỏi có hình ảnh'); return text.length > length ? `${text.slice(0, length)}…` : text; }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 2400); }
