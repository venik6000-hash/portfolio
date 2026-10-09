import { profile, projectsScreen, projects } from './data/content.js';

const root = document.documentElement;
const body = document.body;
const $ = (selector, scope = document) => scope.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phoneLayout = matchMedia('(max-width: 760px)');

const ABOUT_LABEL = 'обо мне';
// About typing rhythm, in ms: per character, before the first line, between lines, between paragraphs.
const TYPING = { char: 28, start: 140, line: 80, paragraph: 340 };
const WAVE_MS = 980;
const BURST_MS = { wide: 5050, phone: 3260 };
const PILL_HUES = [340, 232, 198, 130, 28, 268];
// Every card picture is rendered by tools/mockup.mjs at this size; the attributes reserve the 16:9 box before it loads.
const MEDIA_SIZE = 'width="2240" height="1260"';

const SPARK_ICON = `
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19.5 12.5 35 20.5l-15.5 8-15.5-8z"/>
    <path d="m4 28.5 15.5 8 15.5-8"/>
    <path d="m4 36.5 15.5 8 15.5-8"/>
    <path d="M38.5 2.5c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z" fill="currentColor" stroke-width="1.6"/>
  </svg>`;

const CONTACT_ICONS = {
  telegram: '<path d="M14 2.5 1.8 7.3l4 1.5 1.5 4.2 2.2-2.6 3 2.1zM5.8 8.8 14 2.5"/>',
  email: '<rect x="2" y="3.5" width="12" height="9" rx="1.8"/><path d="m2.6 5 5.4 4 5.4-4"/>',
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const tween = (duration, update) =>
  new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      update(progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

const linkAttributes = (href) => (href.startsWith('http') ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : ` href="${escapeHtml(href)}"`);

/* ---------- Typography ---------- */

const NBSP = ' ';
const WORD_JOINER = '⁠';

// Line-break hygiene for Russian copy, applied at render so the data stays plain text.
function typograph(text) {
  return (
    text
      // «PHP-файл», «3D-глобус», «какой-то»: the short half of a hyphenated word does not wrap on its own
      .replace(/(?<![\p{L}\p{N}])([\p{L}\p{N}]{1,4})-(?=[\p{L}\p{N}])/gu, `$1-${WORD_JOINER}`)
      .replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}]{1,3}(?![\p{L}\p{N}]))/gu, `-${WORD_JOINER}`)
      // prepositions, conjunctions, particles and short numbers stay with the word after them (abbreviations like «ИИ» do not)
      .replace(/(?<![\p{L}\p{N}⁠.-])(?!\p{Lu}{2})([\p{L}\p{N}]{1,2}|[Дд]ля|[Пп]од|[Нн]ад|[Пп]ри|[Бб]ез|[Пп]ро|[Ии]ли|[Оо]бо) (?=\S)/gu, `$1${NBSP}`)
      // a dash or an emoji never starts a line
      .replace(/ (?=[—–]|\p{Extended_Pictographic})/gu, NBSP)
      // the last word never sits alone on its line
      .replace(/ (?=\S+$)/, NBSP)
  );
}

/* ---------- Rendering ---------- */

function renderHero() {
  $('[data-name]').textContent = profile.name;
  $('[data-avatar]').innerHTML = ['light', 'dark']
    .map((theme) => {
      const alt = theme === 'light' ? escapeHtml(profile.avatar.alt) : '';
      return `<img class="hero__avatar hero__avatar--${theme}" src="${profile.avatar[theme]}" alt="${alt}" width="122" height="122" decoding="async">`;
    })
    .join('');

  const title = $('[data-headline]');
  const plainText = profile.headline.map((line) => line.filter((part) => typeof part === 'string').join(' ')).join(' ');
  const word = (text, delay) => `<span class="hero__word" style="--delay:${delay}ms" aria-hidden="true">${escapeHtml(text)}</span>`;

  title.setAttribute('aria-label', plainText);
  title.innerHTML = profile.headline
    .map((line, lineIndex) => {
      const hasSpark = line.some((part) => part.icon);
      // The first line steps in slowly, the second one catches up at a quicker pace.
      const delay = (index) => (lineIndex ? 380 + 100 * index : 80 + 140 * index);
      const words = line.flatMap((part) => (part.icon || hasSpark ? [part] : part.split(' ')));
      let wordIndex = 0;
      const parts = words.map((part) =>
        part.icon ? `<button class="hero__spark" type="button" data-spark aria-label="Показать навыки">${SPARK_ICON}</button>` : word(part, delay(wordIndex++)),
      );
      return `<span class="hero__line${hasSpark ? ' hero__line--with-spark' : ''}">${parts.join('')}</span>`;
    })
    .join('');
}

