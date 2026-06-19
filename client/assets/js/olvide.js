document.getElementById('formOlvide').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email = this.email.value.trim();
  const btn   = document.getElementById('btnOlvide');

  btn.disabled = true;
  btn.classList.add('cargando');
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch(`${API_URL}/recovery`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });

    const data = await res.json();
    mostrarMensaje(data.message, res.ok ? 'ok' : 'err');
    if (res.ok) this.reset();
  } catch {
    mostrarMensaje('No se pudo conectar con el servidor. Intenta de nuevo.', 'err');
  } finally {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Enviar enlace';
  }
});
