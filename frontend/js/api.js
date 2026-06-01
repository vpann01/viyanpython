// Tiny API client + auth token storage
const API = (() => {
  const TKEY = 'pyquest_token';
  let token = localStorage.getItem(TKEY) || null;

  async function req(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api' + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    get token() { return token; },
    setToken(t) { token = t; t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY); },
    health: () => req('/health', { auth: false }),
    curriculum: () => req('/curriculum', { auth: false }),
    login: (username, password) => req('/auth/login', { method: 'POST', auth: false, body: { username, password } }),
    register: (username, password, display) => req('/auth/register', { method: 'POST', auth: false, body: { username, password, display } }),
    me: () => req('/me'),
    complete: (lesson_id, stars, seconds) => req('/progress/complete', { method: 'POST', body: { lesson_id, stars, seconds } }),
    hint: (lesson_id, code, error, attempts) => req('/tutor/hint', { method: 'POST', body: { lesson_id, code, error, attempts } }),
    parent: (child) => req('/parent/' + encodeURIComponent(child)),
  };
})();
