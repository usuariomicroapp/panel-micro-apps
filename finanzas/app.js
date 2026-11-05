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

/* ---------- datos ---------- */
const CFG = Object.assign({ commercial: false }, window.MC_CONFIG);
const KEY = 'miscuentas.v1';
const blank = () => ({
  profile: null, admin: null, brand: { name: 'Mis Cuentas', color: '#e8c26a' },
  clients: [], accounts: [], debts: [], expenses: [], incomes: [],
});
let S = blank();
try { S = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S = blank(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('No se pudo guardar: sin espacio'); } }

const ui = { tab: 'home', month: monthOf(todayStr()), unlocked: false, adminOK: false, view: null, showPaid: false };

/* ---------- cálculos ---------- */
const paid = d => sum(d.payments.map(p => p.amount));
const pending = d => Math.max(0, d.total - paid(d));
function accBalance(a) {
  return a.initial
    + sum(S.incomes.filter(x => x.accountId === a.id).map(x => x.amount))
    - sum(S.expenses.filter(x => x.accountId === a.id).map(x => x.amount))
    - sum(S.debts.flatMap(d => d.payments).filter(p => p.accountId === a.id).map(p => p.amount));
}
const totals = () => {
  const cash = sum(S.accounts.map(accBalance));
  const debt = sum(S.debts.map(pending));
  return { cash, debt, net: cash - debt };
};
const accName = id => S.accounts.find(a => a.id === id)?.name || 'Sin cuenta';

/* ---------- arranque / render ---------- */
function applyBrand() {
  const c = S.brand.color || '#e8c26a';
  document.documentElement.style.setProperty('--gold', c);
  document.documentElement.style.setProperty('--gold2', `color-mix(in srgb, ${c} 68%, #000)`);
  document.title = S.brand.name || 'Mis Cuentas';
}
function render() {
  applyBrand();
  const app = $('#app');
  if (!S.profile) return (app.innerHTML = setupView());
  if (S.profile.pin && !ui.unlocked) return (app.innerHTML = lockView());
  app.innerHTML = shell();
}
const logo = () => `<div class="logo">${esc((S.brand.name || 'M')[0].toUpperCase())}</div>`;

function setupView() {
  return `<div class="auth"><form class="box" data-form="setup">
    ${logo()}<h1>Tu plata, <span style="color:var(--gold)">bajo control</span></h1>
    <p>Deudas, gastos e ingresos en un solo lugar. Todo queda guardado en este dispositivo.</p>
    <label class="f"><span>¿Cómo te llamás?</span><input class="inp" name="name" required placeholder="Tu nombre" autocomplete="name"></label>
    <label class="f"><span>PIN de 4 a 6 números (opcional, para que nadie más entre)</span>
      <input class="inp" name="pin" inputmode="numeric" pattern="\\d{4,6}" maxlength="6" placeholder="••••"></label>
    <div class="btns"><button class="btn">Empezar</button></div>
    <p class="hint" style="margin-top:14px">Vamos a crear tus cuentas básicas (Efectivo, Mercado Pago, Banco…). Después las editás a gusto.</p>
  </form></div>`;
}
function lockView() {
  return `<div class="auth"><form class="box" data-form="unlock">
    ${logo()}<h1>Hola, ${esc(S.profile.name)}</h1><p>Ingresá tu PIN para continuar.</p>
    <label class="f"><input class="inp" name="pin" type="password" inputmode="numeric" maxlength="6" autofocus placeholder="PIN" style="text-align:center;font-size:22px;letter-spacing:.4em"></label>
    <div class="btns"><button class="btn">Entrar</button></div></form></div>`;
}

