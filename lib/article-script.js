// ═══════════════════════════════════════════════════════════
//  ARTICLE PAGE SCRIPT — TOC, Scroll Spy, Theme, PDF,
//  Progress Bar, Bookmarks, Font Size, Back to Top,
//  Copy Section Link, Keyboard Nav, Mobile Drawer
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ── Helpers ────────────────────────────────────────────── */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  /* ── PWA: Inject manifest link (for articles not updated manually) ── */
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '../manifest.json';
    document.head.appendChild(manifestLink);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.content = '#0d1117';
    document.head.appendChild(themeMeta);
  }
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const capMeta = document.createElement('meta');
    capMeta.name = 'apple-mobile-web-app-capable';
    capMeta.content = 'yes';
    document.head.appendChild(capMeta);
  }

  /* ── Theme ────────────────────────────────────────────── */
  function applySavedTheme() {
    const t = localStorage.getItem('medlib-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    updateThemeIcons(t);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('medlib-theme', next);
    updateThemeIcons(next);
  }
  function updateThemeIcons(t) {
    $$('.theme-toggle-btn').forEach(b => { b.textContent = t === 'dark' ? '☀' : '☾'; });
  }
  window.toggleTheme = toggleTheme;
  applySavedTheme();

  /* ── Article Meta ─────────────────────────────────────── */
  let articleId = '';
  try { articleId = JSON.parse($('#article-meta').textContent).id || ''; } catch (e) {}

  /* ── Back to Library ──────────────────────────────────── */
  window.goHome = function () {
    if (document.referrer && new URL(document.referrer).pathname.endsWith('index.html')) {
      history.back();
    } else {
      window.location.href = '../index.html';
    }
  };

  /* ═══ READING PROGRESS BAR ═════════════════════════════ */
  const progressBar = document.querySelector('.reading-progress');
  const contentEl = document.querySelector('.article-content');

  function updateProgress() {
    if (!contentEl || !progressBar) return;
    const scrollTop = contentEl.scrollTop;
    const scrollHeight = contentEl.scrollHeight - contentEl.clientHeight;
    const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progressBar.style.width = pct + '%';
  }

  /* ═══ BACK TO TOP ══════════════════════════════════════ */
  const backToTop = document.querySelector('.back-to-top');
  function updateBackToTop() {
    if (!contentEl || !backToTop) return;
    backToTop.classList.toggle('visible', contentEl.scrollTop > 400);
  }
  if (backToTop) {
    backToTop.addEventListener('click', () => {
      contentEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ═══ FONT SIZE CONTROLS ═══════════════════════════════ */
  const fontBtns = $$('.font-btn');
  let currentScale = parseFloat(localStorage.getItem('medlib-fontscale') || '1');

  function applyFontScale(scale) {
    currentScale = Math.max(0.8, Math.min(1.3, scale));
    document.documentElement.style.setProperty('--font-scale', currentScale);
    localStorage.setItem('medlib-fontscale', currentScale);
    fontBtns.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.scale) === currentScale);
    });
  }

  fontBtns.forEach(b => {
    b.addEventListener('click', () => applyFontScale(parseFloat(b.dataset.scale)));
  });
  applyFontScale(currentScale);

  /* ═══ BOOKMARKS ════════════════════════════════════════ */
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('medlib-bookmarks') || '[]'); } catch (e) { return []; }
  }
  function isBookmarked() {
    return getBookmarks().includes(articleId);
  }
  function toggleBookmark() {
    let bm = getBookmarks();
    if (bm.includes(articleId)) {
      bm = bm.filter(id => id !== articleId);
    } else {
      bm.push(articleId);
    }
    localStorage.setItem('medlib-bookmarks', JSON.stringify(bm));
    updateBookmarkBtn();
  }
  function updateBookmarkBtn() {
    const btns = $$('.bookmark-btn');
    const bm = isBookmarked();
    btns.forEach(b => {
      b.classList.toggle('bookmarked', bm);
      b.title = bm ? 'Remove bookmark' : 'Bookmark this article';
    });
  }
  window.toggleBookmark = toggleBookmark;
  updateBookmarkBtn();

  /* ═══ RECENTLY VIEWED ══════════════════════════════════ */
  function trackRecent() {
    if (!articleId) return;
    let recent;
    try { recent = JSON.parse(localStorage.getItem('medlib-recent') || '[]'); } catch (e) { recent = []; }
    recent = recent.filter(id => id !== articleId);
    recent.unshift(articleId);
    recent = recent.slice(0, 20);
    localStorage.setItem('medlib-recent', JSON.stringify(recent));
  }
  trackRecent();

  /* ═══ COPY SECTION LINK ════════════════════════════════ */
  function showToast(msg) {
    let toast = $('.copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'copy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function copySectionLink(sectionId) {
    const url = window.location.pathname + window.location.search + '#' + sectionId;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Section link copied!');
    }).catch(() => {
      showToast('Link copied!');
    });
  }
  window.copySectionLink = copySectionLink;

  /* ═══ BUILD TOC ════════════════════════════════════════ */
  const sections = $$('.article-section');
  const tocList = $('#toc-list');
  if (tocList && sections.length) {
    sections.forEach((sec, i) => {
      const h2 = sec.querySelector('.article-h2');
      if (!h2) return;
      const item = document.createElement('div');
      item.className = 'toc-item' + (i === 0 ? ' active' : '');
      item.textContent = h2.textContent;
      item.dataset.target = sec.id;
      item.addEventListener('click', () => {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeMobileToc();
      });
      tocList.appendChild(item);
    });
  }

  /* ═══ SCROLL SPY + PROGRESS ════════════════════════════ */
  const tocItems = $$('.toc-item');
  if (contentEl && sections.length) {
    let scrollTicking = false;
    contentEl.addEventListener('scroll', () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          updateScrollSpy();
          updateProgress();
          updateBackToTop();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    });
  }

  function updateScrollSpy() {
    if (!contentEl) return;
    let currentId = '';
    sections.forEach(sec => {
      if (contentEl.scrollTop >= sec.offsetTop - contentEl.offsetTop - 100) {
        currentId = sec.id;
      }
    });
    if (currentId) {
      tocItems.forEach(item => {
        const isActive = item.dataset.target === currentId;
        item.classList.toggle('active', isActive);
        if (isActive && window.innerWidth <= 768) {
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      });
    }
  }

  /* ═══ MOBILE TOC DRAWER ════════════════════════════════ */
  const tocSidebar = $('.toc-sidebar');
  const tocOverlay = $('.toc-overlay');
  const tocMobileToggle = $('.toc-mobile-toggle');
  const tocHeading = $('.toc-heading');

  function openMobileToc() {
    if (tocSidebar) tocSidebar.classList.add('open');
    if (tocOverlay) tocOverlay.classList.add('open');
  }
  function closeMobileToc() {
    if (tocSidebar) tocSidebar.classList.remove('open');
    if (tocOverlay) tocOverlay.classList.remove('open');
  }
  if (tocMobileToggle) tocMobileToggle.addEventListener('click', () => {
    const isOpen = tocSidebar && tocSidebar.classList.contains('open');
    isOpen ? closeMobileToc() : openMobileToc();
  });
  if (tocOverlay) tocOverlay.addEventListener('click', closeMobileToc);
  if (tocHeading && window.innerWidth <= 768) {
    tocHeading.addEventListener('click', closeMobileToc);
  }

  /* ═══ KEYBOARD NAVIGATION ══════════════════════════════ */
  document.addEventListener('keydown', (e) => {
    // Don't capture if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const activeItem = $('.toc-item.active');
      const items = $$('.toc-item');
      if (!activeItem || !items.length) return;
      const idx = items.indexOf(activeItem);
      let next;
      if (e.key === 'ArrowDown') next = items[Math.min(idx + 1, items.length - 1)];
      else next = items[Math.max(idx - 1, 0)];
      if (next) {
        const targetId = next.dataset.target;
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Escape closes mobile TOC
    if (e.key === 'Escape') closeMobileToc();

    // 't' toggles theme
    if (e.key === 't' || e.key === 'T') toggleTheme();

    // 'b' toggles bookmark
    if (e.key === 'b' || e.key === 'B') toggleBookmark();
  });

  /* ═══ SECTION ENTRANCE ANIMATIONS ══════════════════════ */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = '0s';
          observer.unobserve(entry.target);
        }
      });
    }, { root: contentEl, threshold: 0.1 });
    sections.forEach(sec => observer.observe(sec));
  }

  /* ═══ SERVICE WORKER REGISTRATION ═════════════════════ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('../sw.js').then(reg => {
        console.log('[MedLibrary] Service worker registered:', reg.scope);
      }).catch(err => {
        console.warn('[MedLibrary] SW registration failed:', err);
      });
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[MedLibrary] SW updated:', event.data.version);
      }
    });
  }

  /* ═══ PDF EXPORT ═══════════════════════════════════════ */
  window.exportPDF = function () {
    const target = $('#pdf-target');
    if (!target) return;
    if (typeof html2pdf !== 'undefined') {
      html2pdf().set({
        margin: [12, 14, 12, 14],
        filename: (articleId || 'article') + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(target).save();
    } else {
      window.print();
    }
  };
})();
