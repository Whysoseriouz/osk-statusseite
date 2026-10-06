// Kleine Komfortfunktionen im Admin-Bereich (alles funktioniert auch ohne JavaScript).

// Felder je nach Meldungsart ein-/ausblenden
for (const form of document.querySelectorAll('form')) {
  const radios = form.querySelectorAll('input[name=type]');
  if (!radios.length) continue;
  const apply = () => {
    const type = form.querySelector('input[name=type]:checked')?.value;
    for (const el of form.querySelectorAll('[data-for]')) {
      const show = el.dataset.for.split(' ').includes(type);
      el.hidden = !show;
      for (const input of el.querySelectorAll('select, input, textarea')) input.disabled = !show;
    }
  };
  radios.forEach((r) => r.addEventListener('change', apply));
  apply();
}

// Sicherheitsabfrage vor Löschaktionen
for (const form of document.querySelectorAll('form[data-confirm]')) {
  form.addEventListener('submit', (e) => {
    if (!confirm(form.dataset.confirm)) e.preventDefault();
  });
}