function shell() {
  const v = ui.view;
  if (v === 'settings') return settingsView();
  if (v === 'admin') return adminView();
  const t = ui.tab;
  const body = { home: homeView, debts: debtsView, expenses: expensesView, incomes: incomesView }[t]();
  const tab = (k, ic, l) => `<button class="tab ${t === k ? 'on' : ''}" data-act="tab" data-v="${k}">${I[ic]}${l}</button>`;
  return `<div class="shell">
    <div class="top"><div class="brand">${logo()}<div><small>Hola, ${esc(S.profile.name)}</small><h1>${esc(S.brand.name)}</h1></div></div>
      <button class="iconbtn" data-act="settings" aria-label="Ajustes">${I.gear}</button></div>
    ${body}</div>
    <nav class="tabs">${tab('home', 'home', 'Inicio')}${tab('debts', 'debt', 'Deudas')}
      <button class="fab" data-act="add" aria-label="Agregar">${I.plus}</button>
      ${tab('expenses', 'out', 'Gastos')}${tab('incomes', 'in', 'Ingresos')}</nav>`;
}

/* ---------- vistas ---------- */
function homeView() {
  const { cash, debt, net } = totals();
  const cov = debt === 0 ? 100 : Math.min(100, Math.max(0, (cash / debt) * 100));
  const m = ui.month === monthOf(todayStr()) ? ui.month : monthOf(todayStr());
  const inM = sum(S.incomes.filter(x => monthOf(x.date) === m).map(x => x.amount));
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
  const recent = [
    ...S.incomes.map(x => ({ ...x, k: 'in' })), ...S.expenses.map(x => ({ ...x, k: 'out' })),
    ...S.debts.flatMap(d => d.payments.map(p => ({ ...p, k: 'pay', concept: 'Pago: ' + d.name }))),
  ].sort((a, b) => (b.date + (b.ts || 0)) < (a.date + (a.ts || 0)) ? -1 : 1).slice(0, 6).map(moveRow).join('');

  const stale = (S.debts.length || S.incomes.length || S.expenses.length) && (!S.lastBackup || Date.now() - S.lastBackup > 7 * 864e5);
  const warn = stale ? `<div class="note" style="margin:0 0 14px">💾 Hace más de una semana que no guardás una copia de seguridad. <button class="link" data-act="export">Guardar ahora</button></div>` : '';
  return `
  ${warn}<section class="hero"><div class="lbl">Balance general</div>
    <div class="big num" style="color:${net < 0 ? 'var(--bad)' : 'var(--fg)'}">${money(net)}</div>
    ${pill}
    <div class="meter"><i style="width:${cov}%"></i></div>
    <div class="sub"><span>${msg}</span></div></section>
  <div class="stats">
    <div class="stat cash"><span>Plata que tengo</span><b class="num">${money(cash)}</b></div>
    <div class="stat debt"><span>Total que debo</span><b class="num">${money(debt)}</b></div>
    <div class="stat"><span>Ingresos del mes</span><b class="num" style="color:var(--good)">${money(inM)}</b></div>
    <div class="stat"><span>Gastos del mes</span><b class="num" style="color:var(--bad)">${money(outM)}</b></div></div>
  <section class="sec"><div class="sechead"><h2>Dónde está tu plata</h2><button class="link" data-act="new-acc">+ Cuenta</button></div>
    <div class="card">${accs}</div></section>
  <section class="sec"><div class="sechead"><h2>Qué me falta pagar</h2><button class="link" data-act="tab" data-v="debts">Ver todo</button></div>
    <div class="card">${dl || `<div class="empty"><b>Todo al día</b>No hay deudas pendientes.</div>`}</div></section>
  <section class="sec"><div class="sechead"><h2>Últimos movimientos</h2></div>
    <div class="card">${recent || `<div class="empty"><b>Sin movimientos</b>Usá el botón + para cargar el primero.</div>`}</div></section>`;
}

