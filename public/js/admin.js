(() => {
  'use strict';

  const W = window.WEDDING;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const KEY = 'sisWedding.adminKey';

  let adminKey = sessionStorage.getItem(KEY) || '';
  let data = { guests: [], gifts: [] };
  let timer;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const dateTime = (iso) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  let toastTimer;
  function toast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast glass show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      logout();
      throw new Error(body.error || 'Senha inválida.');
    }
    if (!res.ok) throw new Error(body.error || 'Erro ao comunicar com o servidor.');
    return body;
  }

  // ---------- Login ----------
  $('#couple').textContent = `${W.bride} & ${W.groom}`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    adminKey = $('#password').value;
    $('#login-error').textContent = '';
    try {
      await load();
      sessionStorage.setItem(KEY, adminKey);
      enter();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  function enter() {
    $('#login-view').hidden = true;
    $('#dash-view').hidden = false;
    clearInterval(timer);
    timer = setInterval(() => load().catch(() => {}), 30000);
  }

  function logout() {
    adminKey = '';
    sessionStorage.removeItem(KEY);
    clearInterval(timer);
    $('#dash-view').hidden = true;
    $('#login-view').hidden = false;
  }
  $('#logout').addEventListener('click', logout);

  $('#refresh').addEventListener('click', async () => {
    const icon = $('#refresh svg');
    icon.style.transition = 'transform .6s';
    icon.style.transform = 'rotate(360deg)';
    try { await load(); toast('Dados atualizados.'); } catch (err) { toast(err.message, 'error'); }
    setTimeout(() => { icon.style.transition = 'none'; icon.style.transform = ''; }, 650);
  });

  // ---------- Dados ----------
  async function load() {
    data = await api('/api/admin/summary');
    render();
  }

  function render() {
    renderStats();
    renderGuests();
    renderGifts();
  }

  function renderStats() {
    const withGifts = data.guests.filter((g) => g.selections.length).length;
    const units = data.gifts.reduce((n, g) => n + g.reserved, 0);
    const total = data.gifts.reduce((n, g) => n + g.quantity, 0);
    const soldOut = data.gifts.filter((g) => g.quantity > 0 && g.available === 0).length;
    const value = data.gifts.reduce((n, g) => n + (g.price || 0) * g.reserved, 0);

    $('#st-guests').textContent = data.guests.length;
    $('#st-guests-sub').textContent = `${withGifts} com presente confirmado`;
    $('#st-units').textContent = units;
    $('#st-units-sub').textContent = `de ${total} unidades na lista`;
    $('#st-soldout').textContent = soldOut;
    $('#st-soldout-sub').textContent = `de ${data.gifts.length} itens`;
    $('#st-value').textContent = brl(value);
  }

  function renderGuests() {
    const q = norm($('#guest-search').value.trim());
    const list = data.guests.filter((g) => !q
      || norm(`${g.firstName} ${g.lastName}`).includes(q)
      || g.selections.some((s) => norm(s.name).includes(q)));

    $('#guest-list').innerHTML = list.length
      ? list.map((g) => `
        <article class="guest glass">
          <div class="guest-top">
            <h3>${esc(g.firstName)} ${esc(g.lastName)}</h3>
            <time>${dateTime(g.selections.at(-1)?.createdAt || g.createdAt)}</time>
          </div>
          ${g.selections.length
            ? `<ul>${g.selections.map((s) => `
                <li>
                  <span class="qty">${s.quantity}×</span>
                  <span class="name">${esc(s.name)}</span>
                  <button class="mini-btn" data-cancel="${s.id}" data-label="${esc(s.name)} de ${esc(g.firstName)}" aria-label="Cancelar escolha"><svg><use href="#i-x"/></svg></button>
                </li>`).join('')}</ul>`
            : '<p class="none">Identificou-se, mas ainda não escolheu presente.</p>'}
        </article>`).join('')
      : `<div class="empty glass">${q ? 'Nenhum resultado para a busca.' : 'Nenhum convidado ainda. Compartilhe o convite!'}</div>`;
  }

  function renderGifts() {
    $('#gift-list').innerHTML = data.gifts.length
      ? data.gifts.map((g) => {
        const pct = g.quantity ? Math.round((g.reserved / g.quantity) * 100) : 0;
        return `
          <button class="stock-item glass ${g.available === 0 ? 'done' : ''}" data-edit="${g.id}">
            <h3>${esc(g.name)}</h3>
            <span class="count">${g.reserved} / ${g.quantity}</span>
            <span class="meta">${g.available === 0 ? 'Esgotado' : `${g.available} disponíve${g.available === 1 ? 'l' : 'is'}`}${g.price != null ? ` · ${brl(g.price)}` : ''}</span>
            <span></span>
            <div class="bar"><span style="width:${pct}%"></span></div>
          </button>`;
      }).join('')
      : '<div class="empty glass">Nenhum presente cadastrado.</div>';
  }

  $('#guest-search').addEventListener('input', renderGuests);

  // Cancelar uma escolha (devolve as unidades à lista)
  $('#guest-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    if (!confirm(`Cancelar a escolha "${btn.dataset.label}"? O presente volta a ficar disponível.`)) return;
    try {
      await api(`/api/admin/selections?id=${btn.dataset.cancel}`, { method: 'DELETE' });
      await load();
      toast('Escolha cancelada.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---------- Abas ----------
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $('#tab-guests').hidden = tab.dataset.tab !== 'guests';
    $('#tab-gifts').hidden = tab.dataset.tab !== 'gifts';
  }));

  // ---------- Exportar CSV ----------
  $('#export-csv').addEventListener('click', () => {
    const rows = [['Convidado', 'Presente', 'Quantidade', 'Data']];
    for (const g of data.guests) {
      const name = `${g.firstName} ${g.lastName}`;
      if (!g.selections.length) rows.push([name, '', '', dateTime(g.createdAt)]);
      for (const s of g.selections) rows.push([name, s.name, s.quantity, dateTime(s.createdAt)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'presentes-convidados.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---------- Cadastro de presentes ----------
  const sheet = $('#gift-sheet');
  const form = $('#gift-form');
  const F = form.elements; // form.id e form.name seriam atributos do próprio form

  function openGift(gift) {
    form.reset();
    $('#gift-error').textContent = '';
    $('#gift-form-title').textContent = gift ? 'Editar presente' : 'Novo presente';
    F.id.value = gift?.id || '';
    F.name.value = gift?.name || '';
    F.description.value = gift?.description || '';
    F.quantity.value = gift?.quantity ?? 1;
    F.price.value = gift?.price ?? '';
    F.imageUrl.value = gift?.imageUrl || '';
    F.sortOrder.value = gift?.sortOrder ?? (data.gifts.length + 1);
    $('#delete-gift').hidden = !gift;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  }
  function closeGift() {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  $('#new-gift').addEventListener('click', () => openGift(null));
  $('#cancel-gift').addEventListener('click', closeGift);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeGift(); });
  $('#gift-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-edit]');
    if (item) openGift(data.gifts.find((g) => g.id === Number(item.dataset.edit)));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = F.id.value;
    const body = {
      name: F.name.value,
      description: F.description.value,
      quantity: Number(F.quantity.value),
      price: F.price.value,
      imageUrl: F.imageUrl.value,
      sortOrder: Number(F.sortOrder.value || 0),
    };
    try {
      await api(id ? `/api/admin/gifts?id=${id}` : '/api/admin/gifts', { method: id ? 'PUT' : 'POST', body });
      closeGift();
      await load();
      toast('Presente salvo.');
    } catch (err) {
      $('#gift-error').textContent = err.message;
    }
  });

  $('#delete-gift').addEventListener('click', async () => {
    const id = F.id.value;
    if (!id || !confirm('Excluir este presente da lista?')) return;
    try {
      await api(`/api/admin/gifts?id=${id}`, { method: 'DELETE' });
      closeGift();
      await load();
      toast('Presente excluído.');
    } catch (err) {
      $('#gift-error').textContent = err.message;
    }
  });

  // Sessão já aberta nesta aba
  if (adminKey) load().then(enter).catch(() => logout());
})();
