let dictionaryTerms = [];
let members = [];
let avatarColors = [];
let currentUser = null;
let pickedColor = null;

const $ = (id) => document.getElementById(id);

// GitHub Pages처럼 server.js 없이 정적 파일만 올라간 환경인지 판별해요.
// 정적 모드에서는 로그인 서버가 없으니 로그인 화면을 건너뛰고 바로 들어가고,
// 멤버 목록은 API 대신 public/members.json 파일에서 읽어옵니다.
const STATIC_MODE = location.hostname.endsWith('github.io');

// ---------- 시작 (로딩 화면 최소 노출 시간 보장) ----------
boot();

async function boot() {
  const minDelay = new Promise(resolve => setTimeout(resolve, 900));
  await Promise.all([init(), minDelay]);
  hideLoadingScreen();
}

function hideLoadingScreen() {
  const screen = $('loadingScreen');
  if (!screen) return;
  screen.classList.add('fade-out');
  setTimeout(() => screen.remove(), 550);
}

async function init() {
  if (STATIC_MODE) {
    await enterApp();
    return;
  }
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      await enterApp();
    } else {
      showAuthScreen();
    }
  } catch {
    showAuthScreen();
  }
}

// ================= 인증 화면 =================
function showAuthScreen() {
  $('authScreen').classList.remove('hidden');
  $('mainApp').classList.add('hidden');
}

document.querySelectorAll('.auth-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.auth;
    $('loginForm').classList.toggle('hidden', target !== 'login');
    $('signupForm').classList.toggle('hidden', target !== 'signup');
  });
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('loginUsername').value.trim(),
        password: $('loginPassword').value
      })
    });
    const data = await res.json();
    if (!res.ok) { $('loginError').textContent = data.error; return; }
    currentUser = data.user;
    await enterApp();
  } catch {
    $('loginError').textContent = '서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해주세요.';
  }
});

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('signupError').textContent = '';
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('signupUsername').value.trim(),
        password: $('signupPassword').value,
        nickname: $('signupNickname').value.trim(),
        name: $('signupName').value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) { $('signupError').textContent = data.error; return; }
    currentUser = data.user;
    await enterApp();
  } catch {
    $('signupError').textContent = '서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해주세요.';
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  $('mainApp').classList.add('hidden');
  $('loginUsername').value = '';
  $('loginPassword').value = '';
  showAuthScreen();
});

// ================= 메인 앱 =================
async function enterApp() {
  $('authScreen').classList.add('hidden');
  $('mainApp').classList.remove('hidden');

  if (STATIC_MODE) {
    // 로그인한 사람이 없으니 "OO님 환영해요" 줄과 프로필 수정 안내는 숨겨요.
    $('userbar').classList.add('hidden');
    $('memberHint').classList.add('hidden');
  } else {
    $('myNickname').textContent = currentUser.nickname;
  }

  // 상대경로로 두면 로컬(/)에서도, Pages 서브경로(/Game-Club/)에서도 그대로 동작해요.
  const [dictRes, membersRes] = await Promise.all([
    fetch('dictionary.json').then(r => r.json()),
    fetch(STATIC_MODE ? 'members.json' : 'api/members').then(r => r.json())
  ]);
  dictionaryTerms = dictRes;
  members = membersRes.members;
  avatarColors = membersRes.colors;

  renderDict(dictionaryTerms);
  renderMembers(members);
}

// ---------- 탭 전환 ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
});

// ---------- 사전 ----------
function renderDict(list) {
  const el = $('dictList');
  if (!list.length) { el.innerHTML = '<div class="term-item">검색 결과가 없어요.</div>'; return; }
  el.innerHTML = list.map(item => `
    <div class="term-item">
      <span class="term">${escapeHtml(item.term)}</span>
      <span class="meaning">→ ${escapeHtml(item.meaning)}</span>
      ${item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : ''}
    </div>
  `).join('');
}

$('dictSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderDict(dictionaryTerms.filter(item =>
    item.term.toLowerCase().includes(q) || item.meaning.toLowerCase().includes(q)
  ));
});

// ---------- 번역기 ----------
$('translateBtn').addEventListener('click', () => {
  const input = $('translateInput').value;
  const output = $('translateOutput');
  if (!input.trim()) { output.textContent = '번역할 문장을 입력해주세요.'; return; }

  const sortedTerms = [...dictionaryTerms].sort((a, b) => b.term.length - a.term.length);
  let result = escapeHtml(input);
  sortedTerms.forEach(({ term, meaning }) => {
    const regex = new RegExp(escapeRegex(escapeHtml(term)), 'g');
    result = result.replace(regex, `<mark>${meaning}</mark>`);
  });
  output.innerHTML = result;
});

