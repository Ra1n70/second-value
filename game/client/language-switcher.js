(() => {
  'use strict';
  const locale = window.SecondValueLocale;
  const select = document.getElementById('game-language-select');
  if (!locale || !select) return;
  select.value = locale.language;
  select.addEventListener('change', () => locale.setLanguage(select.value));
  window.addEventListener('secondvalue:languagechange', () => {
    select.value = locale.language;
  });
})();