function renderNavigation() {
  const tiles = [
    { id: projectsScreen.dock.id, label: projectsScreen.dock.label, name: projectsScreen.dock.label, href: '#projects', wave: projectsScreen.dock.wave },
    ...projects.map((project) => ({
      id: project.slug,
      label: project.dockLabel,
      name: `Проект: ${project.title}`,
      href: `#projects/${project.slug}`,
      wave: project.icon.wave,
      slug: project.slug,
    })),
  ];
  const contacts = profile.contacts.map((contact) => ({ id: contact.id, label: contact.label, name: contact.label, href: contact.href }));

  const attributes = (tile) => {
    const label = ` aria-label="${escapeHtml(tile.name)}"`;
    if (!tile.wave) return linkAttributes(tile.href) + label;
    const project = tile.slug ? ` data-project="${tile.slug}"` : '';
    return ` href="${tile.href}" data-view-toggle="projects" data-wave="${tile.wave}"${project}${label}`;
  };
  const image = (tile, size) => `<img src="assets/icons/${tile.id}.svg" alt="" width="${size}" height="${size}" draggable="false">`;

  const dockItem = (tile) => `
    <li class="dock__item">
      <a class="dock__link"${attributes(tile)}>
        <span class="dock__tile">${image(tile, 54)}</span>
        <span class="dock__label" aria-hidden="true">${escapeHtml(tile.label)}</span>
      </a>
    </li>`;
  $('[data-dock]').innerHTML =
    tiles.map(dockItem).join('') +
    '<li class="dock__divider" aria-hidden="true"><span class="dock__divider-line"></span></li>' +
    contacts.map(dockItem).join('');

  $('[data-apps]').innerHTML = [...tiles, ...contacts]
    .map(
      (tile) => `
    <a class="apps__item"${attributes(tile)}>
      <span class="apps__icon">${image(tile, 56)}</span>
      <span class="apps__label" aria-hidden="true">${escapeHtml(tile.label)}</span>
    </a>`,
    )
    .join('');
}

function renderProjects() {
  const link = ({ label, href }) => `<a${linkAttributes(href)}>${escapeHtml(label)}</a>`;
  const paragraph = (item) => {
    const content = typeof item === 'string' ? escapeHtml(typograph(item)) : escapeHtml(typograph(item.text)) + item.links.map(link).join(', ');
    return `<p class="project-card__description">${content}</p>`;
  };
  const card = (project) => {
    const title = typograph(project.title);
    const tone = project.media.tone ? ` style="--media-tone:${escapeHtml(project.media.tone)}"` : '';
    return `
    <li>
      <article class="project-card" data-project-card="${project.slug}">
        <div class="project-card__copy">
          <h2 class="project-card__title">${project.url ? link({ label: title, href: project.url }) : escapeHtml(title)}</h2>
          ${project.description.map(paragraph).join('')}
        </div>
        <div class="project-card__media"${tone}>
          <img class="project-card__image" src="${escapeHtml(project.media.src)}" alt="${escapeHtml(project.media.alt)}" ${MEDIA_SIZE} loading="lazy" decoding="async">
        </div>
      </article>
    </li>`;
  };

  $('[data-intro]').textContent = typograph(projectsScreen.intro);
  $('[data-note]').textContent = typograph(projectsScreen.note);
  cardList.innerHTML = projects.map(card).join('');
  for (const label of document.querySelectorAll('[data-back-label]')) {
    label.textContent = projectsScreen.back;
    label.parentElement.setAttribute('aria-label', `${projectsScreen.back} на главную`);
  }

  for (const image of cardList.querySelectorAll('.project-card__image')) {
    const reveal = () => image.parentElement.classList.add('is-loaded');
    // A picture that failed leaves its description in the placeholder instead of the browser's broken-image mark.
    const fail = () => {
      const fallback = document.createElement('p');
      fallback.className = 'project-card__fallback';
      fallback.textContent = image.alt;
      mediaPreloader.unobserve(image);
      image.replaceWith(fallback);
    };
    if (image.complete) (image.naturalWidth ? reveal : fail)();
    else {
      image.addEventListener('load', reveal, { once: true });
      image.addEventListener('error', fail, { once: true });
      mediaPreloader.observe(image);
    }
  }
}

