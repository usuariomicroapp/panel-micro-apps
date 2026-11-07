'use strict';
/* Mis Cuentas · microapp de finanzas personales / negocio. Sin dependencias, datos en el dispositivo. */

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const nf = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = n => nf.format(Math.round((n + Number.EPSILON) * 100) / 100);
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const monthOf = s => s.slice(0, 7);
const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); };
const shiftMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
const sum = a => a.reduce((s, x) => s + x, 0);
async function sha(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mc|' + t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function parseAmount(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  debt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 8v9H8"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7L7 17M7 8v9h9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

const CATS = { Casa: '🏠', Comida: '🍽️', Servicios: '💡', Personal: '🧍', Transporte: '🚗', Salud: '💊', Negocio: '🧾', Otros: '🧩' };
const INKINDS = { Venta: '🛍️', 'Cobro de deuda': '🤝', Otro: '✨' };
const ACCTYPES = { Efectivo: '💵', Banco: '🏦', Billetera: '📱', Tarjeta: '💳', Otro: '👛' };

/* ---------- datos y nube ---------- */
const CFG = window.MC_CLOUD || {};
const sb = CFG.url && CFG.key && window.supabase ? window.supabase.createClient(CFG.url, CFG.key) : null;
const blankData = () => ({ accounts: [], debts: [], credits: [], prospects: [], expenses: [], incomes: [], lastBackup: 0 });
const DATA_KEYS = Object.keys(blankData());
let S = blankData();
const ui = {
  stage: 'boot', side: 'd', inSide: 'r', tab: 'home', month: monthOf(todayStr()), view: null, showPaid: false,
  user: null, me: null, recovery: false, mode: 'in', users: [], q: '', dirty: false, sync: 'ok',
  cfg: { brand_name: 'Mis Cuentas', brand_color: '#e8c26a', trial_days: 7, price_text: '', payment_url: '', whatsapp: '' },
};
const SYNC_TXT = { ok: '☁️ Guardado en la nube', pending: 'Guardando…', offline: 'Sin conexión: se guardará solo', error: 'No se pudo guardar' };
const CK = () => 'mc.nube.' + ui.user.id;
function cacheWrite() { try { localStorage.setItem(CK(), JSON.stringify({ data: S, at: Date.now(), dirty: ui.dirty })); } catch {} }
function cacheRead() { try { return JSON.parse(localStorage.getItem(CK())); } catch { return null; } }
function setSync(s) {
  ui.sync = s; const el = $('#syncchip');
  if (el) { el.textContent = SYNC_TXT[s]; el.className = 'chip ' + (s === 'ok' ? 'on' : s === 'error' ? 'off' : ''); }
}
let pushT;
function save() { ui.dirty = true; cacheWrite(); setSync('pending'); clearTimeout(pushT); pushT = setTimeout(push, 700); }
async function push() {
  if (!sb || !ui.user) return;
  const at = new Date().toISOString();
  const { error } = await sb.from('user_data').upsert({ user_id: ui.user.id, data: S, updated_at: at });
  if (error) { setSync(navigator.onLine ? 'error' : 'offline'); if (navigator.onLine) refreshAccess(); return; }
  ui.dirty = false; cacheWrite(); setSync('ok');
}
const defaultAccounts = () => [['Efectivo', 'Efectivo'], ['Mercado Pago', 'Billetera'], ['Banco Provincia', 'Banco'], ['Tarjeta Naranja', 'Tarjeta']]
  .map(([name, type]) => ({ id: uid(), name, type, initial: 0 }));
async function loadData() {
  const c = cacheRead();
  const { data, error } = await sb.from('user_data').select('data,updated_at').eq('user_id', ui.user.id).maybeSingle();
  if (error) {
    if (c) { S = { ...blankData(), ...c.data }; ui.dirty = !!c.dirty; setSync('offline'); return true; }
    return false;
  }
  if (data) {
    const at = Date.parse(data.updated_at);
    if (c && c.dirty && c.at > at) { S = { ...blankData(), ...c.data }; save(); }
    else { S = { ...blankData(), ...data.data }; ui.dirty = false; cacheWrite(); setSync('ok'); }
  } else {
    S = c ? { ...blankData(), ...c.data } : blankData();
    if (!S.accounts.length && !S.debts.length && !S.credits.length) S.accounts = defaultAccounts();
    save();
  }
  return true;
}
const hasAccess = m => !!m && (m.role === 'admin' || (m.status !== 'paused' && Date.parse(m.access_until) > Date.now()));
async function fetchSettings() {
  try { const { data } = await sb.from('settings').select('*').eq('id', 1).maybeSingle(); if (data) ui.cfg = { ...ui.cfg, ...data }; } catch {}
}
async function fetchMe() {
  const mk = 'mc.me.' + ui.user.id;
  const { data, error } = await sb.from('profiles').select('*').eq('id', ui.user.id).maybeSingle();
  if (data) { try { localStorage.setItem(mk, JSON.stringify(data)); } catch {} return data; }
  if (error) { try { return JSON.parse(localStorage.getItem(mk)); } catch {} }
  return null;
}
async function refreshAccess() {
  const me = await fetchMe(); if (me) ui.me = me;
  if (!hasAccess(ui.me) && ui.stage === 'app') { ui.stage = 'gate'; render(); }
  return hasAccess(ui.me);
}
async function startSession(user) {
  ui.user = user; ui.stage = 'boot'; render();
  await fetchSettings();
  ui.me = await fetchMe();
  if (ui.recovery) { ui.stage = 'recovery'; return render(); }
  if (!ui.me) { ui.stage = 'error'; return render(); }
  if (!hasAccess(ui.me)) { ui.stage = 'gate'; return render(); }
  ui.stage = (await loadData()) ? 'app' : 'error';
  render();
}
function initAuth() {
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { ui.recovery = true; ui.stage = 'recovery'; render(); return; }
    if (ev === 'SIGNED_OUT') { ui.user = ui.me = null; S = blankData(); ui.stage = 'auth'; ui.view = null; ui.tab = 'home'; ui.mode = 'in'; render(); return; }
    if (session?.user && (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN')) {
      if (ui.user?.id === session.user.id && ui.stage !== 'boot') return;
      setTimeout(() => startSession(session.user), 0);
    } else if (ev === 'INITIAL_SESSION') {
      ui.stage = 'auth'; render(); fetchSettings().then(render);
    }
  });
}
const daysLeft = m => Math.ceil((Date.parse(m.access_until) - Date.now()) / 864e5);
const errTxt = m => ({
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya tiene una cuenta. Probá entrar.',
  'Email not confirmed': 'Confirmá tu email: te mandamos un link.',
  'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres',
}[m] || (/rate limit|too many/i.test(m || '') ? 'Demasiados intentos, esperá unos minutos' : 'No se pudo completar. Revisá tu conexión.'));

/* ---------- cálculos ---------- */
const paid = d => sum(d.payments.map(p => p.amount));
const pending = d => Math.max(0, d.total - paid(d));
function accBalance(a) {
  return a.initial
    + sum(S.incomes.filter(x => x.accountId === a.id).map(x => x.amount))
    - sum(S.expenses.filter(x => x.accountId === a.id).map(x => x.amount))
    - sum(S.debts.flatMap(d => d.payments).filter(p => p.accountId === a.id).map(p => p.amount))
    + sum(S.credits.flatMap(d => d.payments).filter(p => p.accountId === a.id).map(p => p.amount));
}
const totals = () => {
  const cash = sum(S.accounts.map(accBalance));
  const debt = sum(S.debts.map(pending));
  const owed = sum(S.credits.map(pending));
  const maybe = sum(S.prospects.filter(p => p.status === 'open').map(p => p.estimate));
  return { cash, debt, owed, maybe, net: cash - debt };
};
const accName = id => S.accounts.find(a => a.id === id)?.name || 'Sin cuenta';