function debtRow(d) {
  const p = pending(d), pc = d.total ? Math.min(100, (paid(d) / d.total) * 100) : 0;
  const late = d.due && p > 0 && d.due < todayStr();
  return `<div class="row" data-act="debt" data-id="${d.id}"><div class="ico">${p === 0 ? '✅' : '💳'}</div>
    <div class="t"><b>${esc(d.name)}</b>
      <small>${esc(d.kind || 'Deuda')}${d.due ? ` · vence ${fmtDate(d.due)}${late ? ' ⚠️' : ''}` : ''}</small>
      <div class="mini"><i style="width:${pc}%"></i></div></div>
    <div class="amt num ${p ? 'out' : 'in'}">${p ? money(p) : 'Pagada'}${p && paid(d) ? `<div class="hint" style="font-weight:400;font-size:12px">de ${money(d.total)}</div>` : ''}</div></div>`;
}
function moveRow(x) {
  const icon = x.k === 'in' ? INKINDS[x.kind] || '✨' : x.k === 'out' ? CATS[x.category] || '🧩' : '💸';
  const act = x.k === 'in' ? 'edit-in' : x.k === 'out' ? 'edit-out' : '';
  return `<div class="row" ${act ? `data-act="${act}" data-id="${x.id}"` : ''}><div class="ico">${icon}</div>
    <div class="t"><b>${esc(x.concept)}</b><small>${fmtDate(x.date)} · ${esc(accName(x.accountId))}</small></div>
    <div class="amt num ${x.k === 'in' ? 'in' : 'out'}">${x.k === 'in' ? '+' : '−'}${money(x.amount)}</div></div>`;
}

