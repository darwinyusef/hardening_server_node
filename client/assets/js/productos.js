'use strict';

// ── Auth ──────────────────────────────────────────────────────
const token = sessionStorage.getItem('token');
const rol   = sessionStorage.getItem('rol');

if (!token) {
    window.location.href = '/client/index.html';
    throw new Error('Sin sesión');
}

// ── Estado local ──────────────────────────────────────────────
let categoriasCache = [];

// ── Helpers ───────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// ── SQL preview client-side (espeja buildSelectQuery del backend) ──
function buildQueryPreview(filters) {
    const { busqueda, categoria, precioMin, precioMax, incluirInactivos } = filters;
    const conds = [];
    const vals  = [];
    let idx = 1;

    const kw  = s => `<span class="q-kw">${s}</span>`;
    const tbl = s => `<span class="q-tbl">${s}</span>`;
    const col = s => `<span class="q-col">${s}</span>`;
    const str = s => `<span class="q-str">'${esc(s)}'</span>`;
    const num = s => `<span class="q-num">${s}</span>`;
    const ph  = i => `<span class="q-num">$${i}</span>`;

    if (!(incluirInactivos && rol === 'admin')) {
        conds.push(`${col('activo')} = ${num('true')}`);
    }
    if (categoria) {
        conds.push(`${col('categoria')} = ${ph(idx++)}`);
        vals.push(str(categoria));
    }
    if (busqueda) {
        conds.push(`(${col('nombre')} ${kw('ILIKE')} ${ph(idx)} ${kw('OR')} ${col('descripcion')} ${kw('ILIKE')} ${ph(idx)})`);
        vals.push(str(`%${busqueda}%`));
        idx++;
    }
    if (precioMin && !isNaN(precioMin)) {
        conds.push(`${col('precio')} >= ${ph(idx++)}`);
        vals.push(num(precioMin));
    }
    if (precioMax && !isNaN(precioMax)) {
        conds.push(`${col('precio')} <= ${ph(idx++)}`);
        vals.push(num(precioMax));
    }

    const selectLine = `${kw('SELECT')} ${col('id')}, ${col('nombre')}, ${col('descripcion')}, ${col('precio')}, ${col('stock')}, ${col('categoria')}, ${col('activo')}, ${col('created_at')}`;
    const fromLine   = `${kw('FROM')} ${tbl('products')}`;
    let   whereLine  = '';
    if (conds.length) {
        whereLine = `${kw('WHERE')} ${conds[0]}`;
        for (let i = 1; i < conds.length; i++) whereLine += `\n  ${kw('AND')} ${conds[i]}`;
    }
    const orderLine  = `${kw('ORDER BY')} ${col('created_at')} ${kw('DESC')}`;

    const paramsLine = vals.length
        ? `\n<span class="q-comment">-- params: [${vals.join(', ')}]</span>`
        : '';

    return [selectLine, fromLine, whereLine, orderLine].filter(Boolean).join('\n') + paramsLine;
}

function actualizarQueryPreview() {
    const f = leerFiltros();
    document.getElementById('queryPreview').innerHTML = buildQueryPreview(f);
}

// ── Leer filtros del formulario ───────────────────────────────
function leerFiltros() {
    return {
        busqueda:        document.getElementById('f-busqueda').value.trim(),
        categoria:       document.getElementById('f-categoria').value,
        precioMin:       document.getElementById('f-precioMin').value,
        precioMax:       document.getElementById('f-precioMax').value,
        incluirInactivos: document.getElementById('f-inactivos').checked,
    };
}

// ── Cargar categorías en el select ────────────────────────────
async function cargarCategorias() {
    try {
        const r = await fetch(`${API_URL}/productos/categorias`, { headers: authHeaders() });
        if (!r.ok) return;
        const data = await r.json();
        categoriasCache = data.categorias || [];

        const sel = document.getElementById('f-categoria');
        const dl  = document.getElementById('categorias-list');
        categoriasCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            sel.appendChild(opt.cloneNode(true));
            dl.appendChild(opt);
        });
    } catch { /* silencioso — categorías son opcionales */ }
}