/* ---------- arranque / render ---------- */
function applyBrand() {
  const c = /^#[0-9a-fA-F]{6}$/.test(ui.cfg.brand_color) ? ui.cfg.brand_color : '#e8c26a';
  document.documentElement.style.setProperty('--gold', c);
  document.documentElement.style.setProperty('--gold2', `color-mix(in srgb, ${c} 68%, #000)`);
  document.title = ui.cfg.brand_name || 'Mis Cuentas';
}
function render() {
  applyBrand();
  const app = $('#app');
  if (!sb) { app.innerHTML = noConfigView(); return; }
  app.innerHTML = { boot: bootView, auth: authView, recovery: recoveryView, gate: gateView, error: errorView, app: shell }[ui.stage]();
  if (ui.stage === 'app') setSync(ui.sync);
}
const logo = () => `<div class="logo">${esc((ui.cfg.brand_name || 'M')[0].toUpperCase())}</div>`;
const waLink = txt => { const n = (ui.cfg.whatsapp || '').replace(/\D/g, ''); return n ? `https://wa.me/${n}?text=${encodeURIComponent(txt)}` : ''; };
function payButtons() {
  const url = /^https:\/\//.test(ui.cfg.payment_url) ? ui.cfg.payment_url : '';
  const wa = waLink(`Hola, quiero activar mi cuenta de ${ui.cfg.brand_name}. Mi email: ${ui.me?.email || ''}`);
  return `${url ? `<a class="btn" style="display:block;text-align:center;text-decoration:none" href="${esc(url)}" target="_blank" rel="noopener">Pagar${ui.cfg.price_text ? ' · ' + esc(ui.cfg.price_text) : ''}</a>` : ''}
    ${wa ? `<a class="btn ghost" style="display:block;text-align:center;text-decoration:none" href="${esc(wa)}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
    ${!url && !wa ? '<p class="hint">Pedile al administrador que active tu cuenta.</p>' : ''}`;
}
const bootView = () => `<div class="auth"><div class="box" style="text-align:center">${logo().replace('class="logo"', 'class="logo" style="margin-inline:auto"')}<p>Cargando…</p></div></div>`;
const noConfigView = () => `<div class="auth"><div class="box"><div class="logo">!</div><h1>Falta conectar la base</h1>
  <p>Completá <b>URL</b> y <b>clave pública</b> de Supabase en el archivo <code>config.js</code> y volvé a publicar.</p></div></div>`;
function errorView() {
  return `<div class="auth"><div class="box">${logo()}<h1>No pudimos cargar tus datos</h1><p>Revisá tu conexión e intentá de nuevo. Tus datos están a salvo.</p>
  <div class="btns"><button class="btn" data-act="retry">Reintentar</button><button class="btn ghost" data-act="logout">Cerrar sesión</button></div></div></div>`;
}
function authView() {
  const up = ui.mode === 'up', reset = ui.mode === 'reset';
  const trial = ui.cfg.trial_days > 0;
  return `<div class="auth"><div class="box">${logo()}
    <h1>${esc(ui.cfg.brand_name)}</h1>
    <p>Controlá tus deudas, gastos e ingresos en un solo lugar.${trial ? ` <b style="color:var(--gold)">Probala ${ui.cfg.trial_days} días gratis.</b>` : ''}</p>
    ${reset ? '' : `<div class="seg"><button class="${up ? '' : 'on'}" data-act="mode" data-v="in">Entrar</button><button class="${up ? 'on' : ''}" data-act="mode" data-v="up">Crear cuenta</button></div>`}
    <form data-form="auth-${reset ? 'reset' : up ? 'up' : 'in'}">
      ${up ? '<label class="f"><span>Tu nombre</span><input class="inp" name="name" required autocomplete="name"></label>' : ''}
      <label class="f"><span>Email</span><input class="inp" type="email" name="email" required autocomplete="email" autocapitalize="none"></label>
      ${reset ? '' : `<label class="f"><span>Contraseña${up ? ' (mínimo 6)' : ''}</span><input class="inp" type="password" name="pass" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}"></label>`}
      <div class="btns"><button class="btn">${reset ? 'Enviar link para recuperar' : up ? 'Crear mi cuenta' : 'Entrar'}</button></div>
    </form>
    ${reset ? '<button class="link" data-act="mode" data-v="in" style="margin-top:12px">← Volver</button>' : !up ? '<button class="link" data-act="mode" data-v="reset" style="margin-top:12px">Olvidé mi contraseña</button>' : ''}
    <ul class="perks"><li>Tus datos quedan guardados en la nube</li><li>Usala desde el celular o la compu con tu cuenta</li><li>Deudas, lo que te deben, gastos e ingresos</li></ul>
  </div></div>`;
}
function recoveryView() {
  return `<div class="auth"><form class="box" data-form="recovery">${logo()}<h1>Nueva contraseña</h1><p>Elegí una contraseña nueva para tu cuenta.</p>
    <label class="f"><span>Contraseña nueva (mínimo 6)</span><input class="inp" type="password" name="pass" required minlength="6" autocomplete="new-password"></label>
    <div class="btns"><button class="btn">Guardar y entrar</button></div></form></div>`;
}
function gateView() {
  const m = ui.me || {};
  const t = m.status === 'paused' ? ['Tu cuenta está pausada', 'Escribinos para reactivarla.']
    : m.status === 'trial' ? ['Terminó tu prueba gratis', 'Activá tu cuenta para seguir usando la app. Tus datos te esperan.']
    : ['Venció tu suscripción', 'Renovala para seguir usando la app. Tus datos te esperan.'];
  return `<div class="auth"><div class="box">${logo()}<h1>${t[0]}</h1><p>${t[1]}</p>
    <div class="btns">${payButtons()}
      <button class="btn ghost" data-act="recheck">Ya pagué, actualizar</button>
      ${cacheRead() ? '<button class="btn ghost" data-act="export-cache">Descargar mis datos</button>' : ''}
      <button class="link" data-act="logout">Cerrar sesión</button></div></div></div>`;
}
function accessBanner() {
  const m = ui.me; if (!m || m.role === 'admin') return '';
  const d = daysLeft(m); if (d > 5) return '';
  return `<div class="note" style="margin:0 0 14px">⏳ ${m.status === 'trial' ? 'Tu prueba gratis' : 'Tu suscripción'} termina ${d <= 1 ? 'hoy o mañana' : 'en ' + d + ' días'}. <button class="link" data-act="renew">Renovar</button></div>`;
}
function shell() {
  if (ui.view === 'settings') return settingsView();
  if (ui.view === 'admin') return adminView();
  const t = ui.tab;
  const body = { home: homeView, debts: debtsView, expenses: expensesView, incomes: incomesView }[t]();
  const tab = (k, ic, l) => `<button class="tab ${t === k ? 'on' : ''}" data-act="tab" data-v="${k}">${I[ic]}${l}</button>`;
  const who = (ui.me?.name || '').split(' ')[0] || 'bienvenido';
  return `<div class="shell">
    <div class="top"><div class="brand">${logo()}<div><small>Hola, ${esc(who)}</small><h1>${esc(ui.cfg.brand_name)}</h1></div></div>
      <button class="iconbtn" data-act="settings" aria-label="Ajustes">${I.gear}</button></div>
    <div style="margin:-8px 0 14px"><span id="syncchip" class="chip on"></span></div>
    ${accessBanner()}${body}</div>
    <nav class="tabs">${tab('home', 'home', 'Inicio')}${tab('debts', 'debt', 'Deudas')}
      <button class="fab" data-act="add" aria-label="Agregar">${I.plus}</button>
      ${tab('expenses', 'out', 'Gastos')}${tab('incomes', 'in', 'Ingresos')}</nav>`;
}

/* ---------- vistas ---------- */
function homeView() {
  const { cash, debt, owed, maybe, net } = totals();
  const cov = debt === 0 ? 100 : Math.min(100, Math.max(0, (cash / debt) * 100));
  const m = ui.month === monthOf(todayStr()) ? ui.month : monthOf(todayStr());
  const inM = sum(S.incomes.filter(x => monthOf(x.date) === m).map(x => x.amount))
    + sum(S.credits.flatMap(c => c.payments).filter(x => monthOf(x.date) === m).map(x => x.amount));
  const outM = sum(S.expenses.filter(x => monthOf(x.date) === m).map(x => x.amount));
  let pill, msg;
  if (!S.debts.length && !S.accounts.length) { pill = '<span class="pill warn">Empecemos</span>'; msg = 'Cargá tus deudas y tu plata para ver el balance.'; }
  else if (debt === 0) { pill = '<span class="pill good">Sin deudas 🎉</span>'; msg = 'No tenés deudas pendientes.'; }
  else if (net >= 0) { pill = '<span class="pill good">▲ Estás en positivo</span>'; msg = `Podés cubrir todas tus deudas y te sobran ${money(net)}.`; }
  else { pill = '<span class="pill bad">▼ Estás en negativo</span>'; msg = `Te faltan ${money(-net)} para cubrir todas tus deudas.`; }

  const accs = S.accounts.length ? S.accounts.map(a => `
    <div class="row" data-act="edit-acc" data-id="${a.id}"><div class="ico">${ACCTYPES[a.type] || '👛'}</div>
      <div class="t"><b>${esc(a.name)}</b><small>${esc(a.type)}</small></div>
      <div class="amt num ${accBalance(a) < 0 ? 'out' : ''}">${money(accBalance(a))}</div></div>`).join('')
    : `<div class="empty"><b>Sin cuentas</b>Agregá dónde tenés tu plata.</div>`;

  const dl = S.debts.filter(d => pending(d) > 0).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).slice(0, 4).map(debtRow).join('');
  const cl = S.credits.filter(d => pending(d) > 0).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).slice(0, 4).map(debtRow).join('');
  const pl = S.prospects.filter(p => p.status === 'open').slice(0, 4).map(prospectRow).join('');
  const recent = [
    ...S.incomes.map(x => ({ ...x, k: 'in' })), ...S.expenses.map(x => ({ ...x, k: 'out' })),
    ...S.debts.flatMap(d => d.payments.map(p => ({ ...p, k: 'pay', concept: 'Pago: ' + d.name }))),
    ...S.credits.flatMap(d => d.payments.map(p => ({ ...p, k: 'col', creditId: d.id, concept: 'Cobro: ' + d.name }))),
  ].sort((a, b) => (b.date + (b.ts || 0)) < (a.date + (a.ts || 0)) ? -1 : 1).slice(0, 6).map(moveRow).join('');

  const stale = (S.debts.length || S.incomes.length || S.expenses.length) && (!S.lastBackup || Date.now() - S.lastBackup > 7 * 864e5);
  const warn = stale ? `<div class="note" style="margin:0 0 14px">💾 Hace más de una semana que no guardás una copia de seguridad. <button class="link" data-act="export">Guardar ahora</button></div>` : '';
  return `
  ${warn}<section class="hero"><div class="lbl">Balance general</div>
    <div class="big num" style="color:${net < 0 ? 'var(--bad)' : 'var(--fg)'}">${money(net)}</div>
    ${pill}
    <div class="meter"><i style="width:${cov}%"></i></div>
    <div class="sub"><span>${msg}</span>${owed || maybe ? `<span>Si cobrás y vendés todo: <b class="num">${money(net + owed + maybe)}</b></span>` : ''}</div></section>
  <div class="stats">
    <div class="stat cash"><span>Plata que tengo</span><b class="num">${money(cash)}</b></div>
    <div class="stat debt"><span>Total que debo</span><b class="num">${money(debt)}</b></div>
    <div class="stat"><span>Ingresos del mes</span><b class="num" style="color:var(--good)">${money(inM)}</b></div>
    <div class="stat"><span>Gastos del mes</span><b class="num" style="color:var(--bad)">${money(outM)}</b></div>
    <div class="stat"><span>Me deben</span><b class="num" style="color:var(--blue)">${money(owed)}</b></div>
    <div class="stat"><span>Posibles ingresos</span><b class="num" style="color:var(--gold)">${money(maybe)}</b></div></div>
  <section class="sec"><div class="sechead"><h2>Dónde está tu plata</h2><button class="link" data-act="new-acc">+ Cuenta</button></div>
    <div class="card">${accs}</div></section>
  <section class="sec"><div class="sechead"><h2>Qué me falta pagar</h2><button class="link" data-act="tab" data-v="debts">Ver todo</button></div>
    <div class="card">${dl || `<div class="empty"><b>Todo al día</b>No hay deudas pendientes.</div>`}</div></section>
  ${S.credits.length ? `<section class="sec"><div class="sechead"><h2>Me deben</h2><button class="link" data-act="side-c">Ver todo</button></div>
    <div class="card">${cl || `<div class="empty"><b>Nada pendiente</b>Te pagaron todo.</div>`}</div></section>` : ''}
  ${pl ? `<section class="sec"><div class="sechead"><h2>Por vender</h2><button class="link" data-act="goprospects">Ver todo</button></div>
    <div class="card">${pl}</div></section>` : ''}
  <section class="sec"><div class="sechead"><h2>Últimos movimientos</h2></div>
    <div class="card">${recent || `<div class="empty"><b>Sin movimientos</b>Usá el botón + para cargar el primero.</div>`}</div></section>`;
}

function plan(d) {
  if (!d.cuotas) return null;
  const done = Math.min(d.cuotas, Math.floor(paid(d) / d.cuota + 1e-9));
  let due = '';
  if (d.first && pending(d) > 0) {
    const [y, m, dd] = d.first.split('-').map(Number), t = new Date(y, m - 1 + done, dd);
    due = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  return { done, next: Math.min(d.cuotas, done + 1), due, amount: Math.min(d.cuota, pending(d)) };
}
const planLine = d => { const q = plan(d); return q ? `<p class="hint">Plan: ${d.cuotas} cuotas de ${money(d.cuota)} · pagadas ${q.done}${q.due ? ` · próxima ${fmtDate(q.due)}` : ''}</p>` : ''; };
function debtRow(d) {
  const cr = S.credits.includes(d);
  const p = pending(d), pc = d.total ? Math.min(100, (paid(d) / d.total) * 100) : 0;
  const pn = plan(d), dueD = pn?.due || d.due, late = dueD && p > 0 && dueD < todayStr();
  return `<div class="row" data-act="debt" data-id="${d.id}"><div class="ico">${p === 0 ? '✅' : cr ? '🤝' : '💳'}</div>
    <div class="t"><b>${esc(d.name)}</b>
      <small>${esc(d.kind || (cr ? 'Me deben' : 'Deuda'))}${pn && p > 0 ? ` · cuota ${pn.next}/${d.cuotas}` : ''}${dueD ? ` · ${cr ? 'cobrar' : 'vence'} ${fmtDate(dueD)}${late ? ' ⚠️' : ''}` : ''}</small>
      <div class="mini"><i style="width:${pc}%"></i></div></div>
    <div class="amt num ${p === 0 ? 'in' : cr ? '' : 'out'}" ${cr && p ? 'style="color:var(--blue)"' : ''}>${p ? money(p) : cr ? 'Cobrada' : 'Pagada'}${p && paid(d) ? `<div class="hint" style="font-weight:400;font-size:12px">de ${money(d.total)}</div>` : ''}</div></div>`;
}
function moveRow(x) {
  const icon = x.k === 'in' ? INKINDS[x.kind] || '✨' : x.k === 'out' ? CATS[x.category] || '🧩' : x.k === 'col' ? '🤝' : '💸';
  const act = x.creditId ? 'debt' : x.k === 'in' ? 'edit-in' : x.k === 'out' ? 'edit-out' : '';
  return `<div class="row" ${act ? `data-act="${act}" data-id="${x.creditId || x.id}"` : ''}><div class="ico">${icon}</div>
    <div class="t"><b>${esc(x.concept)}</b><small>${fmtDate(x.date)} · ${esc(accName(x.accountId))}</small></div>
    <div class="amt num ${x.k === 'in' || x.k === 'col' ? 'in' : 'out'}">${x.k === 'in' || x.k === 'col' ? '+' : '−'}${money(x.amount)}</div></div>`;
}

function debtsView() {
  const cr = ui.side === 'c', arr = cr ? S.credits : S.debts;
  const open = arr.filter(d => pending(d) > 0).sort((a, b) => pending(b) - pending(a));
  const done = arr.filter(d => pending(d) === 0);
  const tot = sum(arr.map(pending)), totAll = sum(arr.map(d => d.total));
  const byKind = {};
  open.forEach(d => { const k = d.kind || 'Otras'; byKind[k] = (byKind[k] || 0) + pending(d); });
  const bars = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
    <div class="cat"><div class="h"><span>${esc(k)}</span><span class="num">${money(v)}</span></div>
    <div class="mini"><i style="width:${(v / tot) * 100}%"></i></div></div>`).join('');
  return `
  <div class="seg"><button class="${cr ? '' : 'on'}" data-act="side" data-v="d">Debo</button><button class="${cr ? 'on' : ''}" data-act="side" data-v="c">Me deben</button></div>
  <section class="hero"><div class="lbl">${cr ? 'Total que te deben' : 'Total que debés'}</div><div class="big num" style="color:${cr ? 'var(--blue)' : 'var(--bad)'}">${money(tot)}</div>
    <div class="sub"><span>${cr ? 'Ya cobraste' : 'Ya pagaste'} ${money(totAll - tot)} de ${money(totAll)}</span></div>
    <div class="meter"><i style="width:${totAll ? ((totAll - tot) / totAll) * 100 : 0}%"></i></div></section>
  ${bars ? `<section class="sec"><div class="sechead"><h2>Por tipo</h2></div><div class="card" style="padding-block:12px">${bars}</div></section>` : ''}
  <section class="sec"><div class="sechead"><h2>${cr ? 'Lo que me deben' : 'Mis deudas'}</h2><button class="link" data-act="${cr ? 'new-credit' : 'new-debt'}">+ Nueva</button></div>
    <div class="card">${open.map(debtRow).join('') || `<div class="empty"><b>${cr ? 'Nadie te debe nada' : 'No hay deudas pendientes'}</b>Cargá una con el botón +.</div>`}</div></section>
  ${done.length ? `<section class="sec"><div class="sechead"><h2>${cr ? 'Cobradas' : 'Pagadas'} (${done.length})</h2><button class="link" data-act="toggle-paid">${ui.showPaid ? 'Ocultar' : 'Mostrar'}</button></div>
    ${ui.showPaid ? `<div class="card">${done.map(debtRow).join('')}</div>` : ''}</section>` : ''}`;
}