function debtsView() {
  const open = S.debts.filter(d => pending(d) > 0).sort((a, b) => pending(b) - pending(a));
  const done = S.debts.filter(d => pending(d) === 0);
  const tot = sum(S.debts.map(pending)), totAll = sum(S.debts.map(d => d.total));
  const byKind = {};
  open.forEach(d => { const k = d.kind || 'Otras'; byKind[k] = (byKind[k] || 0) + pending(d); });
  const bars = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
    <div class="cat"><div class="h"><span>${esc(k)}</span><span class="num">${money(v)}</span></div>
    <div class="mini"><i style="width:${(v / tot) * 100}%"></i></div></div>`).join('');
  return `
  <section class="hero"><div class="lbl">Total que debés</div><div class="big num" style="color:var(--bad)">${money(tot)}</div>
    <div class="sub"><span>Ya pagaste ${money(totAll - tot)} de ${money(totAll)}</span></div>
    <div class="meter"><i style="width:${totAll ? ((totAll - tot) / totAll) * 100 : 0}%"></i></div></section>
  ${bars ? `<section class="sec"><div class="sechead"><h2>Por tipo de deuda</h2></div><div class="card" style="padding-block:12px">${bars}</div></section>` : ''}
  <section class="sec"><div class="sechead"><h2>Mis deudas</h2><button class="link" data-act="new-debt">+ Nueva deuda</button></div>
    <div class="card">${open.map(debtRow).join('') || `<div class="empty"><b>No hay deudas pendientes</b>Cargá una con el botón +.</div>`}</div></section>
  ${done.length ? `<section class="sec"><div class="sechead"><h2>Pagadas (${done.length})</h2><button class="link" data-act="toggle-paid">${ui.showPaid ? 'Ocultar' : 'Mostrar'}</button></div>
    ${ui.showPaid ? `<div class="card">${done.map(debtRow).join('')}</div>` : ''}</section>` : ''}`;
}

function monthList(kind) {
  const isOut = kind === 'out';
  const list = (isOut ? S.expenses : S.incomes).filter(x => monthOf(x.date) === ui.month).sort((a, b) => (b.date + b.ts) < (a.date + a.ts) ? -1 : 1);
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
    <div class="card">${list.map(x => moveRow({ ...x, k: kind })).join('') || `<div class="empty"><b>Nada cargado este mes</b>Tocá + para agregar.</div>`}</div></section>`;
}
const expensesView = () => monthList('out');
const incomesView = () => monthList('in');

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
    <button class="btn ghost" data-act="new-debt">💳 Una deuda nueva</button>
    <button class="btn ghost" data-act="pay-pick">💸 Pagué una deuda</button>
    <button class="btn ghost" data-act="new-acc">🏦 Una cuenta nueva</button></div>`);
}
function debtForm(d) {
  const kinds = [...new Set(['Materias primas', 'Tarjetas', 'Préstamos', 'Proveedores', 'Servicios', 'Personas', ...S.debts.map(x => x.kind).filter(Boolean)])];
  sheet(`<h2>${d ? 'Editar deuda' : 'Nueva deuda'}</h2><form data-form="debt" data-id="${d?.id || ''}">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required placeholder="Ej: Deuda materias primas" value="${esc(d?.name)}"></label>
    <div class="two"><label class="f"><span>Tipo</span><input class="inp" name="kind" list="kinds" placeholder="Ej: Tarjetas" value="${esc(d?.kind)}"><datalist id="kinds">${kinds.map(k => `<option>${esc(k)}</option>`).join('')}</datalist></label>
    <label class="f"><span>Vence (opcional)</span><input class="inp" type="date" name="due" value="${d?.due || ''}"></label></div>
    ${amountInput(d?.total)}
    <label class="f"><span>Nota (opcional)</span><input class="inp" name="note" placeholder="A quién le debés, detalle…" value="${esc(d?.note)}"></label>
    <div class="btns"><button class="btn">Guardar</button>${d ? `<button type="button" class="btn danger" data-act="del-debt" data-id="${d.id}">Eliminar deuda</button>` : ''}</div></form>`);
}
function debtDetail(id) {
  const d = S.debts.find(x => x.id === id); if (!d) return;
  const p = pending(d);
  sheet(`<h2>${esc(d.name)}</h2>
    <div class="stats" style="margin:0 0 14px"><div class="stat"><span>Total</span><b class="num">${money(d.total)}</b></div>
    <div class="stat debt"><span>Falta pagar</span><b class="num">${money(p)}</b></div></div>
    <p class="hint">${esc(d.kind || '')}${d.due ? ` · vence ${fmtDate(d.due)}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</p>
    <div class="btns h" style="margin-bottom:14px">
      <button class="btn" data-act="pay" data-id="${d.id}" ${p ? '' : 'disabled style="opacity:.4"'}>Registrar pago</button>
      <button class="btn ghost" data-act="edit-debt" data-id="${d.id}">Editar</button></div>
    ${d.payments.length ? `<h3 style="margin:8px 0">Pagos realizados</h3><div class="card">${d.payments.slice().reverse().map(x => `
      <div class="row" data-act="del-pay" data-id="${d.id}" data-pid="${x.id}"><div class="ico">💸</div>
      <div class="t"><b>${fmtDate(x.date)}</b><small>Desde ${esc(accName(x.accountId))}</small></div><div class="amt num in">${money(x.amount)}</div></div>`).join('')}</div>
      <p class="hint">Tocá un pago para anularlo (la plata vuelve a la cuenta).</p>` : ''}`);
}
function payForm(id) {
  const d = S.debts.find(x => x.id === id); if (!d) return;
  sheet(`<h2>Pago · ${esc(d.name)}</h2><p class="hint">Falta pagar ${money(pending(d))}</p>
    <form data-form="pay" data-id="${id}">${amountInput(pending(d))}
    <div class="two"><label class="f"><span>Pagué desde</span><select class="inp" name="accountId">${accOptions(S.accounts[0]?.id)}</select></label>
    <label class="f"><span>Fecha</span><input class="inp" type="date" name="date" value="${todayStr()}"></label></div>
    <div class="btns"><button class="btn">Registrar pago</button></div></form>`);
}
function payPick() {
  const open = S.debts.filter(d => pending(d) > 0);
  if (!open.length) { toast('No tenés deudas pendientes'); return; }
  sheet(`<h2>¿Qué deuda pagaste?</h2><div class="card">${open.map(debtRow).join('')}</div>`);
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
function accForm(a) {
  sheet(`<h2>${a ? 'Editar cuenta' : 'Nueva cuenta'}</h2><form data-form="acc" data-id="${a?.id || ''}">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required placeholder="Ej: Mercado Pago" value="${esc(a?.name)}"></label>
    <label class="f"><span>Tipo</span><select class="inp" name="type">${opts(ACCTYPES, a?.type)}</select></label>
    <label class="f"><span>${a ? 'Saldo actual (corrige el saldo)' : 'Plata que tiene hoy'}</span>
      <input class="inp num" name="amount" inputmode="decimal" placeholder="$ 0" value="${a ? accBalance(a) : ''}" style="font-size:22px"></label>
    <div class="btns"><button class="btn">Guardar</button>${a ? `<button type="button" class="btn danger" data-act="del-acc" data-id="${a.id}">Eliminar cuenta</button>` : ''}</div></form>`);
}

/* ---------- ajustes y administrador ---------- */
function settingsView() {
  const row = (act, ic, t, s) => `<div class="row" data-act="${act}"><div class="ico">${ic}</div><div class="t"><b>${t}</b><small>${s}</small></div></div>`;
  return `<div class="shell"><div class="top"><button class="iconbtn" data-act="back" aria-label="Volver">${I.back}</button><h1 style="font-size:20px">Ajustes</h1><span style="width:42px"></span></div>
  <section class="card">
    ${row('profile', '👤', 'Mi perfil y PIN', esc(S.profile.name) + (S.profile.pin ? ' · PIN activado' : ' · sin PIN'))}
    ${row('export', '⬇️', 'Guardar copia de seguridad', 'Descargá tus datos en un archivo')}
    ${row('import', '⬆️', 'Restaurar copia', 'Cargá un archivo guardado antes')}
    ${S.profile.pin ? row('lock', '🔒', 'Bloquear ahora', 'Volver a pedir el PIN') : ''}
  </section>
  ${CFG.commercial ? `<section class="card" style="margin-top:16px">${row('admin', '🛡️', 'Panel de administrador', 'Marca, clientes y licencias')}</section>` : ''}
  <input type="file" id="file" accept="application/json" hidden>
  <p class="hint" style="text-align:center;margin-top:22px">Tus datos viven solo en este dispositivo.<br>Hacé copias de seguridad seguido.</p></div>`;
}
function profileForm() {
  sheet(`<h2>Mi perfil</h2><form data-form="profile">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required value="${esc(S.profile.name)}"></label>
    <label class="f"><span>PIN nuevo (4 a 6 números) · vacío = sin PIN</span><input class="inp" name="pin" inputmode="numeric" pattern="\\d{4,6}" maxlength="6" placeholder="••••"></label>
    <div class="btns"><button class="btn">Guardar</button></div></form>`);
}
function adminAuth() {
  if (!S.admin) {
    sheet(`<h2>Crear administrador</h2><p class="hint">Este usuario maneja la marca y los clientes. Guardá bien la clave.</p>
      <form data-form="admin-new"><label class="f"><span>Usuario</span><input class="inp" name="user" required autocapitalize="none" value="admin"></label>
      <label class="f"><span>Clave (mínimo 6 caracteres)</span><input class="inp" type="password" name="pass" required minlength="6"></label>
      <div class="btns"><button class="btn">Crear y entrar</button></div></form>`);
  } else {
    sheet(`<h2>Administrador</h2><form data-form="admin-login">
      <label class="f"><span>Usuario</span><input class="inp" name="user" required autocapitalize="none"></label>
      <label class="f"><span>Clave</span><input class="inp" type="password" name="pass" required></label>
      <div class="btns"><button class="btn">Entrar</button></div></form>`);
  }
}
function adminView() {
  const act = S.clients.filter(c => c.active).length;
  return `<div class="shell"><div class="top"><button class="iconbtn" data-act="settings" aria-label="Volver">${I.back}</button><h1 style="font-size:20px">Administrador</h1><span style="width:42px"></span></div>
  <div class="stats" style="margin-top:0"><div class="stat"><span>Clientes</span><b class="num">${S.clients.length}</b></div><div class="stat cash"><span>Activos</span><b class="num">${act}</b></div></div>
  <section class="sec"><div class="sechead"><h2>Clientes</h2><button class="link" data-act="new-client">+ Cliente</button></div>
    <div class="card">${S.clients.map(c => `<div class="row" data-act="edit-client" data-id="${c.id}"><div class="ico">🧑‍💼</div>
      <div class="t"><b>${esc(c.name)}</b><small><span class="code">${esc(c.code)}</span>${c.plan ? ' · ' + esc(c.plan) : ''}${c.until ? ' · hasta ' + fmtDate(c.until) : ''}</small></div>
      <span class="chip ${c.active ? 'on' : 'off'}">${c.active ? 'Activo' : 'Pausado'}</span></div>`).join('') || `<div class="empty"><b>Sin clientes todavía</b>Registrá a quienes les vendas la app.</div>`}</div></section>
  <section class="sec"><div class="sechead"><h2>Marca de esta copia</h2></div>
    <form class="card" data-form="brand" style="padding-block:16px">
      <label class="f"><span>Nombre de la app</span><input class="inp" name="name" required value="${esc(S.brand.name)}"></label>
      <label class="f"><span>Color principal</span><input class="inp" type="color" name="color" value="${esc(S.brand.color)}" style="height:50px;padding:4px"></label>
      <div class="btns"><button class="btn">Guardar marca</button></div></form></section>
  <section class="sec"><div class="sechead"><h2>Seguridad y datos</h2></div><div class="card">
    <div class="row" data-act="admin-pass"><div class="ico">🔑</div><div class="t"><b>Cambiar clave de administrador</b></div></div>
    <div class="row" data-act="wipe"><div class="ico">🧹</div><div class="t"><b>Borrar datos de uso</b><small>Deja la copia limpia para entregarla (conserva marca y clientes)</small></div></div>
    <div class="row" data-act="admin-out"><div class="ico">🚪</div><div class="t"><b>Salir del panel</b></div></div></div></section>
  <div class="note">Cada cliente usa su propia copia de la app y sus datos quedan en su dispositivo. Este panel es tu registro de clientes y códigos de acceso.</div></div>`;
}
function clientForm(c) {
  const code = c?.code || (Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6)).toUpperCase();
  sheet(`<h2>${c ? 'Editar cliente' : 'Nuevo cliente'}</h2><form data-form="client" data-id="${c?.id || ''}">
    <label class="f"><span>Nombre</span><input class="inp" name="name" required value="${esc(c?.name)}"></label>
    <div class="two"><label class="f"><span>WhatsApp / contacto</span><input class="inp" name="phone" value="${esc(c?.phone)}"></label>
    <label class="f"><span>Plan</span><input class="inp" name="plan" placeholder="Mensual, Anual…" value="${esc(c?.plan)}"></label></div>
    <div class="two"><label class="f"><span>Código de acceso</span><input class="inp code" name="code" required value="${esc(code)}"></label>
    <label class="f"><span>Vence</span><input class="inp" type="date" name="until" value="${c?.until || ''}"></label></div>
    <label class="f"><span>Estado</span><select class="inp" name="active"><option value="1" ${c?.active !== false ? 'selected' : ''}>Activo</option><option value="0" ${c?.active === false ? 'selected' : ''}>Pausado</option></select></label>
    <div class="btns"><button class="btn">Guardar</button>${c ? `<button type="button" class="btn ghost" data-act="copy-client" data-id="${c.id}">Copiar mensaje de bienvenida</button><button type="button" class="btn danger" data-act="del-client" data-id="${c.id}">Eliminar cliente</button>` : ''}</div></form>`);
}