// ── Cargar productos ──────────────────────────────────────────
async function cargarProductos(filtros) {
    const loading   = document.getElementById('loadingMsg');
    const tabla     = document.getElementById('tablaProductos');
    const empty     = document.getElementById('emptyState');
    const totalChip = document.getElementById('totalChip');
    const tbody     = document.getElementById('tbodyProductos');

    loading.style.display = 'block';
    tabla.style.display   = 'none';
    empty.style.display   = 'none';

    const params = new URLSearchParams();
    if (filtros.busqueda)                       params.set('busqueda',         filtros.busqueda);
    if (filtros.categoria)                      params.set('categoria',        filtros.categoria);
    if (filtros.precioMin)                      params.set('precioMin',        filtros.precioMin);
    if (filtros.precioMax)                      params.set('precioMax',        filtros.precioMax);
    if (filtros.incluirInactivos && rol==='admin') params.set('incluirInactivos','true');

    try {
        const r = await fetch(`${API_URL}/productos?${params}`, { headers: authHeaders() });
        if (r.status === 401) { sessionStorage.clear(); window.location.href = '/client/index.html'; return; }
        if (!r.ok) { Notify.error('Error al cargar productos'); return; }

        const data = await r.json();

        // Mostrar la query real que devuelve el backend
        if (data.queryGenerada) {
            document.getElementById('queryPreview').innerHTML = colorearSQL(data.queryGenerada);
        }

        totalChip.textContent = `${data.total} resultado${data.total !== 1 ? 's' : ''}`;
        loading.style.display = 'none';

        if (!data.total) {
            empty.style.display = 'flex';
            return;
        }

        tbody.innerHTML = data.productos.map(p => filaProducto(p)).join('');
        tabla.style.display = 'table';

    } catch (e) {
        loading.style.display = 'none';
        Notify.error('No se pudo conectar con el servidor');
    }
}

// ── Colorear SQL devuelto por el backend ──────────────────────
function colorearSQL(sql) {
    const keywords = ['SELECT','FROM','WHERE','AND','OR','ORDER','BY','DESC','ASC','ILIKE','LIKE','NOT','IS','NULL','TRUE','FALSE','INSERT','UPDATE','DELETE','SET'];
    let out = esc(sql);
    keywords.forEach(k => {
        out = out.replace(new RegExp(`\\b${k}\\b`, 'g'), `<span class="q-kw">${k}</span>`);
    });
    // strings
    out = out.replace(/'([^']*)'/g, (_, v) => `<span class="q-str">'${v}'</span>`);
    // placeholders $1 $2...
    out = out.replace(/\$(\d+)/g, (_, n) => `<span class="q-num">$${n}</span>`);
    // column names (words between SELECT/FROM/WHERE and operators)
    out = out.replace(/\b(id|nombre|descripcion|precio|stock|categoria|activo|created_at|updated_at|created_by)\b/g,
        s => `<span class="q-col">${s}</span>`);
    // table name
    out = out.replace(/\bproducts\b/g, `<span class="q-tbl">products</span>`);
    return out;
}

// ── Renderizar fila de tabla ──────────────────────────────────
function filaProducto(p) {
    const esAdmin = rol === 'admin';
    const esVend  = rol === 'vendedor';

    const catClass = {
        'Cursos': 'cat-cursos', 'Talleres': 'cat-talleres',
        'Materiales': 'cat-materiales', 'Certificaciones': 'cat-certificaciones'
    }[p.categoria] || 'cat-otros';

    const stockClass = p.stock === 0 ? 'stock-zero' : p.stock < 5 ? 'stock-low' : 'stock-ok';

    const estadoBadge = p.activo
        ? '<span class="cat-badge cat-cursos">Activo</span>'
        : '<span class="cat-badge cat-otros">Inactivo</span>';

    let acciones = '';
    if (esAdmin) {
        acciones = `
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn-accion btn-editar" onclick="abrirModalEditar('${esc(p.id)}')">Editar</button>
              <button class="btn-accion btn-borrar" onclick="confirmarEliminar('${esc(p.id)}','${esc(p.nombre)}')">${p.activo ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>`;
    } else if (esVend) {
        acciones = '<td></td>';
    }

    return `
      <tr>
        <td>
          <strong>${esc(p.nombre)}</strong>
          ${p.descripcion ? `<br><small style="color:var(--muted)">${esc(p.descripcion)}</small>` : ''}
        </td>
        <td><span class="cat-badge ${catClass}">${esc(p.categoria || '—')}</span></td>
        <td>${fmt(p.precio)}</td>
        <td><span class="stock-badge ${stockClass}">${p.stock}</span></td>
        <td>${estadoBadge}</td>
        ${acciones}
      </tr>`;
}

// ── Modal: crear ──────────────────────────────────────────────
function abrirModal() {
    document.getElementById('modalTitulo').textContent = 'Nuevo producto';
    document.getElementById('m-id').value        = '';
    document.getElementById('m-nombre').value    = '';
    document.getElementById('m-descripcion').value = '';
    document.getElementById('m-precio').value    = '';
    document.getElementById('m-stock').value     = '0';
    document.getElementById('m-categoria').value = '';
    document.getElementById('m-activo').checked  = true;
    document.getElementById('m-activo-wrap').style.display = 'none';
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('m-nombre').focus();
}

