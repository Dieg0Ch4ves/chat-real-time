const state = {
  apiUrl: '',
  token: '',
  user: null,
  socket: null,
  roomId: '',
  online: [],
};

const el = (id) => document.getElementById(id);

const ui = {
  apiUrl: el('api-url'),
  socketStatus: el('socket-status'),
  email: el('email'),
  name: el('name'),
  password: el('password'),
  btnRegister: el('btn-register'),
  btnLogin: el('btn-login'),
  btnRandom: el('btn-random'),
  btnHealth: el('btn-health'),
  factUser: el('fact-user'),
  factUserId: el('fact-userid'),
  factToken: el('fact-token'),
  btnConnect: el('btn-connect'),
  btnDisconnect: el('btn-disconnect'),
  room: el('room'),
  btnJoin: el('btn-join'),
  onlineCount: el('online-count'),
  onlineList: el('online-list'),
  messages: el('messages'),
  formMessage: el('form-message'),
  message: el('message'),
  btnSend: el('btn-send'),
  log: el('log'),
  btnClearLog: el('btn-clear-log'),
};

function timestamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function log(kind, event, payload) {
  const line = document.createElement('div');
  line.className = `log-line ${kind}`;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = timestamp();

  const name = document.createElement('span');
  name.className = 'log-event';
  name.textContent = event;

  line.append(time, name);

  if (payload !== undefined) {
    const body = document.createElement('span');
    body.className = 'log-payload';
    body.textContent =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    line.append(body);
  }

  ui.log.prepend(line);
}

function setConnected(connected) {
  ui.socketStatus.textContent = connected ? 'conectado' : 'desconectado';
  ui.socketStatus.className = `badge ${connected ? 'badge-on' : 'badge-off'}`;

  ui.btnConnect.disabled = connected || !state.token;
  ui.btnDisconnect.disabled = !connected;
  ui.btnJoin.disabled = !connected;

  const inRoom = connected && Boolean(state.roomId);
  ui.message.disabled = !inRoom;
  ui.btnSend.disabled = !inRoom;

  if (!connected) {
    renderOnline([]);
  }
}

function setSession(session) {
  state.token = session.access_token;
  state.user = session.user;

  ui.factUser.textContent = `${session.user.name} <${session.user.email}>`;
  ui.factUserId.textContent = session.user.id;
  ui.factToken.textContent = `${session.access_token.slice(0, 32)}…`;
  ui.btnConnect.disabled = false;
}

function renderOnline(users) {
  state.online = users;
  ui.onlineCount.textContent = String(users.length);
  ui.onlineList.replaceChildren();

  if (users.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nenhum';
    ui.onlineList.append(empty);
    return;
  }

  for (const id of users) {
    const item = document.createElement('li');
    item.textContent = id;
    if (state.user && id === state.user.id) {
      item.className = 'me';
      item.textContent = `${id} (você)`;
    }
    ui.onlineList.append(item);
  }
}

function clearMessages(placeholder) {
  ui.messages.replaceChildren();
  if (placeholder) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = placeholder;
    ui.messages.append(empty);
  }
}

