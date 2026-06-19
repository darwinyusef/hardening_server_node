/* Medidor de fuerza de contraseña */
document.getElementById('password')?.addEventListener('input', function () {
  const v   = this.value;
  const bar = document.getElementById('fuerzaBar');
  const txt = document.getElementById('fuerzaTxt');
  if (!bar) return;

  let puntos = 0;
  if (v.length >= 8)               puntos++;
  if (/[A-Z]/.test(v))             puntos++;
  if (/[0-9]/.test(v))             puntos++;
  if (/[^A-Za-z0-9]/.test(v))      puntos++;

  const niveles = [
    { w: '0%',   color: 'transparent', label: '' },
    { w: '25%',  color: '#ef4444',     label: 'Débil' },
    { w: '50%',  color: '#f97316',     label: 'Regular' },
    { w: '75%',  color: '#eab308',     label: 'Buena' },
    { w: '100%', color: '#22c55e',     label: 'Fuerte' },
  ];
  const n = niveles[v.length === 0 ? 0 : puntos];
  bar.style.width           = n.w;
  bar.style.backgroundColor = n.color;
  if (txt) txt.textContent  = n.label;
});

document.getElementById('formRegistro').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = e.target;
  const btn  = document.getElementById('btnRegistro');

  btn.disabled = true;
  btn.classList.add('cargando');
  btn.textContent = 'Creando cuenta...';

  const data = {
    nombre:        form.nombre.value.trim(),
    lastname:      form.lastname.value.trim(),
    email:         form.email.value.trim(),
    password:      form.password.value,
    document:      form.document.value.trim(),
    type_document: form.type_document.value,
    phone:         form.phone.value.trim(),
    address:       form.address.value.trim(),
    age:           form.age.value || null,
    departamento:  form.departamento.value.trim(),
    ciudad:        form.ciudad.value.trim(),
    sexo:          form.sexo.value,
    born:          form.born.value || null,
  };

  try {
    const res = await fetch(`${API_URL}/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });

    const result = await res.json();
    mostrarMensaje(result.message, res.ok ? 'ok' : 'err');

    if (res.ok) {
      Notify.success('Cuenta creada. Revisa tu correo para verificarla');
      form.reset();
      const bar = document.getElementById('fuerzaBar');
      if (bar) bar.style.width = '0';
    }
  } catch {
    mostrarMensaje('No se pudo conectar con el servidor. Intenta de nuevo.', 'err');
  } finally {
    btn.disabled = false;
    btn.classList.remove('cargando');
    btn.textContent = 'Crear cuenta';
  }
});