// ---------- 멤버 프로필 ----------
function renderMembers(list) {
  const el = $('memberList');
  if (!list.length) { el.innerHTML = '<div class="hint">아직 가입한 멤버가 없어요.</div>'; return; }

  el.innerHTML = list.map(m => {
    const isMe = currentUser && m.id === currentUser.id;
    const avatarStyle = m.avatarImage
      ? `background-image:url('${m.avatarImage}')`
      : `background:${m.avatarColor}`;
    return `
      <div class="profile-card ${isMe ? 'is-me' : ''}">
        ${isMe ? `<button class="edit-fab" data-id="${m.id}" title="프로필 수정">✎</button>` : ''}
        <div class="avatar-square" style="${avatarStyle}"></div>
        <div class="p-nick">${escapeHtml(m.nickname)}</div>
        <div class="p-name">${escapeHtml(m.name)}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.edit-fab').forEach(btn => {
    btn.addEventListener('click', openEditModal);
  });
}

// ---------- 프로필 수정 모달 ----------
function openEditModal() {
  $('editError').textContent = '';
  $('avatarError').textContent = '';
  $('editNickname').value = currentUser.nickname;
  $('editName').value = currentUser.name;
  pickedColor = currentUser.avatarColor;

  renderAvatarPreview();

  $('colorPicker').innerHTML = avatarColors.map(c => `
    <div class="color-swatch ${c === pickedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>
  `).join('');

  $('colorPicker').querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      pickedColor = sw.dataset.color;
      $('colorPicker').querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      if (!currentUser.avatarImage) renderAvatarPreview();
    });
  });

  $('editModal').classList.remove('hidden');
}

function renderAvatarPreview() {
  const preview = $('avatarPreview');
  const removeBtn = $('removeAvatarBtn');
  if (currentUser.avatarImage) {
    preview.style.backgroundImage = `url('${currentUser.avatarImage}')`;
    preview.style.background = `url('${currentUser.avatarImage}') center/cover`;
    removeBtn.classList.remove('hidden');
  } else {
    preview.style.background = pickedColor || currentUser.avatarColor;
    removeBtn.classList.add('hidden');
  }
}

// ---------- 프로필 사진 선택 즉시 업로드 ----------
$('avatarFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('avatarError').textContent = '';

  if (!file.type.startsWith('image/')) {
    $('avatarError').textContent = '이미지 파일만 업로드할 수 있어요.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $('avatarError').textContent = '5MB 이하 파일만 업로드할 수 있어요.';
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) { $('avatarError').textContent = data.error; return; }

    currentUser = data.user;
    renderAvatarPreview();

    const membersRes = await fetch('/api/members').then(r => r.json());
    members = membersRes.members;
    renderMembers(members);
  } catch {
    $('avatarError').textContent = '업로드에 실패했어요. 다시 시도해주세요.';
  } finally {
    e.target.value = '';
  }
});

// ---------- 프로필 사진 삭제 ----------
$('removeAvatarBtn').addEventListener('click', async () => {
  $('avatarError').textContent = '';
  try {
    const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { $('avatarError').textContent = data.error; return; }

    currentUser = data.user;
    renderAvatarPreview();

    const membersRes = await fetch('/api/members').then(r => r.json());
    members = membersRes.members;
    renderMembers(members);
  } catch {
    $('avatarError').textContent = '삭제에 실패했어요. 다시 시도해주세요.';
  }
});

$('editCancelBtn').addEventListener('click', () => $('editModal').classList.add('hidden'));

$('editSaveBtn').addEventListener('click', async () => {
  $('editError').textContent = '';
  const nickname = $('editNickname').value.trim();
  const name = $('editName').value.trim();
  if (!nickname || !name) { $('editError').textContent = '닉네임과 이름을 모두 입력해주세요.'; return; }

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, name, avatarColor: pickedColor })
    });
    const data = await res.json();
    if (!res.ok) { $('editError').textContent = data.error; return; }

    currentUser = data.user;
    $('myNickname').textContent = currentUser.nickname;
    $('editModal').classList.add('hidden');

    const membersRes = await fetch('/api/members').then(r => r.json());
    members = membersRes.members;
    renderMembers(members);
  } catch {
    $('editError').textContent = '저장에 실패했어요. 다시 시도해주세요.';
  }
});

// ---------- 유틸 ----------
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ================= 배경음악 (직접 넣은 mp3 파일 재생) =================
// public/bgm.mp3 파일을 넣으면 그 파일이 재생돼요. (public/README 참고)
const bgmAudio = $('bgmAudio');
let musicOn = localStorage.getItem('bgmOn') === 'true';

function updateMusicButton() {
  const btn = $('musicToggle');
  btn.textContent = musicOn ? '🔊' : '🔇';
  btn.classList.toggle('is-on', musicOn);
}

function playMusic() {
  bgmAudio.play().catch(() => {
    // 자동재생이 막혔거나 bgm.mp3 파일이 없는 경우 등. 사용자가 버튼을 다시 누르면 재시도돼요.
  });
}

$('musicToggle').addEventListener('click', () => {
  musicOn = !musicOn;
  localStorage.setItem('bgmOn', musicOn ? 'true' : 'false');
  if (musicOn) playMusic(); else bgmAudio.pause();
  updateMusicButton();
});

bgmAudio.addEventListener('error', () => {
  if (musicOn) {
    console.warn('배경음악 파일(public/bgm.mp3)을 찾을 수 없어요. 파일을 추가해주세요.');
  }
});

updateMusicButton();

// 브라우저는 사용자 클릭 없이 소리 자동재생을 막기 때문에,
// 이전에 음악을 켜뒀던 사람은 페이지에서 처음 아무 곳이나 클릭/터치하면 자동으로 다시 재생돼요.
function tryResumeMusicOnFirstInteraction() {
  if (musicOn) playMusic();
  document.removeEventListener('click', tryResumeMusicOnFirstInteraction);
  document.removeEventListener('keydown', tryResumeMusicOnFirstInteraction);
  document.removeEventListener('touchstart', tryResumeMusicOnFirstInteraction);
}
document.addEventListener('click', tryResumeMusicOnFirstInteraction, { once: true });
document.addEventListener('keydown', tryResumeMusicOnFirstInteraction, { once: true });
document.addEventListener('touchstart', tryResumeMusicOnFirstInteraction, { once: true });
