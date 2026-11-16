(() => {
  const button = document.querySelector('.menu-button');
  const menu = document.querySelector('#mobile-nav');
  if (!button || !menu) return;
  function close() {menu.hidden = true;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Open navigation');}
  // Keep the menu directly beneath the header while the announcement banner is in view.
  const header = document.querySelector('.header');
  function place() {if (header && !menu.hidden) menu.style.top = Math.max(0, header.getBoundingClientRect().bottom) + 'px';}
  window.addEventListener('scroll', place, {passive:true});
  window.addEventListener('resize', place, {passive:true});
  button.addEventListener('click', () => {const open = menu.hidden;menu.hidden = !open;place();button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click',close));
  document.addEventListener('keydown',event => {if(event.key === 'Escape' && !menu.hidden){close();button.focus();}});
  window.matchMedia('(min-width: 901px)').addEventListener('change',event => {if(event.matches)close();});
})();
