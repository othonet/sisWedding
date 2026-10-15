(() => {
  'use strict';

  const W = window.WEDDING;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const GUEST_KEY = 'sisWedding.guest';

  const state = {
    guest: null,          // { id, firstName, lastName }
    gifts: [],            // lista vinda da API
    cart: new Map(),      // giftId -> quantidade
    previous: [],         // presentes já confirmados pelo convidado
    lastConfirmed: [],    // presentes da última confirmação
    filter: 'available',
    pollTimer: null,
  };

  // ---------- Utilidades ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Não foi possível concluir. Tente novamente.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast glass show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> ${label || 'Aguarde'}`;
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
      btn.disabled = false;
    }
  }

  // ---------- Dados do convite ----------
  const when = new Date(W.date);
  const fmt = (opts) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }).format(when);
  const mapQuery = encodeURIComponent(W.venue.mapQuery || W.venue.address);
  const links = {
    embed: `https://maps.google.com/maps?q=${mapQuery}&z=16&output=embed`,
    gmaps: `https://www.google.com/maps/search/?api=1&query=${mapQuery}`,
    waze: `https://waze.com/ul?q=${mapQuery}&navigate=yes`,
  };

  const binds = {
    bride: W.bride,
    groom: W.groom,
    blessing: W.blessing,
    invitationText: W.invitationText,
    weekday: fmt({ weekday: 'long' }).replace('-feira', ''),
    day: fmt({ day: '2-digit' }),
    time: fmt({ hour: '2-digit', minute: '2-digit' }).replace(':00', 'h').replace(':', 'h'),
    monthYear: `${fmt({ month: 'long' })} ${fmt({ year: 'numeric' })}`,
    dateShort: fmt({ day: '2-digit', month: 'long' }),
    venueName: W.venue.name,
    venueAddress: W.venue.address,
    dressCode: W.dressCode || '',
    thanksMessage: W.thanksMessage,
  };
  $$('[data-bind]').forEach((el) => { el.textContent = binds[el.dataset.bind] ?? ''; });
  document.title = `${W.bride} & ${W.groom} — Convite de Casamento`;
  $('#invite-map-link').href = links.gmaps;
  $('#gmaps-link').href = links.gmaps;
  $('#waze-link').href = links.waze;

  // ---------- Navegação entre telas ----------
  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    clearInterval(state.pollTimer);
    updateCartBar(name === 'gifts');
    if (name === 'gifts') {
      loadGifts();
      state.pollTimer = setInterval(() => loadGifts({ quiet: true }), 20000);
    }
    if (name === 'thanks' && !$('#map-frame').src) $('#map-frame').src = links.embed;
    if (name === 'identify') setTimeout(() => $('#first-name').focus({ preventScroll: true }), 350);
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    e.preventDefault();
    const target = go.dataset.go;
    // Quem já se identificou neste aparelho vai direto à lista
    if (target === 'identify' && state.guest) return show('gifts');
    show(target);
  });

  // ---------- Identificação ----------
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
    if (saved?.id) state.guest = saved;
  } catch { /* armazenamento indisponível */ }

  $('#identify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = $('#first-name').value.trim();
    const lastName = $('#last-name').value.trim();
    const errorEl = $('#identify-error');
    errorEl.textContent = '';
    if (firstName.length < 2) return (errorEl.textContent = 'Por favor, informe seu nome.');
    if (lastName.length < 2) return (errorEl.textContent = 'Por favor, informe seu sobrenome.');

    const btn = e.submitter || $('#identify-form button[type=submit]');
    setBusy(btn, true, 'Entrando');
    try {
      const data = await api('/api/guests', { method: 'POST', body: { firstName, lastName } });
      setGuest(data.guest, data.selections);
      show('gifts');
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      setBusy(btn, false);
    }
  });

  function setGuest(guest, previous = []) {
    state.guest = guest;
    state.previous = previous;
    state.cart.clear();
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(guest)); } catch { /* ignore */ }
    renderGuest();
  }

  function renderGuest() {
    if (!state.guest) return;
    $('#guest-first-name').textContent = state.guest.firstName;
    const list = $('#already-list');
    list.innerHTML = state.previous
      .map((s) => `<li>${esc(s.name)}${s.quantity > 1 ? ` (${s.quantity})` : ''}</li>`)
      .join('');
    $('#already').hidden = state.previous.length === 0;
  }

  // Trocar de convidado (ex.: aparelho compartilhado pela família)
  $('#switch-guest').addEventListener('click', () => {
    state.guest = null;
    state.previous = [];
    state.cart.clear();
    try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    $('#identify-form').reset();
    show('identify');
  });

  // ---------- Presentes ----------
  async function loadGifts({ quiet = false } = {}) {
    const grid = $('#gift-grid');
    if (!quiet && state.gifts.length === 0) {
      grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    }
    try {
      const [{ gifts }, mine] = await Promise.all([
        api('/api/gifts'),
        quiet || !state.guest ? null : api(`/api/selections?guestId=${state.guest.id}`).catch(() => null),
      ]);
      state.gifts = gifts;
      if (mine) { state.previous = mine.selections; renderGuest(); }
      reconcileCart();
      renderGifts({ animate: !quiet });
    } catch (err) {
      if (!quiet) grid.innerHTML = `<div class="empty glass">${esc(err.message)}</div>`;
    }
  }

  // Ajusta o carrinho se algum presente esgotou enquanto o convidado escolhia
  function reconcileCart() {
    let changed = false;
    for (const [id, qty] of state.cart) {
      const gift = state.gifts.find((g) => g.id === id);
      const max = gift ? gift.available : 0;
      if (qty > max) {
        changed = true;
        if (max > 0) state.cart.set(id, max); else state.cart.delete(id);
      }
    }
    if (changed) toast('Alguns presentes foram escolhidos por outros convidados e sua seleção foi ajustada.', 'error');
    updateCartBar(true);
  }

  function renderGifts({ animate = false } = {}) {
    const grid = $('#gift-grid');
    grid.classList.toggle('no-anim', !animate);
    const list = state.gifts.filter((g) => {
      if (state.filter === 'available') return g.available > 0 || state.cart.has(g.id);
      if (state.filter === 'selected') return state.cart.has(g.id);
      return true;
    });

    if (list.length === 0) {
      const msg = state.filter === 'selected'
        ? 'Você ainda não selecionou nenhum presente.'
        : 'Todos os presentes da lista já foram escolhidos. Obrigado pelo carinho!';
      grid.innerHTML = `<div class="empty glass">${msg}</div>`;
      return;
    }

    grid.innerHTML = list.map((g, i) => giftCard(g, i)).join('');
  }

  function giftCard(g, index) {
    const inCart = state.cart.get(g.id) || 0;
    const soldOut = g.available === 0;
    const multi = g.quantity > 1;
    const media = g.imageUrl
      ? `<img src="${esc(g.imageUrl)}" alt="" loading="lazy">`
      : '<svg class="placeholder"><use href="#i-gift"/></svg>';
    const badge = soldOut
      ? '<span class="badge">Esgotado</span>'
      : multi
        ? `<span class="badge">${g.available} de ${g.quantity}</span>`
        : '<span class="badge gold">Único</span>';
    const pct = Math.round((g.reserved / Math.max(g.quantity, 1)) * 100);

    let control;
    if (soldOut && !inCart) {
      control = '<button class="toggle-btn" disabled>Já escolhido</button>';
    } else if (multi && g.available > 1) {
      control = `
        <div class="stepper" role="group" aria-label="Quantidade de ${esc(g.name)}">
          <button data-step="-1" data-id="${g.id}" ${inCart === 0 ? 'disabled' : ''} aria-label="Diminuir">−</button>
          <output>${inCart}</output>
          <button data-step="1" data-id="${g.id}" ${inCart >= g.available ? 'disabled' : ''} aria-label="Aumentar">+</button>
        </div>`;
    } else {
      control = `<button class="toggle-btn" data-toggle="${g.id}">${inCart ? 'Selecionado' : 'Presentear'}</button>`;
    }

    return `
      <article class="gift glass ${inCart ? 'selected' : ''} ${soldOut && !inCart ? 'soldout' : ''}" style="animation-delay:${Math.min(index, 8) * 50}ms">
        <div class="gift-media">
          ${media}
          <span class="check-mark"><svg><use href="#i-check"/></svg></span>
          ${badge}
        </div>
        <div class="gift-body">
          <h3>${esc(g.name)}</h3>
          ${g.description ? `<p>${esc(g.description)}</p>` : ''}
          ${W.showPrices && g.price != null ? `<span class="price">${brl(g.price)}</span>` : ''}
          <div class="gift-foot">
            <div class="stock">
              ${multi ? `${plural(g.available, 'disponível', 'disponíveis')}` : soldOut ? 'Indisponível' : 'Disponível'}
              ${multi ? `<div class="stock-bar"><span style="width:${pct}%"></span></div>` : ''}
            </div>
            ${control}
          </div>
        </div>
      </article>`;
  }

  $('#gift-grid').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    const step = e.target.closest('[data-step]');
    if (!toggle && !step) return;
    const id = Number((toggle || step).dataset.toggle || step.dataset.id);
    const gift = state.gifts.find((g) => g.id === id);
    if (!gift) return;

    const cur = state.cart.get(id) || 0;
    let next = toggle ? (cur ? 0 : 1) : cur + Number(step.dataset.step);
    next = Math.max(0, Math.min(next, gift.available));
    if (next) state.cart.set(id, next); else state.cart.delete(id);
    if (navigator.vibrate) navigator.vibrate(8);
    renderGifts();
    updateCartBar(true);
  });

  $$('.filters .chip').forEach((chip) => chip.addEventListener('click', () => {
    state.filter = chip.dataset.filter;
    $$('.filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderGifts({ animate: true });
  }));

  function cartTotal() {
    let n = 0;
    for (const q of state.cart.values()) n += q;
    return n;
  }

  function updateCartBar(visible) {
    const n = cartTotal();
    $('#cart-count').innerHTML = `<b>${n}</b> ${n === 1 ? 'presente selecionado' : 'presentes selecionados'}`;
    $('#cart-bar').classList.toggle('show', Boolean(visible && n > 0));
  }

  // ---------- Confirmação ----------
  const sheet = $('#confirm-sheet');
  function openSheet() {
    const items = [...state.cart].map(([id, qty]) => ({ gift: state.gifts.find((g) => g.id === id), qty }));
    $('#confirm-list').innerHTML = items
      .filter((i) => i.gift)
      .map((i) => `<li><span>${esc(i.gift.name)}</span><span>${i.qty} ${i.qty === 1 ? 'unidade' : 'unidades'}</span></li>`)
      .join('');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    $('#cart-bar').classList.remove('show');
    setTimeout(() => $('#confirm-btn').focus({ preventScroll: true }), 300);
  }
  function closeSheet() {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    updateCartBar($('#screen-gifts').classList.contains('active'));
  }

  $('#cart-continue').addEventListener('click', openSheet);
  $('#confirm-cancel').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet(); });

  $('#confirm-btn').addEventListener('click', async () => {
    const btn = $('#confirm-btn');
    const items = [...state.cart].map(([giftId, quantity]) => ({ giftId, quantity }));
    if (!items.length) return closeSheet();
    setBusy(btn, true, 'Confirmando');
    try {
      const data = await api('/api/selections', {
        method: 'POST',
        body: { guestId: state.guest.id, items },
      });
      state.lastConfirmed = items.map((i) => ({
        name: state.gifts.find((g) => g.id === i.giftId)?.name || 'Presente',
        quantity: i.quantity,
      }));
      state.previous = data.selections;
      state.cart.clear();
      closeSheet();
      renderThanks();
      show('thanks');
    } catch (err) {
      if (err.status === 404 && /Convidado/.test(err.message)) {
        state.guest = null;
        try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
        closeSheet();
        toast(err.message, 'error');
        return show('identify');
      }
      toast(err.message, 'error');
      if (err.status === 409) {
        closeSheet();
        await loadGifts({ quiet: true });
      }
    } finally {
      setBusy(btn, false);
    }
  });

  // ---------- Agradecimento ----------
  function renderThanks() {
    $('#thanks-name').textContent = state.guest.firstName;
    $('#thanks-list').innerHTML = state.lastConfirmed
      .map((s) => `<li>${esc(s.name)}${s.quantity > 1 ? ` (${s.quantity})` : ''}</li>`)
      .join('');
  }

  // Arquivo .ics para adicionar o almoço à agenda do celular
  $('#calendar-btn').addEventListener('click', () => {
    const start = when;
    const end = new Date(start.getTime() + (W.durationHours || 4) * 3600e3);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = (s) => String(s).replace(/([,;\\])/g, '\\$1');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sisWedding//PT-BR', 'BEGIN:VEVENT',
      `UID:${stamp(start)}-siswedding@convite`, `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${text(`Almoço de casamento — ${W.bride} & ${W.groom}`)}`,
      `LOCATION:${text(`${W.venue.name}, ${W.venue.address}`)}`,
      `DESCRIPTION:${text(links.gmaps)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'almoco-casamento.ics' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  renderGuest();
})();
