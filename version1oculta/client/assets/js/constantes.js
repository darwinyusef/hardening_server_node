const API_URL = `${window.location.origin}/api`;

/* Alterna visibilidad de un campo contraseña */
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const esTexto = input.type === 'text';
  input.type = esTexto ? 'password' : 'text';
  btn.textContent = esTexto ? '👁' : '🙈';
  btn.setAttribute('aria-label', esTexto ? 'Mostrar contraseña' : 'Ocultar contraseña');
}

/* Muestra un mensaje inline en el div #mensaje */
function mostrarMensaje(texto, tipo) {
  const el = document.getElementById('mensaje');
  if (!el) return;
  el.textContent = texto;
  el.className = `mensaje visible mensaje-${tipo}`;
}