function renderAboutCopy() {
  aboutCopy.innerHTML = [profile.about.greeting, ...profile.about.paragraphs].map((text) => `<p>${escapeHtml(typograph(text))}</p>`).join('');
}

function renderAbout() {
  renderAboutCopy();
  aboutCta.innerHTML =
    `<span>${escapeHtml(profile.about.cta)}</span>` +
    profile.contacts
      .map(
        (contact) => `
    <a class="about__badge"${linkAttributes(contact.href)}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CONTACT_ICONS[contact.id] ?? ''}</svg>
      ${escapeHtml(contact.label)}
    </a>`,
      )
      .join('');
}

/* ---------- Theme ---------- */

const themeButton = $('[data-theme-toggle]');
const themeColorMeta = $('meta[name="theme-color"]');

function syncThemeControls() {
  const dark = body.dataset.theme === 'dark';
  themeButton.setAttribute('aria-pressed', String(dark));
  // The projects screen stays light in either theme, and so does the browser chrome above it.
  themeColorMeta.content = dark && currentView !== 'projects' ? '#000000' : '#f4f4f3';
}

function toggleTheme() {
  body.dataset.theme = body.dataset.theme === 'dark' ? 'light' : 'dark';
  syncThemeControls();
  try {
    localStorage.setItem('theme', body.dataset.theme);
  } catch {
    /* storage unavailable: the choice lives until reload */
  }
}

/* ---------- About: line-by-line typing ---------- */

const aboutCopy = $('[data-about-copy]');
const aboutCta = $('[data-about-cta]');
let typingRun = 0;
let typing = false;
let typingWidth = 0;

function splitIntoLines(paragraph) {
  const words = paragraph.textContent.split(' ');
  paragraph.innerHTML = words.map((text) => `<span>${escapeHtml(text)}</span>`).join(' ');
  const lines = [];
  let top = null;
  for (const span of paragraph.children) {
    if (span.offsetTop !== top) {
      top = span.offsetTop;
      lines.push([]);
    }
    lines.at(-1).push(span.textContent);
  }
  paragraph.innerHTML = lines.map((line) => `<span class="about__line">${escapeHtml(line.join(' '))}</span>`).join('');
  return [...paragraph.children];
}

function typeLine(line) {
  const chars = [...line.textContent].length;
  return line.animate(
    { clipPath: ['inset(-0.3em 100% -0.3em 0)', 'inset(-0.3em 0% -0.3em 0)'] },
    { duration: Math.max(160, chars * TYPING.char), easing: `steps(${chars})`, fill: 'forwards' },
  ).finished;
}

function finishTyping() {
  typingRun += 1;
  typing = false;
  renderAboutCopy();
  aboutCopy.style.visibility = '';
  aboutCta.classList.add('is-visible');
}

function resetTyping() {
  finishTyping();
  aboutCta.classList.remove('is-visible');
}

async function startTyping() {
  resetTyping();
  if (reducedMotion.matches) return finishTyping();

  const run = typingRun;
  typing = true;
  typingWidth = innerWidth;
  // Lines are measured, so wait for the real font; keep the copy hidden meanwhile.
  aboutCopy.style.visibility = 'hidden';
  await document.fonts.ready;
  if (run !== typingRun) return;

  const lines = [...aboutCopy.children].flatMap(splitIntoLines);
  aboutCopy.style.visibility = '';
  for (const line of lines) {
    const pause = line === lines[0] ? TYPING.start : line.previousElementSibling ? TYPING.line : TYPING.paragraph;
    await wait(pause);
    if (run !== typingRun) return;
    await typeLine(line);
    if (run !== typingRun) return;
  }
  finishTyping();
}

/* ---------- Views and routing ---------- */

const screens = {
  home: $('[data-screen="home"]'),
  projects: $('[data-screen="projects"]'),
  about: $('[data-screen="about"]'),
};
const scroller = screens.projects;
const dock = $('.dock');
const header = $('.page-header');
const aboutLabel = $('[data-about-label]');
const topBackButton = $('.back-button--top');
const cardList = $('[data-cards]');
const homeUrl = location.pathname + location.search;

