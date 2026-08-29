const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// 기본 아바타 색상 팔레트 (친구들이 고를 수 있게)
const AVATAR_COLORS = ['#1c0fb8', '#9b6bff', '#ff5c72', '#ffe234', '#2ec4b6', '#ff8a5c', '#4a3d6b'];

// ---------- 프로필 사진 업로드 설정 ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.session.userId}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드할 수 있어요.'));
    }
    cb(null, true);
  }
});

// ---------- 유저 데이터 읽기/쓰기 ----------
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}
function publicProfile(u) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    name: u.name,
    avatarColor: u.avatarColor,
    avatarImage: u.avatarImage || null
  };
}

// ---------- 미들웨어 ----------
app.use(express.json());
app.use(session({
  secret: 'dokbang-friends-only-local-secret', // 로컬 전용이라 이 정도로 충분해요
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 } // 30일
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요해요.' });
  next();
}

// ---------- 회원가입 ----------
app.post('/api/signup', (req, res) => {
  const { username, password, nickname, name } = req.body;

  if (!username || !password || !nickname || !name) {
    return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상으로 해주세요.' });
  }

  const users = readUsers();
  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: '이미 사용 중인 아이디예요.' });
  }
  if (users.some(u => u.nickname === nickname)) {
    return res.status(409).json({ error: '이미 사용 중인 닉네임이에요.' });
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    nickname,
    name,
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length]
  };

  users.push(newUser);
  writeUsers(users);

  req.session.userId = newUser.id;
  res.json({ user: publicProfile(newUser) });
});

// ---------- 로그인 ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸어요.' });
  }

  req.session.userId = user.id;
  res.json({ user: publicProfile(user) });
});

// ---------- 로그아웃 ----------
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------- 내 정보 ----------
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요해요.' });
  const users = readUsers();
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: '로그인이 필요해요.' });
  res.json({ user: publicProfile(user) });
});

// ---------- 전체 멤버 리스트 ----------
app.get('/api/members', (req, res) => {
  const users = readUsers();
  res.json({ members: users.map(publicProfile), colors: AVATAR_COLORS });
});

// ---------- 내 프로필 수정 ----------
app.put('/api/profile', requireAuth, (req, res) => {
  const { nickname, name, avatarColor } = req.body;
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(401).json({ error: '로그인이 필요해요.' });

  if (nickname && nickname !== users[idx].nickname && users.some(u => u.nickname === nickname)) {
    return res.status(409).json({ error: '이미 사용 중인 닉네임이에요.' });
  }

  if (nickname) users[idx].nickname = nickname;
  if (name) users[idx].name = name;
  if (avatarColor) users[idx].avatarColor = avatarColor;

  writeUsers(users);
  res.json({ user: publicProfile(users[idx]) });
});

// ---------- 프로필 사진 업로드 ----------
app.post('/api/profile/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없어요.' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(401).json({ error: '로그인이 필요해요.' });

  // 기존 사진이 있으면 지워서 uploads 폴더가 계속 쌓이지 않게 함
  const oldImage = users[idx].avatarImage;
  if (oldImage) {
    const oldPath = path.join(UPLOADS_DIR, path.basename(oldImage));
    fs.unlink(oldPath, () => {});
  }

  users[idx].avatarImage = `/uploads/${req.file.filename}`;
  writeUsers(users);
  res.json({ user: publicProfile(users[idx]) });
});

// ---------- 프로필 사진 삭제 (색상으로 되돌리기) ----------
app.delete('/api/profile/avatar', requireAuth, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(401).json({ error: '로그인이 필요해요.' });

  const oldImage = users[idx].avatarImage;
  if (oldImage) {
    const oldPath = path.join(UPLOADS_DIR, path.basename(oldImage));
    fs.unlink(oldPath, () => {});
  }
  users[idx].avatarImage = null;

  writeUsers(users);
  res.json({ user: publicProfile(users[idx]) });
});

// ---------- 업로드 에러 처리 (용량 초과, 파일 형식 등) ----------
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || '업로드 중 문제가 생겼어요.' });
  next();
});

app.listen(PORT, () => {
  console.log(`서버 실행 중! 브라우저에서 열어보세요: http://localhost:${PORT}`);
});
