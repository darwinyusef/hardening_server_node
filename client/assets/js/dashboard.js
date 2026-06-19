const token  = sessionStorage.getItem('token');
const rol    = sessionStorage.getItem('rol');
const nombre = sessionStorage.getItem('nombre');

if (!token) {
  window.location.href = 'index.html';
}

/* Escapa texto para inserción segura en HTML (previene XSS) */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bienvenida').textContent = `¡Bienvenido, ${nombre}!`;

  const chip = document.getElementById('rol-texto');
  const claseRol = { admin: 'rol-admin', vendedor: 'rol-vendedor' }[rol] || 'rol-usuario';
  chip.innerHTML = `<span class="rol-chip ${claseRol}">${esc(rol)}</span>`;

  const contenido = document.getElementById('contenido-privado');

  if (rol === 'admin') {
    cargarUsuariosParaAdmin(contenido);
  } else if (rol === 'vendedor') {
    contenido.innerHTML = '<h3>Panel de Ventas</h3><p>Aquí verías tus pedidos y comisiones.</p>';
  } else {
    contenido.innerHTML = '<h3>Mi área</h3><p>Aquí verías tu perfil e historial.</p>';
  }
});

async function cargarUsuariosParaAdmin(contenido) {
  contenido.innerHTML = '<p>Cargando usuarios...</p>';

  try {
    const res = await fetch(`${API_URL}/users`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    const usuarios = await res.json();

    const filas = usuarios.map(u => `
      <tr>
        <td>${esc(u.email)}</td>
        <td>${esc(u.name)} ${esc(u.lastname)}</td>
        <td>${esc(u.rol)}</td>
        <td>
          <select class="rol-select" onchange="actualizarRol('${esc(u.id)}', this.value)">
            <option value="">Cambiar...</option>
            <option value="usuario">Usuario</option>
            <option value="vendedor">Vendedor</option>
            <option value="admin">Admin</option>
          </select>
        </td>
      </tr>`).join('');

    contenido.innerHTML = `
      <h3>Gestión de usuarios</h3>
      <table>
        <thead>
          <tr>
            <th>Correo</th><th>Nombre</th><th>Rol actual</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
  } catch {
    contenido.innerHTML = '<p>Error al cargar usuarios.</p>';
    Notify.error('No se pudo conectar con el servidor');
  }
}

async function actualizarRol(id, nuevoRol) {
  if (!nuevoRol) return;

  try {
    const res = await fetch(`${API_URL}/update-role`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ id, nuevoRol }),
    });

    const data = await res.json();
    if (res.ok) {
      Notify.success(data.message || 'Rol actualizado correctamente');
      setTimeout(() => cargarUsuariosParaAdmin(document.getElementById('contenido-privado')), 900);
    } else {
      Notify.error(data.message || 'No se pudo actualizar el rol');
    }
  } catch {
    Notify.error('Error de conexión al actualizar el rol');
  }
}

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}