let currentView = 'home';
// Where the latest navigation request leads; currentView catches up once its transition has played.
let destination = 'home';
let busy = false;
let queued = null;
let lastWave = projectsScreen.dock.wave;
// The tile the visitor left through: focus returns to it together with them.
let lastTileHref = '#projects';
let shownSlug = null;
// Where the projects screen was when the visitor left it, for the browser's Back and Forward.
let leftProjects = null;

// Native lazy loading may hold a picture back until its card is already on screen inside a nested scroller; start a screen earlier.
const mediaPreloader = new IntersectionObserver(
  (entries) => entries.filter((entry) => entry.isIntersecting).forEach((entry) => loadMedia(entry.target)),
  { root: scroller, rootMargin: '100% 0px' },
);

const hashFor = ({ view, slug }) => (view === 'home' ? '' : `#${view}${slug ? `/${slug}` : ''}`);

// Reads the address and rewrites what the router had to guess at («#Projects», an unknown project) into what it actually shows.
function readRoute() {
  let path = location.hash.slice(1);
  try {
    path = decodeURIComponent(path);
  } catch {
    /* a stray % in a hand-typed address: read it as it is */
  }
  const [view, slug] = path.toLowerCase().split('/');
  let route = { view: 'home', slug: null };
  if (view === 'projects') route = { view, slug: projects.find((project) => project.slug.toLowerCase() === slug)?.slug ?? null };
  if (view === 'about') route = { view, slug: null };

  const hash = hashFor(route);
  if (location.hash !== hash) history.replaceState(history.state, '', hash || homeUrl);
  return route;
}

function cardFor(slug) {
  return slug ? $(`[data-project-card="${slug}"]`, cardList) : null;
}

// Starts a picture right away instead of waiting for it to scroll into view.
function loadMedia(image) {
  image.loading = 'eager';
  mediaPreloader.unobserve(image);
}

function applyView(view, { slug = null, restore = false } = {}) {
  const previous = currentView;
  if (previous === 'projects' && view !== 'projects') leftProjects = { slug: shownSlug, top: scroller.scrollTop };
  currentView = view;

  for (const [name, screen] of Object.entries(screens)) {
    const active = name === view;
    screen.inert = !active;
    if (name === 'home') continue;
    if (active) screen.hidden = false;
    // Leaves the layout only after its fade-out, and only if nobody came back in the meantime.
    else if (!screen.hidden) setTimeout(() => (screen.hidden = currentView !== name), 400);
  }
  dock.inert = view !== 'home';
  header.inert = view === 'projects';

  void screens[view].offsetWidth; // commit display before the opacity transition starts
  body.dataset.view = view;
  aboutLabel.textContent = view === 'about' ? projectsScreen.back : ABOUT_LABEL;
  syncThemeControls();

  if (view === 'projects') {
    if (restore && leftProjects?.slug === slug) parkScroll(leftProjects.top);
    else scrollToProject(slug);
  }
  if (view === 'about') startTyping();
  else if (previous === 'about') resetTyping();
}

function applyViewInstantly(view, options) {
  body.classList.add('is-swapping');
  applyView(view, options);
  void body.offsetWidth;
  body.classList.remove('is-swapping');
}

// Focus follows the visitor: into the projects screen (the scroller itself, so the keyboard scrolls it and Tab starts
// from the back button), then back onto the tile they left through, or its twin if the dock and the grid swapped meanwhile.
function moveFocus(previous, view) {
  if (view === 'projects') scroller.focus({ preventScroll: true });
  else if (previous === 'projects' && view === 'home') {
    const tiles = [...document.querySelectorAll('[data-view-toggle="projects"]')];
    tiles.find((tile) => tile.getAttribute('href') === lastTileHref && tile.offsetParent)?.focus({ preventScroll: true });
  }
}

/* ---------- Projects screen: scrolling ---------- */

// Cards park this far from the top: just under the floating back button.
const backClearance = () => topBackButton.offsetTop + topBackButton.offsetHeight + 14;

let lastScrollTop = 0;
let upwardTravel = 0;
let scrolledAway = false;
let listEnded = false;
// Target of our own scroll while it is still on its way.
let parking = null;
// The card under the button line, its measurements and how deep into it the line is: tells a reflow
// from a real scroll and lets a resize or a rotation keep the place.
let anchor = null;

const syncBackButton = () => topBackButton.classList.toggle('is-away', scrolledAway || listEnded);