/* ---------- eventos ---------- */
const find = (arr, id) => arr.find(x => x.id === id);
const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };
function done(msg) { save(); closeSheet(); rerender(); if (msg) toast(msg); }
function confirmDo(msg, fn) { if (confirm(msg)) fn(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, v, d, pid } = el.dataset;
  switch (act) {
    case 'tab': ui.tab = v; ui.view = null; closeSheet(); rerender(); scrollTo(0, 0); break;
    case 'add': ({ home: chooser, debts: () => debtForm(), expenses: () => moveForm('out'), incomes: () => moveForm('in') })[ui.tab](); break;
    case 'month': ui.month = shiftMonth(ui.month, +d); rerender(); break;
    case 'toggle-paid': ui.showPaid = !ui.showPaid; rerender(); break;
    case 'settings': ui.view = 'settings'; closeSheet(); rerender(); scrollTo(0, 0); break;
    case 'back': ui.view = null; rerender(); break;
    case 'new-debt': debtForm(); break;
    case 'edit-debt': debtForm(find(S.debts, id)); break;
    case 'debt': debtDetail(id); break;
    case 'pay': payForm(id); break;
    case 'pay-pick': payPick(); break;
    case 'del-pay': confirmDo('¿Anular este pago? La plata vuelve a la cuenta.', () => { const dd = find(S.debts, id); dd.payments = dd.payments.filter(p => p.id !== pid); save(); rerender(); debtDetail(id); }); break;
    case 'del-debt': confirmDo('¿Eliminar esta deuda y sus pagos?', () => { S.debts = S.debts.filter(x => x.id !== id); done('Deuda eliminada'); }); break;
    case 'new-out': moveForm('out'); break;
    case 'new-in': moveForm('in'); break;
    case 'edit-out': moveForm('out', find(S.expenses, id)); break;
    case 'edit-in': moveForm('in', find(S.incomes, id)); break;
    case 'del-out': confirmDo('¿Eliminar este gasto?', () => { S.expenses = S.expenses.filter(x => x.id !== id); done('Gasto eliminado'); }); break;
    case 'del-in': confirmDo('¿Eliminar este ingreso?', () => { S.incomes = S.incomes.filter(x => x.id !== id); done('Ingreso eliminado'); }); break;
    case 'new-acc': accForm(); break;
    case 'edit-acc': accForm(find(S.accounts, id)); break;
    case 'del-acc': confirmDo('¿Eliminar la cuenta? Sus movimientos quedan sin cuenta.', () => {
      S.accounts = S.accounts.filter(x => x.id !== id);
      [...S.incomes, ...S.expenses, ...S.debts.flatMap(x => x.payments)].forEach(m => { if (m.accountId === id) m.accountId = ''; });
      done('Cuenta eliminada'); }); break;
    case 'profile': profileForm(); break;
    case 'lock': ui.unlocked = false; ui.view = null; rerender(); break;
    case 'export': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      a.download = `mis-cuentas-${todayStr()}.json`; a.click(); S.lastBackup = Date.now(); save(); rerender(); toast('Copia descargada'); break; }
    case 'import': $('#file').click(); break;
    case 'admin': if (!CFG.commercial) break; ui.adminOK ? (ui.view = 'admin', rerender()) : adminAuth(); break;
    case 'admin-out': ui.adminOK = false; ui.view = 'settings'; rerender(); break;
    case 'admin-pass': adminPassForm(); break;
    case 'new-client': clientForm(); break;
    case 'edit-client': clientForm(find(S.clients, id)); break;
    case 'del-client': confirmDo('¿Eliminar este cliente?', () => { S.clients = S.clients.filter(x => x.id !== id); done('Cliente eliminado'); }); break;
    case 'copy-client': {
      const c = find(S.clients, id);
      const txt = `¡Hola ${c.name}! Te paso tu acceso a ${S.brand.name}.\nTu código: ${c.code}${c.until ? '\nVigente hasta: ' + fmtDate(c.until) : ''}`;
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Mensaje copiado'), () => prompt('Copiá este mensaje:', txt)); break; }
    case 'wipe': confirmDo('Se borran deudas, gastos, ingresos y cuentas de esta copia. ¿Seguro?', () => {
      S.debts = []; S.expenses = []; S.incomes = []; S.accounts = []; S.profile = null; ui.unlocked = false; ui.view = null; ui.tab = 'home'; save(); rerender(); }); break;
  }
});
function adminPassForm() {
  sheet(`<h2>Cambiar clave</h2><form data-form="admin-pass"><label class="f"><span>Clave nueva (mínimo 6)</span><input class="inp" type="password" name="pass" required minlength="6"></label>
    <div class="btns"><button class="btn">Guardar</button></div></form>`);
}