// ── Modal: editar ─────────────────────────────────────────────
async function abrirModalEditar(id) {
    try {
        const r = await fetch(`${API_URL}/productos/${id}`, { headers: authHeaders() });
        if (!r.ok) { Notify.error('No se pudo cargar el producto'); return; }
        const p = await r.json();

        document.getElementById('modalTitulo').textContent = 'Editar producto';
        document.getElementById('m-id').value         = p.id;
        document.getElementById('m-nombre').value     = p.nombre;
        document.getElementById('m-descripcion').value = p.descripcion || '';
        document.getElementById('m-precio').value     = p.precio;
        document.getElementById('m-stock').value      = p.stock;
        document.getElementById('m-categoria').value  = p.categoria || '';
        document.getElementById('m-activo').checked   = p.activo;
        document.getElementById('m-activo-wrap').style.display = 'block';
        document.getElementById('modal').classList.remove('hidden');
        document.getElementById('m-nombre').focus();
    } catch {
        Notify.error('Error de conexión');
    }
}

// ── Modal: cerrar ─────────────────────────────────────────────
function cerrarModal() {
    document.getElementById('modal').classList.add('hidden');
}

// ── Confirmar desactivar / activar ────────────────────────────
async function confirmarEliminar(id, nombre) {
    const r = await fetch(`${API_URL}/productos/${id}`, { headers: authHeaders() });
    if (!r.ok) { Notify.error('Error al obtener producto'); return; }
    const p = await r.json();
    const accion = p.activo ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Deseas ${accion} el producto "${nombre}"?`)) return;
    softDelete(id, !p.activo);
}

async function softDelete(id, nuevoEstado) {
    try {
        const r = await fetch(`${API_URL}/productos/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (!r.ok) { Notify.error('Error al cambiar estado del producto'); return; }
        Notify.success('Estado del producto actualizado');
        buscar();
    } catch {
        Notify.error('Error de conexión');
    }
}

// ── Guardar (crear o editar) ──────────────────────────────────
document.getElementById('formProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('m-id').value;

    const nombre = document.getElementById('m-nombre').value.trim();
    const precio = parseFloat(document.getElementById('m-precio').value);

    if (!nombre)        { Notify.warning('El nombre es obligatorio');      return; }
    if (isNaN(precio) || precio < 0) { Notify.warning('El precio debe ser >= 0'); return; }

    const body = {
        nombre,
        descripcion: document.getElementById('m-descripcion').value.trim() || null,
        precio,
        stock:     parseInt(document.getElementById('m-stock').value || '0'),
        categoria: document.getElementById('m-categoria').value.trim() || null,
    };
    if (id) body.activo = document.getElementById('m-activo').checked;

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const url    = id ? `${API_URL}/productos/${id}` : `${API_URL}/productos`;
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
        const data = await r.json();

        if (!r.ok) {
            Notify.error(data.message || 'Error al guardar');
            return;
        }

        Notify.success(id ? 'Producto actualizado' : 'Producto creado');
        cerrarModal();
        buscar();
    } catch {
        Notify.error('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
});

// ── Buscar (re-ejecuta fetch + preview) ──────────────────────
function buscar() {
    const f = leerFiltros();
    actualizarQueryPreview();   // preview optimista antes de que responda el servidor
    cargarProductos(f);
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
    // Mostrar botón crear para admin/vendedor
    if (['admin', 'vendedor'].includes(rol)) {
        document.getElementById('btnCrear').classList.remove('hidden');
    }

    // Mostrar columna acciones para admin/vendedor
    if (['admin', 'vendedor'].includes(rol)) {
        document.getElementById('col-acciones').style.display = 'table-cell';
    }

    // Mostrar filtro de inactivos solo para admin
    if (rol === 'admin') {
        document.getElementById('filtro-inactivos').style.display = 'block';
    }

    // Actualizar preview en tiempo real al escribir
    ['f-busqueda','f-precioMin','f-precioMax'].forEach(id => {
        document.getElementById(id).addEventListener('input', actualizarQueryPreview);
    });
    document.getElementById('f-categoria').addEventListener('change', actualizarQueryPreview);
    document.getElementById('f-inactivos').addEventListener('change', actualizarQueryPreview);

    // Cerrar modal con Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') cerrarModal();
    });
    // Cerrar modal al hacer click fuera
    document.getElementById('modal').addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) cerrarModal();
    });

    // Submit del formulario de filtros
    document.getElementById('filtrosForm').addEventListener('submit', e => {
        e.preventDefault();
        buscar();
    });

    // Carga inicial
    cargarCategorias().then(() => {
        actualizarQueryPreview();
        cargarProductos(leerFiltros());
    });
})();
