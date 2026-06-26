document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('btnLogin');

  btn.disabled = true;
  btn.classList.add('cargando');
  btn.textContent = 'Entrando...';

  try {
    const res = await fetch(`${API_URL}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (data.token) {
      sessionStorage.setItem('token',  data.token);
      sessionStorage.setItem('rol',    data.rol);
      sessionStorage.setItem('nombre', data.nombre);
      Notify.success(`Bienvenido, ${data.nombre}`);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
    } else {
      mostrarMensaje(data.message || 'Credenciales incorrectas.', 'err');
      btn.disabled = false;
      btn.classList.remove('cargando');
      btn.textContent = 'Entrar';
    }
  } catch {
    mostrarMensaje('No se pudo conectar con el servidor. Intenta de nuevo.', 'err');
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Entrar';
  }
});