document.addEventListener('change', e => {
  if (e.target.id !== 'file') return;
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    const j = JSON.parse(t);
    if (!j || !Array.isArray(j.debts) || !Array.isArray(j.accounts)) throw 0;
    if (!confirm('Esto reemplaza los datos actuales con los de la copia. ¿Continuar?')) return;
    S = { ...blank(), ...j }; save(); ui.view = null; ui.unlocked = false; render(); toast('Copia restaurada');
  }).catch(() => toast('El archivo no es válido'));
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const k = form.dataset.form, id = form.dataset.id, f = Object.fromEntries(new FormData(form));
  const amt = () => { const n = parseAmount(f.amount); if (!(n > 0)) { toast('Poné un monto válido'); return null; } return n; };
  switch (k) {
    case 'setup': {
      if (f.pin && !/^\d{4,6}$/.test(f.pin)) return toast('El PIN debe tener 4 a 6 números');
      S.profile = { name: f.name.trim(), pin: f.pin ? await sha(f.pin) : null };
      if (!S.accounts.length) S.accounts = [['Efectivo', 'Efectivo'], ['Mercado Pago', 'Billetera'], ['Banco Provincia', 'Banco'], ['Tarjeta Naranja', 'Tarjeta']]
        .map(([name, type]) => ({ id: uid(), name, type, initial: 0 }));
      ui.unlocked = true; save(); render(); toast('¡Listo! Cargá cuánta plata tenés en cada cuenta'); break; }
    case 'unlock':
      if (await sha(f.pin) === S.profile.pin) { ui.unlocked = true; render(); } else { toast('PIN incorrecto'); form.reset(); } break;
    case 'profile':
      if (f.pin && !/^\d{4,6}$/.test(f.pin)) return toast('El PIN debe tener 4 a 6 números');
      S.profile.name = f.name.trim(); if (f.pin) S.profile.pin = await sha(f.pin);
      done('Perfil guardado'); break;
    case 'debt': {
      const n = amt(); if (n === null) return;
      const d = id ? find(S.debts, id) : null;
      const data = { name: f.name.trim(), kind: f.kind.trim(), due: f.due, total: n, note: f.note.trim() };
      if (d) Object.assign(d, data); else S.debts.push({ id: uid(), payments: [], ...data });
      done('Deuda guardada'); break; }
    case 'pay': {
      const n = amt(); if (n === null) return;
      const d = find(S.debts, id);
      if (n > pending(d) + 0.001) return toast(`Solo faltan ${money(pending(d))}`);
      d.payments.push({ id: uid(), amount: n, date: f.date || todayStr(), accountId: f.accountId, ts: Date.now() });
      done(pending(d) === 0 ? '¡Deuda saldada! 🎉' : 'Pago registrado'); break; }
    case 'out': case 'in': {
      const n = amt(); if (n === null) return;
      const arr = k === 'out' ? S.expenses : S.incomes, x = id ? find(arr, id) : null;
      const data = { amount: n, concept: f.concept.trim(), date: f.date || todayStr(), accountId: f.accountId, [k === 'out' ? 'category' : 'kind']: f.cat };
      if (x) Object.assign(x, data); else arr.push({ id: uid(), ts: Date.now(), ...data });
      ui.month = monthOf(data.date); done(k === 'out' ? 'Gasto guardado' : 'Ingreso guardado'); break; }
    case 'acc': {
      const n = parseAmount(f.amount || '0'); if (isNaN(n)) return toast('Monto inválido');
      const a = id ? find(S.accounts, id) : null;
      if (a) { a.name = f.name.trim(); a.type = f.type; a.initial += n - accBalance(a); }
      else S.accounts.push({ id: uid(), name: f.name.trim(), type: f.type, initial: n });
      done('Cuenta guardada'); break; }
    case 'admin-new':
      S.admin = { user: f.user.trim().toLowerCase(), hash: await sha(f.pass) }; ui.adminOK = true; ui.view = 'admin'; done('Administrador creado'); break;
    case 'admin-login':
      if (f.user.trim().toLowerCase() === S.admin.user && await sha(f.pass) === S.admin.hash) { ui.adminOK = true; ui.view = 'admin'; done(); }
      else toast('Usuario o clave incorrectos'); break;
    case 'admin-pass': S.admin.hash = await sha(f.pass); done('Clave actualizada'); break;
    case 'brand': S.brand = { name: f.name.trim(), color: f.color }; done('Marca guardada'); break;
    case 'client': {
      const c = id ? find(S.clients, id) : null;
      const data = { name: f.name.trim(), phone: f.phone.trim(), plan: f.plan.trim(), code: f.code.trim().toUpperCase(), until: f.until, active: f.active === '1' };
      if (S.clients.some(x => x.code === data.code && x.id !== id)) return toast('Ese código ya existe');
      if (c) Object.assign(c, data); else S.clients.push({ id: uid(), ...data });
      done('Cliente guardado'); break; }
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
