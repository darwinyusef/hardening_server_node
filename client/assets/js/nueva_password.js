const params = new URLSearchParams(window.location.search);
const token  = params.get('token');

/* Si no hay token en la URL, ocultar el formulario y mostrar error */
if (!token) {
  document.getElementById('contenidoForm').style.display = 'none';
  mostrarMensaje('El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.', 'err');
}

document.getElementById('formNuevaPassword').addEventListener('submit', async function (e) {
  e.preventDefault();

  const password  = this.password.value;
  const confirmar = this.confirmar.value;
  const btn       = document.getElementById('btnNueva');

  if (password !== confirmar) {
    mostrarMensaje('Las contraseñas no coinciden.', 'err');
    return;
  }
  if (password.length < 8) {
    mostrarMensaje('La contraseña debe tener al menos 8 caracteres.', 'err');
    return;
  }

  btn.disabled = true;
  btn.classList.add('cargando');
  btn.textContent = 'Guardando...';

  try {
    const res = await fetch(`${API_URL}/nueva-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, password }),
    });

    const data = await res.json();
    mostrarMensaje(data.message, res.ok ? 'ok' : 'err');

    if (res.ok) {
      document.getElementById('contenidoForm').style.display = 'none';
      Notify.success('Contraseña actualizada. Redirigiendo al login...');
      setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    }
  } catch {
    mostrarMensaje('No se pudo conectar con el servidor. Intenta de nuevo.', 'err');
  } finally {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Guardar contraseña';
  }
});