function monthList(kind) {
  const isOut = kind === 'out';
  const list = (isOut ? S.expenses : [...S.incomes, ...S.credits.flatMap(c => c.payments.map(p => ({ ...p, concept: 'Cobro: ' + c.name, kind: 'Cobro de deuda', creditId: c.id })))]).filter(x => monthOf(x.date) === ui.month).sort((a, b) => (b.date + b.ts) < (a.date + a.ts) ? -1 : 1);
  const total = sum(list.map(x => x.amount));
  const groups = {};
  list.forEach(x => { const k = isOut ? x.category : x.kind; groups[k] = (groups[k] || 0) + x.amount; });
  const bars = Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
    <div class="cat"><div class="h"><span>${(isOut ? CATS : INKINDS)[k] || ''} ${esc(k)}</span><span class="num">${money(v)} · ${Math.round(v / total * 100)}%</span></div>
    <div class="mini"><i style="width:${v / total * 100}%"></i></div></div>`).join('');
  return `
  <div class="monthbar"><button data-act="month" data-d="-1">‹</button><b>${monthLabel(ui.month)}</b><button data-act="month" data-d="1">›</button></div>
  <section class="hero"><div class="lbl">${isOut ? 'Gastos del mes' : 'Ingresos del mes'}</div>
    <div class="big num" style="color:${isOut ? 'var(--bad)' : 'var(--good)'}">${money(total)}</div></section>
  ${bars ? `<section class="sec"><div class="sechead"><h2>${isOut ? 'En qué gastás' : 'De dónde entra'}</h2></div><div class="card" style="padding-block:12px">${bars}</div></section>` : ''}
  <section class="sec"><div class="sechead"><h2>Movimientos</h2><button class="link" data-act="${isOut ? 'new-out' : 'new-in'}">+ ${isOut ? 'Nuevo gasto' : 'Nuevo ingreso'}</button></div>
    <div class="card">${list.map(x => moveRow({ ...x, k: x.creditId ? 'col' : kind })).join('') || `<div class="empty"><b>Nada cargado este mes</b>Tocá + para agregar.</div>`}</div></section>`;
}
const expensesView = () => monthList('out');
const incomesView = () => {
  const seg = `<div class="seg"><button class="${ui.inSide === 'p' ? '' : 'on'}" data-act="inside" data-v="r">Ingresos</button><button class="${ui.inSide === 'p' ? 'on' : ''}" data-act="inside" data-v="p">Por vender</button></div>`;
  return seg + (ui.inSide === 'p' ? prospectsView() : monthList('in'));
};
function prospectRow(p) {
  return `<div class="row" data-act="prospect" data-id="${p.id}"><div class="ico">🏷️</div>
    <div class="t"><b>${esc(p.name)}</b><small>Estimado${p.date ? ' · ' + fmtDate(p.date) : ''}${p.note ? ' · ' + esc(p.note) : ''}</small></div>
    <div class="amt num" style="color:var(--gold)">${money(p.estimate)}</div></div>`;
}
function prospectsView() {
  const open = S.prospects.filter(p => p.status === 'open'), tot = sum(open.map(p => p.estimate));
  const sold = S.prospects.filter(p => p.status === 'sold').length;
  return `<section class="hero"><div class="lbl">Posibles ingresos</div><div class="big num" style="color:var(--gold)">${money(tot)}</div>
    <div class="sub"><span>Todavía no suman a tu balance. Cuando vendés, pasan a ser ingreso.</span></div></section>
  <section class="sec"><div class="sechead"><h2>Por vender${open.length ? ` (${open.length})` : ''}</h2><button class="link" data-act="new-prospect">+ Algo para vender</button></div>
    <div class="card">${open.map(prospectRow).join('') || `<div class="empty"><b>Nada por vender</b>Cargá un vehículo, un electrodoméstico…</div>`}</div>
    ${sold ? `<p class="hint" style="text-align:center;margin-top:12px">Ya vendiste ${sold} (figuran en Ingresos).</p>` : ''}</section>`;
}

/* ---------- hojas (formularios) ---------- */
function sheet(html) {
  closeSheet();
  const el = document.createElement('div'); el.className = 'scrim';
  el.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  el.addEventListener('mousedown', e => { if (e.target === el) closeSheet(); });
  $('#sheet-root').appendChild(el);
  const f = $('input:not([type=hidden]):not([type=date])', el); if (f && !f.value) setTimeout(() => f.focus(), 60);
}
const closeSheet = () => { $('#sheet-root').innerHTML = ''; };
const accOptions = sel => `<option value="">Sin cuenta</option>` + S.accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} (${money(accBalance(a))})</option>`).join('');
const opts = (obj, sel) => Object.keys(obj).map(k => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');
const amountInput = v => `<label class="f"><span>Monto</span><input class="inp num" name="amount" inputmode="decimal" required placeholder="$ 0" value="${v ?? ''}" style="font-size:22px"></label>`;

function chooser() {
  sheet(`<h2>¿Qué querés cargar?</h2><div class="btns">
    <button class="btn ghost" data-act="new-in">⬇️ Entró plata (venta, cobro…)</button>
    <button class="btn ghost" data-act="new-out">⬆️ Un gasto</button>
    <button class="btn ghost" data-act="new-debt">💳 Una deuda nueva (yo debo)</button>
    <button class="btn ghost" data-act="new-credit">🤝 Alguien me debe</button>
    <button class="btn ghost" data-act="pay-pick">💸 Pagué una deuda</button>
    <button class="btn ghost" data-act="col-pick">✅ Me pagaron una deuda</button>
    <button class="btn ghost" data-act="new-prospect">🏷️ Algo que voy a vender</button>
    <button class="btn ghost" data-act="new-acc">🏦 Una cuenta nueva</button></div>`);
}
function debtForm(d, side) {
  const cr = d ? S.credits.includes(d) : side === 'c';
  const base = cr ? ['Clientes', 'Fiado', 'Préstamos', 'Familia y amigos'] : ['Materias primas', 'Tarjetas', 'Préstamos', 'Proveedores', 'Servicios', 'Personas'];
  const kinds = [...new Set([...base, ...(cr ? S.credits : S.debts).map(x => x.kind).filter(Boolean)])];
  sheet(`<h2>${d ? 'Editar' : 'Nueva'} ${cr ? 'deuda a mi favor' : 'deuda'}</h2><form data-form="debt" data-id="${d?.id || ''}"><input type="hidden" name="side" value="${cr ? 'c' : 'd'}">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required placeholder="${cr ? 'Ej: Juan, fiado' : 'Ej: Deuda materias primas'}" value="${esc(d?.name)}"></label>
    <div class="two"><label class="f"><span>Tipo</span><input class="inp" name="kind" list="kinds" placeholder="${cr ? 'Ej: Clientes' : 'Ej: Tarjetas'}" value="${esc(d?.kind)}"><datalist id="kinds">${kinds.map(k => `<option>${esc(k)}</option>`).join('')}</datalist></label>
    <label class="f"><span>${cr ? 'Cobrar el (opcional)' : 'Vence (opcional)'}</span><input class="inp" type="date" name="due" value="${d?.due || ''}"></label></div>
    ${amountInput(d?.total)}
    <label class="f"><span>Nota (opcional)</span><input class="inp" name="note" placeholder="${cr ? 'Quién te debe, detalle…' : 'A quién le debés, detalle…'}" value="${esc(d?.note)}"></label>
    <div class="btns"><button class="btn">Guardar</button>${d ? `<button type="button" class="btn danger" data-act="del-debt" data-id="${d.id}">Eliminar</button>` : ''}</div></form>`);
}
function debtDetail(id) {
  const d = findAny(id); if (!d) return;
  const cr = S.credits.includes(d), p = pending(d);
  sheet(`<h2>${esc(d.name)}</h2>
    <div class="stats" style="margin:0 0 14px"><div class="stat"><span>Total</span><b class="num">${money(d.total)}</b></div>
    <div class="stat ${cr ? 'cash' : 'debt'}"><span>${cr ? 'Falta cobrar' : 'Falta pagar'}</span><b class="num">${money(p)}</b></div></div>
    ${planLine(d)}
    <p class="hint">${esc(d.kind || '')}${d.due && !d.cuotas ? ` · ${cr ? 'cobrar' : 'vence'} ${fmtDate(d.due)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</p>
    <div class="btns h" style="margin-bottom:14px">
      <button class="btn" data-act="pay" data-id="${d.id}" ${p ? '' : 'disabled style="opacity:.4"'}>${cr ? 'Registrar cobro' : 'Registrar pago'}</button>
      <button class="btn ghost" data-act="edit-debt" data-id="${d.id}">Editar</button></div>
    ${d.payments.length ? `<h3 style="margin:8px 0">${cr ? 'Cobros recibidos' : 'Pagos realizados'}</h3><div class="card">${d.payments.slice().reverse().map(x => `
      <div class="row" data-act="del-pay" data-id="${d.id}" data-pid="${x.id}"><div class="ico">${cr ? '🤝' : '💸'}</div>
      <div class="t"><b>${fmtDate(x.date)}</b><small>${cr ? 'Entró en' : 'Desde'} ${esc(accName(x.accountId))}</small></div><div class="amt num ${cr ? 'in' : 'out'}">${money(x.amount)}</div></div>`).join('')}</div>
      <p class="hint">Tocá uno para anularlo (la plata vuelve a su lugar).</p>` : ''}`);
}
function payForm(id) {
  const d = findAny(id); if (!d) return;
  const cr = S.credits.includes(d);
  sheet(`<h2>${cr ? 'Cobro' : 'Pago'} · ${esc(d.name)}</h2><p class="hint">Falta ${cr ? 'cobrar' : 'pagar'} ${money(pending(d))}</p>
    <form data-form="pay" data-id="${id}">${amountInput(plan(d)?.amount ?? pending(d))}
    <div class="two"><label class="f"><span>${cr ? 'Entró en' : 'Pagué desde'}</span><select class="inp" name="accountId">${accOptions(S.accounts[0]?.id)}</select></label>
    <label class="f"><span>Fecha</span><input class="inp" type="date" name="date" value="${todayStr()}"></label></div>
    <div class="btns"><button class="btn">${cr ? 'Registrar cobro' : 'Registrar pago'}</button></div></form>`);
}
function payPick(side) {
  const cr = side === 'c';
  const open = (cr ? S.credits : S.debts).filter(d => pending(d) > 0);
  if (!open.length) { toast(cr ? 'Nadie te debe nada' : 'No tenés deudas pendientes'); return; }
  sheet(`<h2>${cr ? '¿Quién te pagó?' : '¿Qué deuda pagaste?'}</h2><div class="card">${open.map(debtRow).join('')}</div>`);
  $('.sheet').querySelectorAll('[data-act="debt"]').forEach(r => r.dataset.act = 'pay');
}
function moveForm(kind, x) {
  const isOut = kind === 'out';
  sheet(`<h2>${x ? 'Editar' : 'Nuevo'} ${isOut ? 'gasto' : 'ingreso'}</h2><form data-form="${kind}" data-id="${x?.id || ''}">
    ${amountInput(x?.amount)}
    <label class="f"><span>${isOut ? 'Qué fue (luz, super, internet…)' : 'Concepto (venta, me pagó Juan…)'}</span><input class="inp" name="concept" required value="${esc(x?.concept)}"></label>
    <div class="two"><label class="f"><span>${isOut ? 'Categoría' : 'Tipo'}</span><select class="inp" name="cat">${opts(isOut ? CATS : INKINDS, isOut ? x?.category : x?.kind)}</select></label>
    <label class="f"><span>Fecha</span><input class="inp" type="date" name="date" value="${x?.date || todayStr()}"></label></div>
    <label class="f"><span>${isOut ? 'Pagado desde' : 'Entró en'}</span><select class="inp" name="accountId">${accOptions(x ? x.accountId : S.accounts[0]?.id)}</select></label>
    <div class="btns"><button class="btn">Guardar</button>${x ? `<button type="button" class="btn danger" data-act="del-${kind}" data-id="${x.id}">Eliminar</button>` : ''}</div></form>`);
}
function prospectForm(p) {
  sheet(`<h2>${p ? 'Editar' : 'Algo para vender'}</h2><form data-form="prospect" data-id="${p?.id || ''}">
    <label class="f"><span>Qué es</span><input class="inp" name="name" required placeholder="Ej: Auto Fiat, heladera…" value="${esc(p?.name)}"></label>
    <label class="f"><span>Precio estimado</span><input class="inp num" name="amount" inputmode="decimal" required placeholder="$ 0" value="${p?.estimate ?? ''}" style="font-size:22px"></label>
    <div class="two"><label class="f"><span>Fecha aprox. (opcional)</span><input class="inp" type="date" name="date" value="${p?.date || ''}"></label>
    <label class="f"><span>Nota (opcional)</span><input class="inp" name="note" placeholder="Interesado, etc." value="${esc(p?.note)}"></label></div>
    <div class="btns"><button class="btn">Guardar</button>${p ? `<button type="button" class="btn danger" data-act="del-prospect" data-id="${p.id}">Eliminar</button>` : ''}</div></form>`);
}
function prospectDetail(id) {
  const p = find(S.prospects, id); if (!p) return;
  sheet(`<h2>${esc(p.name)}</h2><p class="hint">Precio estimado ${money(p.estimate)}${p.date ? ' · ' + fmtDate(p.date) : ''}${p.note ? ' · ' + esc(p.note) : ''}</p>
    <div class="btns" style="margin-top:12px"><button class="btn" data-act="sell" data-id="${id}">✅ Lo vendí</button>
    <div class="btns h"><button class="btn ghost" data-act="edit-prospect" data-id="${id}">Editar</button><button class="btn ghost" data-act="drop" data-id="${id}">Se cayó la venta</button></div></div>`);
}
function sellForm(id) {
  const p = find(S.prospects, id); if (!p) return;
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  const nextMonth = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  sheet(`<h2>Vendiste: ${esc(p.name)}</h2><form data-form="sell" data-id="${id}">
    <label class="f"><span>Precio final de venta</span><input class="inp num" name="amount" inputmode="decimal" required value="${p.estimate}" style="font-size:22px"></label>
    <label class="f"><span>Lo que cobrás hoy (entrega). Si te pagan todo junto, dejá el total.</span><input class="inp num" name="down" inputmode="decimal" value="${p.estimate}"></label>
    <div class="two"><label class="f"><span>Cuotas para el resto</span><input class="inp" type="number" name="cuotas" min="0" max="120" value="0"></label>
    <label class="f"><span>1.ª cuota vence</span><input class="inp" type="date" name="first" value="${nextMonth}"></label></div>
    <p class="hint" id="sellhint"></p>
    <div class="two"><label class="f"><span>Entró en</span><select class="inp" name="accountId">${accOptions(S.accounts[0]?.id)}</select></label>
    <label class="f"><span>Fecha de venta</span><input class="inp" type="date" name="date" value="${todayStr()}"></label></div>
    <div class="btns"><button class="btn">Confirmar venta</button></div></form>`);
  sellHint();
}
function sellHint() {
  const f = $('form[data-form=sell]'); const h = $('#sellhint'); if (!f || !h) return;
  const total = parseAmount(f.amount.value), down = f.down.value === '' ? total : parseAmount(f.down.value), n = parseInt(f.cuotas.value, 10) || 0;
  const rest = total - down;
  h.textContent = !(total > 0) || isNaN(down) ? '' : rest > 0.004 ? (n > 0 ? `Cobrás ${money(down)} hoy y ${n} cuotas de ${money(Math.ceil(rest / n))}.` : `Falta definir las cuotas para ${money(rest)}.`) : `Cobrás ${money(total)} hoy.`;
}
function accForm(a) {
  sheet(`<h2>${a ? 'Editar cuenta' : 'Nueva cuenta'}</h2><form data-form="acc" data-id="${a?.id || ''}">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required placeholder="Ej: Mercado Pago" value="${esc(a?.name)}"></label>
    <label class="f"><span>Tipo</span><select class="inp" name="type">${opts(ACCTYPES, a?.type)}</select></label>
    <label class="f"><span>${a ? 'Saldo actual (corrige el saldo)' : 'Plata que tiene hoy'}</span>
      <input class="inp num" name="amount" inputmode="decimal" placeholder="$ 0" value="${a ? accBalance(a) : ''}" style="font-size:22px"></label>
    <div class="btns"><button class="btn">Guardar</button>${a ? `<button type="button" class="btn danger" data-act="del-acc" data-id="${a.id}">Eliminar cuenta</button>` : ''}</div></form>`);
}

/* ---------- ajustes y administrador ---------- */
function download(obj, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; a.click();
}
const statusOf = u => u.status === 'paused' ? ['Pausado', 'off'] : Date.parse(u.access_until) < Date.now() ? ['Vencido', 'off'] : u.status === 'trial' ? ['Prueba', ''] : ['Activo', 'on'];
function settingsView() {
  const m = ui.me || {};
  const row = (act, ic, t, s) => `<div class="row" data-act="${act}"><div class="ico">${ic}</div><div class="t"><b>${t}</b><small>${s}</small></div></div>`;
  const us = ui.users.filter(u => u.role !== 'admin'), wk = us.filter(u => Date.now() - Date.parse(u.created_at) < 7 * 864e5).length;
  const acc = m.role === 'admin' ? 'Administrador' : `${statusOf(m)[0]} · hasta ${fmtDate((m.access_until || '').slice(0, 10))}`;
  return `<div class="shell"><div class="top"><button class="iconbtn" data-act="back" aria-label="Volver">${I.back}</button><h1 style="font-size:20px">Ajustes</h1><span style="width:42px"></span></div>
  <section class="card">
    <div class="row" style="cursor:default"><div class="ico">👤</div><div class="t"><b>${esc(m.name || 'Mi cuenta')}</b><small>${esc(m.email || '')} · ${acc}</small></div></div>
    ${m.role !== 'admin' ? row('renew', '💳', 'Renovar o pagar', 'Activá o extendé tu acceso') : ''}
    ${row('pass', '🔑', 'Cambiar contraseña', 'Elegí una nueva')}
    ${row('export', '⬇️', 'Descargar mis datos', 'Archivo con toda tu información')}
    ${row('import', '⬆️', 'Cargar datos desde un archivo', 'Ej.: copia de la versión anterior')}
  </section>
  ${m.role === 'admin' ? `<section class="card" style="margin-top:16px">${row('share-app', '📣', 'Invitar amigos', `${us.length} registrados · ${wk} esta semana`)}
    ${row('admin', '🛡️', 'Panel de administrador', 'Clientes, accesos y configuración')}</section>` : ''}
  <section class="card" style="margin-top:16px">
    ${row('logout', '🚪', 'Cerrar sesión', 'Salir de este dispositivo')}
    ${row('wipe-mine', '🧹', 'Borrar todos mis datos', 'Empezar de cero (no se puede deshacer)')}
  </section>
  <input type="file" id="file" accept="application/json" hidden>
  <p class="hint" style="text-align:center;margin-top:22px">Tus datos se guardan en la nube con tu cuenta.</p></div>`;
}
function userRows() {
  const q = ui.q.trim().toLowerCase();
  const list = ui.users.filter(u => !q || (u.email + ' ' + u.name).toLowerCase().includes(q));
  return list.map(u => { const [t, c] = statusOf(u); return `<div class="row" data-act="user" data-id="${u.id}"><div class="ico">${u.role === 'admin' ? '🛡️' : '🧑‍💼'}</div>
    <div class="t"><b>${esc(u.name || u.email)}</b><small>${esc(u.email)} · hasta ${fmtDate(u.access_until.slice(0, 10))}</small></div><span class="chip ${c}">${t}</span></div>`; }).join('')
    || '<div class="empty"><b>Sin resultados</b>Todavía no hay clientes.</div>';
}
function adminView() {
  const us = ui.users.filter(u => u.role !== 'admin');
  const vig = u => Date.parse(u.access_until) > Date.now() && u.status !== 'paused';
  const c = ui.cfg;
  return `<div class="shell"><div class="top"><button class="iconbtn" data-act="settings" aria-label="Volver">${I.back}</button><h1 style="font-size:20px">Administrador</h1><span style="width:42px"></span></div>
  <div class="stats" style="margin-top:0">
    <div class="stat"><span>Clientes</span><b class="num">${us.length}</b></div>
    <div class="stat cash"><span>Pagos activos</span><b class="num">${us.filter(u => u.status === 'active' && vig(u)).length}</b></div>
    <div class="stat"><span>En prueba</span><b class="num">${us.filter(u => u.status === 'trial' && vig(u)).length}</b></div>
    <div class="stat debt"><span>Vencidos o pausados</span><b class="num">${us.filter(u => !vig(u)).length}</b></div></div>
  <section class="sec"><div class="sechead"><h2>Clientes</h2><button class="link" data-act="reload-users">Actualizar</button></div>
    <input class="inp" id="q" placeholder="Buscar por nombre o email" value="${esc(ui.q)}" style="margin-bottom:10px">
    <div class="card" id="ulist">${userRows()}</div></section>
  <section class="sec"><div class="sechead"><h2>Link para tus clientes</h2></div><div class="card" style="padding-block:14px">
    <p class="hint" style="margin:0 0 10px;word-break:break-all">${esc(location.origin + location.pathname)}</p>
    <button class="btn ghost sm" data-act="copy-link">Copiar link</button></div></section>
  <section class="sec"><div class="sechead"><h2>Configuración</h2></div>
    <form class="card" data-form="cfg" style="padding-block:16px">
      <label class="f"><span>Nombre de la app</span><input class="inp" name="brand_name" required maxlength="40" value="${esc(c.brand_name)}"></label>
      <div class="two"><label class="f"><span>Color</span><input class="inp" type="color" name="brand_color" value="${esc(c.brand_color)}" style="height:50px;padding:4px"></label>
      <label class="f"><span>Días de prueba gratis</span><input class="inp" type="number" name="trial_days" min="0" max="90" value="${c.trial_days}"></label></div>
      <label class="f"><span>Precio (se muestra al renovar)</span><input class="inp" name="price_text" maxlength="80" placeholder="$5.000 por mes" value="${esc(c.price_text)}"></label>
      <label class="f"><span>Link de pago (https://…, ej. Mercado Pago)</span><input class="inp" name="payment_url" maxlength="500" placeholder="https://" value="${esc(c.payment_url)}"></label>
      <label class="f"><span>Tu WhatsApp (con código de país)</span><input class="inp" name="whatsapp" maxlength="25" placeholder="5491122334455" value="${esc(c.whatsapp)}"></label>
      <div class="btns"><button class="btn">Guardar configuración</button></div></form></section>
  <div class="note">Cuando un cliente te paga, tocá su nombre y elegí cuántos días darle. Si no paga, queda sin acceso al vencer.</div></div>`;
}
async function loadUsers() {
  const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000);
  ui.users = data || [];
}
function userSheet(id) {
  const u = ui.users.find(x => x.id === id); if (!u) return;
  const [t] = statusOf(u);
  sheet(`<h2>${esc(u.name || u.email)}</h2><p class="hint">${esc(u.email)}<br>${t} · acceso hasta ${fmtDate(u.access_until.slice(0, 10))}</p>
    <div class="btns" style="margin-top:12px">
      <button class="btn" data-act="extend" data-id="${u.id}" data-d="30">Dar 30 días</button>
      <div class="btns h"><button class="btn ghost" data-act="extend" data-id="${u.id}" data-d="90">+90 días</button><button class="btn ghost" data-act="extend" data-id="${u.id}" data-d="365">+1 año</button></div>
      <form data-form="setdate" data-id="${u.id}" class="two" style="align-items:end"><label class="f" style="margin:0"><span>O fijar fecha</span><input class="inp" type="date" name="date" required></label><button class="btn ghost">Fijar</button></form>
      ${u.status === 'paused' ? `<button class="btn ghost" data-act="resume" data-id="${u.id}">Reactivar cuenta</button>` : `<button class="btn danger" data-act="pause" data-id="${u.id}">Pausar acceso ahora</button>`}</div>`);
}
async function adminSet(id, status, until) {
  const { error } = await sb.rpc('admin_set_access', { p_user: id, p_status: status, p_until: until });
  if (error) return toast('No se pudo actualizar');
  await loadUsers(); closeSheet(); rerender(); toast('Listo');
}

/* ---------- eventos ---------- */
const find = (arr, id) => arr.find(x => x.id === id);
const findAny = id => find(S.debts, id) || find(S.credits, id);
const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };
function done(msg) { save(); closeSheet(); rerender(); if (msg) toast(msg); }
function confirmDo(msg, fn) { if (confirm(msg)) fn(); }

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, v, d, pid } = el.dataset;
  switch (act) {
    case 'tab': ui.tab = v; ui.view = null; closeSheet(); rerender(); scrollTo(0, 0); break;
    case 'add': ({ home: chooser, debts: () => debtForm(null, ui.side), expenses: () => moveForm('out'), incomes: () => ui.inSide === 'p' ? prospectForm() : moveForm('in') })[ui.tab](); break;
    case 'month': ui.month = shiftMonth(ui.month, +d); rerender(); break;
    case 'toggle-paid': ui.showPaid = !ui.showPaid; rerender(); break;
    case 'settings': ui.view = 'settings'; closeSheet(); rerender(); scrollTo(0, 0); if (ui.me?.role === 'admin') loadUsers().then(() => ui.view === 'settings' && rerender()); break;
    case 'back': ui.view = null; rerender(); break;
    case 'new-debt': debtForm(null, 'd'); break;
    case 'new-credit': debtForm(null, 'c'); break;
    case 'side': ui.side = v; rerender(); break;
    case 'side-c': ui.side = 'c'; ui.tab = 'debts'; rerender(); scrollTo(0, 0); break;
    case 'edit-debt': debtForm(findAny(id)); break;
    case 'debt': debtDetail(id); break;
    case 'pay': payForm(id); break;
    case 'pay-pick': payPick('d'); break;
    case 'col-pick': payPick('c'); break;
    case 'del-pay': confirmDo('¿Anular este pago? La plata vuelve a la cuenta.', () => { const dd = findAny(id); dd.payments = dd.payments.filter(p => p.id !== pid); save(); rerender(); debtDetail(id); }); break;
    case 'del-debt': confirmDo('¿Eliminar esta deuda y sus pagos?', () => { S.debts = S.debts.filter(x => x.id !== id); S.credits = S.credits.filter(x => x.id !== id); done('Eliminado'); }); break;
    case 'new-out': moveForm('out'); break;
    case 'new-in': moveForm('in'); break;
    case 'edit-out': moveForm('out', find(S.expenses, id)); break;
    case 'edit-in': moveForm('in', find(S.incomes, id)); break;
    case 'del-out': confirmDo('¿Eliminar este gasto?', () => { S.expenses = S.expenses.filter(x => x.id !== id); done('Gasto eliminado'); }); break;
    case 'del-in': confirmDo('¿Eliminar este ingreso?', () => { S.incomes = S.incomes.filter(x => x.id !== id); done('Ingreso eliminado'); }); break;
    case 'inside': ui.inSide = v; rerender(); break;
    case 'goprospects': ui.tab = 'incomes'; ui.inSide = 'p'; rerender(); scrollTo(0, 0); break;
    case 'new-prospect': prospectForm(); break;
    case 'prospect': prospectDetail(id); break;
    case 'edit-prospect': prospectForm(find(S.prospects, id)); break;
    case 'sell': sellForm(id); break;
    case 'drop': confirmDo('¿Se cayó la venta? Sale de la lista.', () => { find(S.prospects, id).status = 'dropped'; done('Quitado de la lista'); }); break;
    case 'del-prospect': confirmDo('¿Eliminar?', () => { S.prospects = S.prospects.filter(x => x.id !== id); done('Eliminado'); }); break;
    case 'new-acc': accForm(); break;
    case 'edit-acc': accForm(find(S.accounts, id)); break;
    case 'del-acc': confirmDo('¿Eliminar la cuenta? Sus movimientos quedan sin cuenta.', () => {
      S.accounts = S.accounts.filter(x => x.id !== id);
      [...S.incomes, ...S.expenses, ...S.debts.flatMap(x => x.payments), ...S.credits.flatMap(x => x.payments)].forEach(m => { if (m.accountId === id) m.accountId = ''; });
      done('Cuenta eliminada'); }); break;
    case 'mode': ui.mode = v; render(); break;
    case 'retry': startSession(ui.user); break;
    case 'recheck': if (await refreshAccess()) startSession(ui.user); else toast('Todavía no está activa'); break;
    case 'renew': sheet(`<h2>Renovar acceso</h2><p class="hint">${ui.cfg.price_text ? esc(ui.cfg.price_text) + '. ' : ''}Cuando pagues, te activamos la cuenta.</p><div class="btns" style="margin-top:12px">${payButtons()}</div>`); break;
    case 'export': download({ ...S }, `mis-cuentas-${todayStr()}.json`); S.lastBackup = Date.now(); save(); toast('Archivo descargado'); break;
    case 'export-cache': download(cacheRead().data, `mis-cuentas-${todayStr()}.json`); break;
    case 'import': $('#file').click(); break;
    case 'pass': sheet(`<h2>Cambiar contraseña</h2><form data-form="pass"><label class="f"><span>Contraseña nueva (mínimo 6)</span><input class="inp" type="password" name="pass" required minlength="6" autocomplete="new-password"></label><div class="btns"><button class="btn">Guardar</button></div></form>`); break;
    case 'logout': if (ui.dirty) await push(); closeSheet(); await sb.auth.signOut(); break;
    case 'wipe-mine': confirmDo('Se borran TODOS tus datos (cuentas, deudas, gastos e ingresos). ¿Seguro?', () => { S = { ...blankData(), accounts: defaultAccounts() }; done('Datos borrados'); }); break;
    case 'admin': if (ui.me?.role !== 'admin') break; ui.view = 'admin'; rerender(); loadUsers().then(() => ui.view === 'admin' && rerender()); break;
    case 'share-app': {
      if (ui.me?.role !== 'admin') break;
      const url = location.origin + location.pathname;
      const text = `Probá ${ui.cfg.brand_name}: controlá tus deudas, gastos e ingresos en un solo lugar.${ui.cfg.trial_days > 0 ? ` ${ui.cfg.trial_days} días gratis.` : ''}`;
      if (navigator.share) navigator.share({ title: ui.cfg.brand_name, text, url }).catch(() => {});
      else (navigator.clipboard?.writeText(`${text} ${url}`) || Promise.reject()).then(() => toast('Mensaje y link copiados'), () => prompt('Copiá este mensaje:', `${text} ${url}`));
      break; }
    case 'reload-users': loadUsers().then(rerender); break;
    case 'user': userSheet(id); break;
    case 'extend': { const u = ui.users.find(x => x.id === id); const base = Math.max(Date.now(), Date.parse(u.access_until)); adminSet(id, 'active', new Date(base + (+d) * 864e5).toISOString()); break; }
    case 'pause': confirmDo('¿Pausar el acceso de este cliente?', () => adminSet(id, 'paused', null)); break;
    case 'resume': adminSet(id, 'active', null); break;
    case 'copy-link': (navigator.clipboard?.writeText(location.origin + location.pathname) || Promise.reject()).then(() => toast('Link copiado'), () => prompt('Copiá el link:', location.origin + location.pathname)); break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  ui.q = e.target.value; const l = $('#ulist'); if (l) l.innerHTML = userRows();
});

document.addEventListener('change', e => {
  if (e.target.id !== 'file') return;
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    const j = JSON.parse(t);
    if (!j || !Array.isArray(j.debts) || !Array.isArray(j.accounts)) throw 0;
    if (!confirm('Esto reemplaza tus datos actuales con los del archivo. ¿Continuar?')) return;
    S = { ...blankData() }; DATA_KEYS.forEach(k => { if (j[k] !== undefined) S[k] = j[k]; });
    if (!Array.isArray(S.credits)) S.credits = [];
    done('Datos cargados');
  }).catch(() => toast('El archivo no es válido'));
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const k = form.dataset.form, id = form.dataset.id, f = Object.fromEntries(new FormData(form));
  const amt = () => { const n = parseAmount(f.amount); if (!(n > 0)) { toast('Poné un monto válido'); return null; } return n; };
  const btn = form.querySelector('button:not([type=button])');
  const busy = on => { if (btn) btn.disabled = on; };
  const email = (f.email || '').trim().toLowerCase();
  switch (k) {
    case 'auth-in': {
      busy(true); const { error } = await sb.auth.signInWithPassword({ email, password: f.pass }); busy(false);
      if (error) toast(errTxt(error.message)); break; }
    case 'auth-up': {
      busy(true); const { data, error } = await sb.auth.signUp({ email, password: f.pass, options: { data: { name: f.name.trim() } } }); busy(false);
      if (error) return toast(errTxt(error.message));
      if (!data.session) { ui.mode = 'in'; render(); toast('Te mandamos un email para confirmar tu cuenta'); }
      break; }
    case 'auth-reset': {
      busy(true); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); busy(false);
      if (error) return toast(errTxt(error.message));
      ui.mode = 'in'; render(); toast('Si el email existe, te enviamos un link'); break; }
    case 'recovery': {
      busy(true); const { error } = await sb.auth.updateUser({ password: f.pass }); busy(false);
      if (error) return toast(errTxt(error.message));
      const { data: { user } } = await sb.auth.getUser(); ui.recovery = false; startSession(user); break; }
    case 'pass': {
      busy(true); const { error } = await sb.auth.updateUser({ password: f.pass }); busy(false);
      if (error) return toast(errTxt(error.message));
      closeSheet(); toast('Contraseña actualizada'); break; }
    case 'cfg': {
      const url = f.payment_url.trim();
      if (url && !/^https:\/\//.test(url)) return toast('El link de pago debe empezar con https://');
      const row = { brand_name: f.brand_name.trim(), brand_color: f.brand_color, trial_days: Math.min(90, Math.max(0, parseInt(f.trial_days, 10) || 0)), price_text: f.price_text.trim(), payment_url: url, whatsapp: f.whatsapp.replace(/[^\d+]/g, '') };
      busy(true); const { error } = await sb.from('settings').update(row).eq('id', 1); busy(false);
      if (error) return toast('No se pudo guardar');
      ui.cfg = { ...ui.cfg, ...row }; rerender(); toast('Configuración guardada'); break; }
    case 'setdate': adminSet(id, 'active', new Date(f.date + 'T23:59:59').toISOString()); break;
    case 'debt': {
      const n = amt(); if (n === null) return;
      const d = id ? findAny(id) : null;
      const data = { name: f.name.trim(), kind: f.kind.trim(), due: f.due, total: n, note: f.note.trim() };
      if (d) Object.assign(d, data); else (f.side === 'c' ? S.credits : S.debts).push({ id: uid(), payments: [], ...data });
      if (!d) ui.side = f.side === 'c' ? 'c' : 'd';
      done('Guardado'); break; }
    case 'pay': {
      const n = amt(); if (n === null) return;
      const d = findAny(id), cr = S.credits.includes(d);
      if (n > pending(d) + 0.001) return toast(`Solo faltan ${money(pending(d))}`);
      d.payments.push({ id: uid(), amount: n, date: f.date || todayStr(), accountId: f.accountId, ts: Date.now() });
      done(pending(d) === 0 ? (cr ? '¡Te pagaron todo! 🎉' : '¡Deuda saldada! 🎉') : (cr ? 'Cobro registrado' : 'Pago registrado')); break; }
    case 'out': case 'in': {
      const n = amt(); if (n === null) return;
      const arr = k === 'out' ? S.expenses : S.incomes, x = id ? find(arr, id) : null;
      const data = { amount: n, concept: f.concept.trim(), date: f.date || todayStr(), accountId: f.accountId, [k === 'out' ? 'category' : 'kind']: f.cat };
      if (x) Object.assign(x, data); else arr.push({ id: uid(), ts: Date.now(), ...data });
      ui.month = monthOf(data.date); done(k === 'out' ? 'Gasto guardado' : 'Ingreso guardado'); break; }
    case 'prospect': {
      const n = amt(); if (n === null) return;
      const pr = id ? find(S.prospects, id) : null;
      const data = { name: f.name.trim(), estimate: n, date: f.date, note: f.note.trim() };
      if (pr) Object.assign(pr, data); else S.prospects.push({ id: uid(), status: 'open', ...data });
      ui.inSide = 'p'; done('Guardado'); break; }
    case 'sell': {
      const pr = find(S.prospects, id), total = parseAmount(f.amount);
      const down = f.down.trim() === '' ? total : parseAmount(f.down), n = parseInt(f.cuotas, 10) || 0;
      if (!(total > 0) || isNaN(down) || down < 0 || down > total) return toast('Revisá los montos');
      const rest = total - down;
      if (rest > 0.004 && n < 1) return toast('Poné en cuántas cuotas se paga el resto');
      const date = f.date || todayStr();
      if (down > 0) S.incomes.push({ id: uid(), ts: Date.now(), amount: down, concept: (rest > 0.004 ? 'Entrega: ' : 'Venta: ') + pr.name, kind: 'Venta', date, accountId: f.accountId });
      if (rest > 0.004) S.credits.push({ id: uid(), name: pr.name, kind: 'Ventas en cuotas', due: f.first || '', first: f.first || '', total: rest, cuotas: n, cuota: Math.ceil(rest / n), note: `Venta total ${money(total)}`, payments: [] });
      pr.status = 'sold'; pr.price = total; ui.inSide = 'r'; ui.month = monthOf(date);
      done(rest > 0.004 ? 'Venta registrada. Las cuotas están en "Me deben"' : 'Venta registrada'); break; }
    case 'acc': {
      const n = parseAmount(f.amount || '0'); if (isNaN(n)) return toast('Monto inválido');
      const a = id ? find(S.accounts, id) : null;
      if (a) { a.name = f.name.trim(); a.type = f.type; a.initial += n - accBalance(a); }
      else S.accounts.push({ id: uid(), name: f.name.trim(), type: f.type, initial: n });
      done('Cuenta guardada'); break; }
  }
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || ui.stage !== 'app' || !sb || ui.dirty || $('.scrim')) return;
  if (!(await refreshAccess()) || ui.stage !== 'app') return;
  const before = JSON.stringify(S); await loadData(); if (JSON.stringify(S) !== before) rerender();
});
addEventListener('online', () => { if (ui.dirty) push(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
if (sb) { initAuth(); render(); } else render();

document.addEventListener('input', e => { if (e.target.closest('form[data-form=sell]')) sellHint(); });
