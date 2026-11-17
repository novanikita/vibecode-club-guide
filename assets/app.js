// Рисует гайд из данных в content/: рубрикатор, оглавление, карточки с подпунктами, словарик.
(function () {
  const G = window.GUIDE;
  const $ = (id) => document.getElementById(id);
  const ALIAS = {};
  for (const s of G.sections) for (const c of s.cards) for (const p of c.parts || []) for (const a of p.aliases || []) ALIAS[a] = p.id;

  // Создаёт элемент: el('p', {class: 'x'}, 'текст' | узел | массив)
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children === undefined ? [] : children)) {
      if (c === null || c === undefined) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }

  // Мини-разметка в текстах: `код`, **выделение** и ссылка на карточку [текст](#id). Всё остальное экранируется.
  function inline(text) {
    const esc = String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return esc
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(#([a-z0-9-]+)\)/g, (m, t, id) => `<a href="#${ALIAS[id] || id}">${t}</a>`);
  }
  const rich = (tag, text, cls) => el(tag, { class: cls, html: inline(text) });

  function seconds(t) {
    return String(t).split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  }
  function shortTime(t) {
    const s = seconds(t);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function timecodeLink(src) {
    const rec = G.recordings[src.rec];
    const url = new URL(rec.url);
    url.searchParams.set('t', seconds(src.t) + 's');
    const label = `${rec.short} · ${shortTime(src.t)}` + (src.label ? ` — ${src.label}` : '');
    return el('a', { class: 'timecode', href: url.href, target: '_blank', rel: 'noopener' }, label);
  }

  const slug = (s) => 'term-' + s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('is-on'), 1600);
  }
  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Не получилось скопировать'));
    } else {
      toast('Не получилось скопировать');
    }
  }

  const BLOCK_TITLES = { do: 'Пример', dont: 'Антипример', steps: 'Как делать', prompt: 'Промпт', note: 'Важно', qa: 'Вопрос из клуба' };

  function blockContent(b) {
    const out = [];
    if (b.text) for (const p of [].concat(b.text)) out.push(rich('p', p));
    if (b.items) out.push(el(b.type === 'steps' ? 'ol' : 'ul', {}, b.items.map((i) => rich('li', i))));
    return out;
  }
  function renderBlock(b) {
    const title = b.title || BLOCK_TITLES[b.type];
    const head = title ? el('h5', { class: 'block__title' }, title) : null;
    if (b.type === 'prompt') {
      const btn = el('button', { class: 'copy', type: 'button' }, 'Скопировать');
      btn.addEventListener('click', () => copy(b.text, 'Текст скопирован'));
      return el('div', { class: 'block block--prompt' }, [head, el('pre', {}, b.text), btn]);
    }
    if (b.type === 'qa') {
      return el('div', { class: 'block block--qa' }, [head, rich('p', b.q, 'q'), rich('p', b.a, 'a')]);
    }
    return el('div', { class: 'block block--' + b.type }, [head, ...blockContent(b)]);
  }
  // Пример и антипример, идущие подряд, встают в две колонки.
  function renderBlocks(blocks) {
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i], b = blocks[i + 1];
      const isPair = b && ((a.type === 'do' && b.type === 'dont') || (a.type === 'dont' && b.type === 'do'));
      if (isPair) { out.push(el('div', { class: 'pair' }, [renderBlock(a), renderBlock(b)])); i++; }
      else out.push(renderBlock(a));
    }
    return out;
  }

  function linkButton(id, label) {
    const btn = el('button', { class: 'card__link', type: 'button', title: 'Скопировать ссылку' }, label);
    btn.addEventListener('click', () => {
      history.replaceState(null, '', '#' + id);
      copy(location.href, 'Ссылка скопирована');
    });
    return btn;
  }

  function renderPart(p) {
    const terms = (p.terms || []).map((t) => el('a', { class: 'term-link', href: '#' + slug(t) }, t));
    return el('section', { class: 'part', id: p.id }, [
      el('div', { class: 'part__head' }, [el('h4', { class: 'part__title' }, p.title), linkButton(p.id, '#')]),
      p.lead ? rich('p', p.lead, 'part__lead') : null,
      p.blocks && p.blocks.length ? el('div', { class: 'part__body' }, renderBlocks(p.blocks)) : null,
      el('div', { class: 'part__foot' }, [
        ...(p.sources || []).map(timecodeLink),
        terms.length ? el('div', { class: 'part__terms' }, terms) : null,
      ]),
    ]);
  }

  function renderCard(card) {
    const parts = card.parts || [];
    return el('article', { class: 'card', id: card.id }, [
      el('div', { class: 'card__head' }, [el('h3', { class: 'card__title' }, card.title), linkButton(card.id, '# ссылка')]),
      card.summary ? rich('p', card.summary, 'card__summary') : null,
      ...[].concat(card.intro || []).map((t) => rich('p', t, 'card__intro')),
      parts.length > 1 ? el('ol', { class: 'card__toc' }, parts.map((p) => el('li', {}, el('a', { href: '#' + p.id }, p.title)))) : null,
      ...parts.map(renderPart),
    ]);
  }

  function render() {
    document.title = G.title;
    $('kicker').textContent = G.kicker;
    $('title').textContent = G.title;
    $('lead').textContent = G.lead;
    $('recs').append(...Object.values(G.recordings).filter((r) => r.listed !== false).map((r) =>
      el('li', {}, el('a', { href: r.url, target: '_blank', rel: 'noopener' }, `${r.title} · ${r.duration}`))));

    const allSections = [...G.sections, { id: 'glossary', title: 'Словарик', cards: [] }];
    $('chips').append(...allSections.map((s) => el('a', { class: 'chip', href: '#' + s.id, 'data-chip': s.id }, s.title)));

    $('toc').append(...G.sections.map((s) => el('div', { class: 'toc__group' }, [
      el('h3', {}, el('a', { href: '#' + s.id }, s.title)),
      el('ul', {}, s.cards.map((c) => el('li', {}, el('a', { href: '#' + c.id }, c.title)))),
    ])));

    $('sections').append(...G.sections.map((s) => el('section', { class: 'section', id: s.id, 'data-section': true }, [
      el('header', { class: 'section__head' }, [el('h2', {}, s.title), s.lead ? rich('p', s.lead) : null]),
      ...s.cards.map(renderCard),
    ])));

    $('glossary-body').append(...G.glossary.map((g) => el('div', { class: 'gloss__group' }, [
      el('h3', {}, g.group),
      el('dl', { class: 'gloss__list' }, g.terms.map((t) => el('div', { class: 'gloss__item', id: slug(t.term) }, [el('dt', {}, t.term), rich('dd', t.def)]))),
    ])));
  }

  // Подсвечивает в рубрикаторе раздел, который сейчас на экране.
  // Ряд кнопок прокручивается через scrollTo самого ряда: scrollIntoView здесь нельзя,
  // он обрывает прокрутку страницы к якорю и выкидывает в случайное место.
  function setupActiveChip() {
    const bar = $('chips');
    const chips = new Map([...bar.querySelectorAll('[data-chip]')].map((c) => [c.dataset.chip, c]));
    const sections = [...document.querySelectorAll('[data-section]')];
    let current = null;
    function update() {
      const line = $('topbar').offsetHeight + 40;
      let next = null;
      for (const s of sections) if (s.getBoundingClientRect().top <= line) next = s.id;
      if (next === current) return;
      current = next;
      for (const [id, chip] of chips) chip.classList.toggle('is-active', id === current);
      const chip = chips.get(current);
      if (chip) {
        const left = chip.offsetLeft - bar.offsetLeft, right = left + chip.offsetWidth;
        if (left < bar.scrollLeft || right > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: Math.max(0, left - 16) });
      }
    }
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }, { passive: true });
    update();
  }

  render();
  setupActiveChip();
  // Старые адреса объединённых подпунктов (aliases) ведут на новый подпункт.
  const aliases = {};
  for (const s of G.sections) for (const c of s.cards) for (const p of c.parts || []) for (const a of p.aliases || []) aliases[a] = p.id;
  function followAlias() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (aliases[id]) history.replaceState(null, '', '#' + aliases[id]);
  }
  followAlias();
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (aliases[id]) { followAlias(); document.getElementById(aliases[id]).scrollIntoView({ behavior: 'instant' }); }
  });
  // Якорь из адреса срабатывает до отрисовки, поэтому прокручиваем к нему ещё раз.
  if (location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'instant' });
  }
})();