function parkScroll(top, smooth = false) {
  const target = clamp(top, 0, scroller.scrollHeight - scroller.clientHeight);
  parking = Math.abs(target - scroller.scrollTop) < 0.5 ? null : target;
  scrolledAway = false;
  syncBackButton();
  scroller.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'instant' });
}

function scrollToProject(slug, smooth = false) {
  const card = cardFor(slug);
  shownSlug = slug;
  parkScroll(card ? card.offsetTop - backClearance() : 0, smooth);
}

scroller.addEventListener(
  'scroll',
  () => {
    const top = scroller.scrollTop;
    const previous = lastScrollTop;
    // Late fonts can move the page under the reader: the browser compensates with a scroll nobody made.
    const reflowed = anchor && (anchor.card.offsetTop !== anchor.top || anchor.card.offsetHeight !== anchor.height);
    const line = top + backClearance();
    const card = top > 0 && [...cardList.children].find((item) => item.offsetTop + item.offsetHeight > line);
    lastScrollTop = top;
    anchor = card ? { card, top: card.offsetTop, height: card.offsetHeight, depth: (line - card.offsetTop) / card.offsetHeight } : null;

    if (parking !== null) {
      // Our own scroll: the button waits at the destination. A step away from it means the reader took over.
      const left = Math.abs(top - parking);
      if (left < 2 || left > Math.abs(previous - parking)) parking = null;
    } else if (top < 8) {
      scrolledAway = false;
    } else if (reflowed) {
      return;
    } else if (top > previous) {
      scrolledAway = true;
      upwardTravel = 0;
    } else if ((upwardTravel += previous - top) > 16) {
      scrolledAway = false;
    }
    syncBackButton();
  },
  { passive: true },
);

// At the end of the list the inline button takes over, so the floating one does not sit on the last card.
new IntersectionObserver(
  ([entry]) => {
    listEnded = entry.isIntersecting;
    syncBackButton();
  },
  { root: scroller },
).observe($('.projects__footer .back-button'));

/* ---------- Wave transition ---------- */

const layer = $('.page-transition');
const waveSvg = $('.page-transition__svg');
const wavePath = $('.page-transition__wave');
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - 4 * (1 - t) ** 3);
const setLayerOpacity = (value) => (layer.style.opacity = value);

// progress 0 = wave below the screen, 1 = screen covered. The top edge arches most (a quarter of the screen) halfway up
// and flattens towards both ends.
function drawWave(progress) {
  const { innerWidth: width, innerHeight: height } = window;
  const rise = easeInOutCubic(progress);
  const edge = height * (1 - rise);
  const arch = height * 0.5 * Math.min(rise, 1 - rise);
  // A quadratic curve peaks halfway between its ends and its control point, hence the doubled arch.
  wavePath.setAttribute('d', `M0 ${height}V${edge}Q${width / 2} ${edge - 2 * arch} ${width} ${edge}V${height}Z`);
}

// The layer blurs the page from its first frame; the wave itself starts below the screen or covering it.
function prepareWave(color, progress) {
  waveSvg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  wavePath.setAttribute('fill', color);
  drawWave(progress);
  layer.classList.add('is-active');
  setLayerOpacity(1);
}

async function waveToProjects(route) {
  // The wave hides the screen for a while: enough of a head start for the picture the visitor lands on.
  const image = $('.project-card__image', cardFor(route.slug) ?? cardList);
  if (image) loadMedia(image);
  prepareWave(lastWave, 0);
  await tween(WAVE_MS, drawWave);
  applyViewInstantly('projects', route);
  await wait(180);
  await tween(420, (t) => setLayerOpacity(1 - t));
}

async function waveFromProjects(route) {
  prepareWave(lastWave, 1);
  applyViewInstantly(route.view, route);
  await tween(WAVE_MS, (t) => drawWave(1 - t));
}

async function transitionTo({ view, slug = null, wave = lastWave, restore = false }) {
  const route = { view, slug, wave, restore };
  destination = view;
  if (busy) {
    queued = route;
    return;
  }
  if (view === currentView) {
    if (view === 'projects') scrollToProject(slug, !reducedMotion.matches);
    return;
  }

  const previous = currentView;
  busy = true;
  lastWave = wave;
  try {
    const usesWave = !reducedMotion.matches && (view === 'projects' || previous === 'projects');
    if (!usesWave) {
      applyView(view, route);
      await wait(360);
    } else if (view === 'projects') {
      await waveToProjects(route);
    } else {
      await waveFromProjects(route);
    }
  } finally {
    layer.classList.remove('is-active');
    setLayerOpacity('');
    busy = false;
  }

  if (queued) {
    const next = queued;
    queued = null;
    transitionTo(next);
  } else {
    moveFocus(previous, view);
  }
}

