(function () {
    const savedTheme = localStorage.getItem('yoonho_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = savedTheme || (prefersDark ? 'dark' : 'light');
  })();