function appendMessage(message) {
  const placeholder = ui.messages.querySelector('.empty');
  if (placeholder) {
    placeholder.remove();
  }

  const item = document.createElement('div');
  const mine = state.user && message.senderId === state.user.id;
  item.className = `message${mine ? ' mine' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'message-meta';

  const author = document.createElement('span');
  author.className = 'message-author';
  author.textContent = message.sender ? message.sender.name : 'desconhecido';

  const time = document.createElement('span');
  time.className = 'message-time';
  time.textContent = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour12: false })
    : timestamp();

  meta.append(author, time);

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = message.content;

  item.append(meta, body);
  ui.messages.append(item);
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

async function callApi(path, options) {
  const response = await fetch(`/api${path}`, options);
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail =
      payload && payload.message ? payload.message : response.statusText;
    throw new Error(
      Array.isArray(detail) ? detail.join(', ') : String(detail),
    );
  }

  return payload;
}

async function authenticate(path, body) {
  try {
    const session = await callApi(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSession(session);
    log('in', `POST ${path}`, { id: session.user.id, email: session.user.email });
  } catch (error) {
    log('error', `POST ${path}`, error.message);
  }
}

ui.btnRegister.addEventListener('click', () => {
  void authenticate('/auth/register', {
    email: ui.email.value.trim(),
    name: ui.name.value.trim(),
    password: ui.password.value,
  });
});

ui.btnLogin.addEventListener('click', () => {
  void authenticate('/auth/login', {
    email: ui.email.value.trim(),
    password: ui.password.value,
  });
});

ui.btnRandom.addEventListener('click', () => {
  const seed = Date.now().toString().slice(-6);
  ui.email.value = `teste${seed}@exemplo.com`;
  ui.name.value = `Teste ${seed}`;
  ui.password.value = 'senha123';
  log('info', 'usuário gerado', ui.email.value);
});

ui.btnHealth.addEventListener('click', () => {
  callApi('/health')
    .then((payload) => log('in', 'GET /health', payload))
    .catch((error) => log('error', 'GET /health', error.message));
});

ui.btnConnect.addEventListener('click', () => {
  if (state.socket) {
    state.socket.disconnect();
  }

  log('out', 'conectando', state.apiUrl);

  const socket = io(state.apiUrl, {
    auth: { token: state.token },
    transports: ['websocket'],
    reconnection: false,
  });

  state.socket = socket;

  socket.on('connect', () => {
    setConnected(true);
    log('in', 'connect', socket.id);
  });

  socket.on('disconnect', (reason) => {
    setConnected(false);
    state.roomId = '';
    log('error', 'disconnect', reason);
  });

  socket.on('connect_error', (error) => {
    setConnected(false);
    log('error', 'connect_error', error.message);
  });

  socket.on('room:joined', (payload) => {
    state.roomId = payload.roomId;
    renderOnline(payload.online || []);
    clearMessages(payload.messages.length ? '' : 'Nenhuma mensagem ainda.');
    for (const message of payload.messages) {
      appendMessage(message);
    }
    setConnected(true);
    log('in', 'room:joined', {
      roomId: payload.roomId,
      online: payload.online.length,
      messages: payload.messages.length,
    });
  });

  socket.on('message:new', (message) => {
    appendMessage(message);
    log('in', 'message:new', { id: message.id, content: message.content });
  });

  socket.on('message:delivered', (payload) => {
    log('in', 'message:delivered', payload);
  });

  socket.on('message:ack', (payload) => {
    log('in', 'message:ack', payload);
  });

  socket.on('presence:update', (payload) => {
    log('in', 'presence:update', payload);
    if (payload.online && !state.online.includes(payload.userId)) {
      renderOnline([...state.online, payload.userId]);
    }
    if (!payload.online) {
      renderOnline(state.online.filter((id) => id !== payload.userId));
    }
  });

  socket.on('exception', (payload) => {
    log('error', 'exception', payload);
  });
});

ui.btnDisconnect.addEventListener('click', () => {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  setConnected(false);
});

ui.btnJoin.addEventListener('click', () => {
  const roomId = ui.room.value.trim();
  if (!roomId || !state.socket) {
    return;
  }
  log('out', 'room:join', { roomId });
  state.socket.emit('room:join', { roomId });
});

ui.formMessage.addEventListener('submit', (event) => {
  event.preventDefault();
  const content = ui.message.value.trim();
  if (!content || !state.socket) {
    return;
  }
  log('out', 'message:send', { roomId: state.roomId, content });
  state.socket.emit('message:send', { roomId: state.roomId, content });
  ui.message.value = '';
});

ui.btnClearLog.addEventListener('click', () => {
  ui.log.replaceChildren();
});

fetch('/config')
  .then((response) => response.json())
  .then((config) => {
    state.apiUrl = config.apiUrl;
    ui.apiUrl.textContent = config.apiUrl;
    log('info', 'pronto', `API em ${config.apiUrl}`);
  })
  .catch(() => {
    state.apiUrl = 'http://localhost:3000';
    ui.apiUrl.textContent = state.apiUrl;
    log('error', 'config', 'não foi possível ler /config');
  });

setConnected(false);
