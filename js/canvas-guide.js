(() => {
  let autoOpen = new URLSearchParams(location.search).get('canvasGuide') === '1';
  let cleanup = () => {};
  const steps = [
    { label: 'Open Calendar', title: 'Open your Canvas calendar', text: 'In Canvas, click Calendar in the left sidebar.' },
    { label: 'Calendar Feed', title: 'Click “Calendar Feed”', text: 'At the bottom of the right sidebar, click Calendar Feed.' },
    { label: 'Copy link', title: 'Copy the link', text: 'Copy the whole link, then paste it into the field above. Keep it private.' }
  ];

  window.mountCanvasGuide = content => {
    cleanup();
    const input = content.querySelector('#cw-canvas-url');
    if (!input) return;
    const field = input.closest('.field') || input.parentElement;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cg-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'canvas-help');
    trigger.innerHTML = '<span class="cg-q" aria-hidden="true">?</span><span>How do I find my link?</span><span class="cg-chev" aria-hidden="true">›</span>';

    const panel = document.createElement('section');
    panel.id = 'canvas-help';
    panel.className = 'cg-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'How to find your Canvas calendar link');
    panel.innerHTML = `
      <img class="cg-image" width="800" height="520" alt="" decoding="async">
      <div class="cg-copy" aria-live="polite">${steps.map((s, i) => `<div class="cg-text" data-i="${i}"><h4>${s.title}</h4><p>${s.text}</p></div>`).join('')}</div>
      <div class="cg-nav"><button type="button" class="btn btn-outline cg-back">Back</button>
        <div class="cg-dots" role="group" aria-label="Steps">${steps.map((s, i) => `<button type="button" class="cg-dot" data-i="${i}" aria-label="Step ${i + 1} of ${steps.length}: ${s.label}"></button>`).join('')}</div>
        <button type="button" class="btn btn-primary cg-next"></button></div>`;

    field.append(trigger, panel);

    const image = panel.querySelector('.cg-image');
    const texts = [...panel.querySelectorAll('.cg-text')];
    const back = panel.querySelector('.cg-back');
    const next = panel.querySelector('.cg-next');
    const tabs = [...panel.querySelectorAll('.cg-dot')];
    let index = 0;
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const preload = () => steps.forEach((_, i) => { new Image().src = `images/tutorial/step-${i + 1}.webp`; });

    function draw(animate = true) {
      const s = steps[index];
      image.src = `images/tutorial/step-${index + 1}.webp`;
      image.alt = `Canvas screenshot: ${s.label}`;
      if (animate && !calm()) image.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      texts.forEach((t, i) => { t.classList.toggle('is-on', i === index); t.setAttribute('aria-hidden', i === index ? 'false' : 'true'); });
      back.disabled = index === 0;
      next.textContent = index === steps.length - 1 ? 'Done' : 'Next';
      tabs.forEach((t, i) => {
        t.classList.toggle('is-active', i === index);
        if (i === index) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
      });
    }
    // Open/close is a plain fade in place, so nothing "grows". Set SLIDE = true to animate the height instead.
    const SLIDE = false;
    let anim = null;
    const glide = (opening, done) => {
      if (anim) anim.cancel();
      if (calm()) { done?.(); return; }
      let full = { opacity: 1 }, none = { opacity: 0 };
      if (SLIDE) {
        const cs = getComputedStyle(panel);
        full = { height: panel.offsetHeight + 'px', opacity: 1, marginTop: cs.marginTop, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom };
        none = { height: '0px', opacity: 0, marginTop: '0px', paddingTop: '0px', paddingBottom: '0px' };
        panel.style.overflow = 'hidden';
      }
      anim = panel.animate(opening ? [none, full] : [full, none], { duration: opening ? 240 : 200, easing: 'ease-out' });
      anim.onfinish = () => { panel.style.overflow = ''; anim = null; done?.(); };
      anim.oncancel = () => { panel.style.overflow = ''; };
    };
    function close(focus = true, after) {
      if (panel.hidden) return;
      trigger.setAttribute('aria-expanded', 'false');
      glide(false, () => {
        panel.hidden = true;
        if (focus) trigger.focus({ preventScroll: true });
        after?.();
      });
    }
    function open() {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      preload();
      draw(false);
      glide(true, () => panel.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }));
    }
    function go(i) { index = Math.max(0, Math.min(steps.length - 1, i)); draw(); }

    trigger.onclick = () => (panel.hidden ? open() : close(false));
    tabs.forEach(t => { t.onclick = () => go(+t.dataset.i); });
    back.onclick = () => go(index - 1);
    next.onclick = () => {
      if (index < steps.length - 1) go(index + 1);
      else close(false, () => { index = 0; input.focus({ preventScroll: true }); });
    };
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });

    preload();
    cleanup = () => { panel.remove(); trigger.remove(); };

    if (autoOpen) {
      autoOpen = false;
      const url = new URL(location.href);
      url.searchParams.delete('canvasGuide');
      history.replaceState(null, '', url);
      input.scrollIntoView({ block: 'center' });
      requestAnimationFrame(open);
    }
  };
})();
