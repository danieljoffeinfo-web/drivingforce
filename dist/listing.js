// Make pages: the cards are rendered by the server; this only adds the photo carousel controls.
(() => {
  const grid = document.querySelector('#vehicle-grid');
  if (grid && window.DFCard) DFCard.wireCarousels(grid);
})();
