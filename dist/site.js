(() => {
  const button = document.querySelector('.menu-button');
  const menu = document.querySelector('#mobile-nav');
  if (!button || !menu) return;
  function close() {menu.hidden = true;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Open navigation');}
  button.addEventListener('click', () => {const open = menu.hidden;menu.hidden = !open;button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click',close));
  document.addEventListener('keydown',event => {if(event.key === 'Escape' && !menu.hidden){close();button.focus();}});
  window.matchMedia('(min-width: 901px)').addEventListener('change',event => {if(event.matches)close();});
})();
