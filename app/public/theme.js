// Darstellung Hell / Dunkel / System. Standard ist "System".
// Wird im <head> geladen, damit die gewählte Darstellung ohne Aufblitzen greift.
(function () {
  var KEY = 'theme';
  var root = document.documentElement;

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(mode) {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    var buttons = document.querySelectorAll('.theme-switch button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].dataset.mode === mode ? 'true' : 'false');
    }
  }

  apply(read());

  document.addEventListener('DOMContentLoaded', function () {
    apply(read());
    var sw = document.querySelector('.theme-switch');
    if (!sw) return;
    sw.hidden = false;
    sw.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      var mode = btn.dataset.mode;
      try {
        if (mode === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, mode);
      } catch (err) {}
      apply(mode);
    });
  });
})();