function openView(view, slug, wave) {
  if (view === destination) return;
  history.pushState({ inApp: true }, '', hashFor({ view, slug }));
  transitionTo({ view, slug, wave });
}

// Works mid-transition too: the request is queued and plays as soon as the current wave is done.
function goHome() {
  if (destination === 'home') return;
  destination = 'home';
  // Entered from the home screen: step back in history so the browser Back button does not replay the visit.
  if (history.state?.inApp) return history.back();
  history.replaceState(null, '', homeUrl);
  transitionTo({ view: 'home' });
}

/* ---------- Skill burst ---------- */

// Pills fly out from the headline icon, breathe (0.56 → 0.96 → 0.77 of their size) and fade while growing back. Phones pack them in rows
// between the name and the icon grid; wider screens spread them in a ring around the headline.
function burstSkills(origin) {
  const host = $('[data-burst]');
  if (host.childElementCount) return;

  const hostBox = host.getBoundingClientRect();
  const boxOf = (target) => {
    const box = (typeof target === 'string' ? $(target) : target).getBoundingClientRect();
    return new DOMRect(box.x - hostBox.x, box.y - hostBox.y, box.width, box.height);
  };
  const avatar = boxOf('.hero__avatar-stack');
  const originBox = boxOf(origin);
  const centerX = hostBox.width / 2;
  const startY = originBox.y + originBox.height / 2;
  const compact = phoneLayout.matches;
  const spread = Math.min(hostBox.width * 0.393, 640);
  const area = compact
    ? { left: 12, right: hostBox.width - 12, top: boxOf('.hero__name').bottom + 6, bottom: boxOf('.apps').top - 12 }
    : {
        left: centerX - spread,
        right: centerX + spread,
        top: avatar.y + avatar.height * 0.55,
        bottom: Math.min(boxOf('.dock__glass').y - 24, boxOf('.hero__title').bottom + 90),
      };
  const centerY = (area.top + area.bottom) / 2;

  const pills = profile.skills.map((skill, index) => {
    const pill = document.createElement('span');
    pill.className = 'skill-pill';
    pill.textContent = skill;
    pill.style.setProperty('--hue', PILL_HUES[index % PILL_HUES.length]);
    host.append(pill);
    return pill;
  });
  const sizes = pills.map((pill) => ({ width: pill.offsetWidth, height: pill.offsetHeight }));
  const jitter = (range) => (Math.random() - 0.5) * range;

  const ringSpots = () =>
    sizes.map(({ width, height }, index) => {
      const angle = ((index + 0.5) / sizes.length) * Math.PI * 2 - Math.PI / 2 + jitter(0.12);
      const reach = index % 2 ? 0.86 : 1;
      return {
        x: centerX + Math.cos(angle) * (spread - width / 2) * reach,
        y: centerY + Math.sin(angle) * ((area.bottom - area.top - height) / 2) * reach,
        tilt: Math.cos(angle) * 12 + jitter(6),
      };
    });

  const rowSpots = () => {
    const gap = 6;
    const fit = 0.9;
    const rows = [[]];
    let rowWidth = 0;
    sizes.forEach(({ width }, index) => {
      if (rows.at(-1).length && rowWidth + width * fit > area.right - area.left) {
        rows.push([]);
        rowWidth = 0;
      }
      rows.at(-1).push(index);
      rowWidth += width * fit + gap;
    });
    const spots = [];
    rows.forEach((row, rowIndex) => {
      const total = row.reduce((sum, index) => sum + sizes[index].width * fit + gap, -gap);
      let x = centerX - total / 2;
      for (const index of row) {
        const width = sizes[index].width * fit;
        spots[index] = {
          x: x + width / 2,
          y: area.top + ((rowIndex + 0.5) * (area.bottom - area.top)) / rows.length + jitter(4),
          tilt: (index % 2 ? 1 : -1) * (2 + Math.random() * 3),
        };
        x += width + gap;
      }
    });
    return spots;
  };

  const peak = 0.96;
  (compact ? rowSpots() : ringSpots()).forEach((spot, index) => {
    const { width, height } = sizes[index];
    const { tilt } = spot;
    const turn = (Math.abs(tilt) * Math.PI) / 180;
    // Half of the tilted pill's bounding box at its largest: what must stay inside the area.
    const reachX = ((width * Math.cos(turn) + height * Math.sin(turn)) * peak) / 2;
    const reachY = ((width * Math.sin(turn) + height * Math.cos(turn)) * peak) / 2;
    let x = clamp(spot.x, area.left + reachX, area.right - reachX);
    const y = clamp(spot.y, area.top + reachY, area.bottom - reachY);
    // Pills at the top of the ring step aside from the avatar.
    const keepOut = avatar.width / 2 + 10 + reachX;
    if (y - reachY < avatar.bottom + 8 && Math.abs(x - centerX) < keepOut) x = centerX + (x < centerX ? -keepOut : keepOut);

    const at = (left, top, scale, rotation = tilt) =>
      `translate(${left - width / 2}px, ${top - height / 2}px) rotate(${rotation}deg) scale(${scale})`;
    const keyframes = reducedMotion.matches
      ? [
          { transform: at(x, y, 0.86), opacity: 0 },
          { transform: at(x, y, 0.86), opacity: 1, offset: 0.1 },
          { transform: at(x, y, 0.86), opacity: 1, offset: 0.9 },
          { transform: at(x, y, 0.86), opacity: 0 },
        ]
      : [
          { transform: at(centerX, startY, 0.56, 0), opacity: 0 },
          { transform: at(centerX + (x - centerX) * 0.2, startY + (y - startY) * 0.2, 0.59, tilt * 0.2), opacity: 0.13, offset: 0.05 },
          { transform: at(centerX + (x - centerX) * 0.82, startY + (y - startY) * 0.82, 0.74), opacity: 0.85, offset: 0.2, easing: 'ease-out' },
          { transform: at(x, y, peak), opacity: 1, offset: 0.4, easing: 'ease-in-out' },
          { transform: at(x, y + 3, 0.77), opacity: 1, offset: 0.8 },
          { transform: at(x, y + 4, 0.82), opacity: 1, offset: 0.86, easing: 'ease-out' },
          { transform: at(x, y + 6, 0.9), opacity: 0 },
        ];
    pills[index].animate(keyframes, { duration: compact ? BURST_MS.phone : BURST_MS.wide, delay: index * 16, fill: 'backwards' }).onfinish = () => pills[index].remove();
  });
}

/* ---------- Cursor dot ---------- */

function initCursor() {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const dot = $('.cursor-dot');
  const sync = () => {
    if (finePointer.matches) root.dataset.cursor = 'dot';
    else delete root.dataset.cursor;
  };

  sync();
  finePointer.addEventListener('change', sync);
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    dot.classList.add('is-visible');
  });
  root.addEventListener('mouseleave', () => dot.classList.remove('is-visible'));
}

/* ---------- Wiring ---------- */

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-theme-toggle]')) return toggleTheme();

  const spark = event.target.closest('[data-spark]');
  if (spark) return burstSkills(spark);

  const toggle = event.target.closest('[data-view-toggle]');
  if (!toggle || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const view = toggle.dataset.viewToggle;
  // The «обо мне» button doubles as the way back while its screen is open.
  if (view === 'home' || (view === 'about' && destination === 'about')) return goHome();
  if (view === 'projects') lastTileHref = toggle.getAttribute('href');
  openView(view, toggle.dataset.project, toggle.dataset.wave);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') goHome();
});

window.addEventListener('popstate', () => transitionTo({ ...readRoute(), restore: true }));

aboutCopy.addEventListener('click', () => {
  if (typing) finishTyping();
});

window.addEventListener('resize', () => {
  // Typed lines are frozen at the width they were measured for.
  if (typing && innerWidth !== typingWidth) finishTyping();
  if (currentView === 'projects' && anchor) {
    // The same card, as deep into it as before the layout changed, goes back under the button line.
    scroller.scrollTop = anchor.card.offsetTop + anchor.depth * anchor.card.offsetHeight - backClearance();
    lastScrollTop = scroller.scrollTop;
  }
});

renderHero();
renderNavigation();
renderProjects();
renderAbout();
initCursor();

const initial = readRoute();
destination = initial.view;
applyView(initial.view, initial);
if (initial.slug) document.fonts.ready.then(() => currentView === 'projects' && shownSlug === initial.slug && scrollToProject(initial.slug));
