/* =====================================================================
   HEMEROTECA DE LA I.E. SAN JOSÉ DE PUNO — Lógica de la aplicación
   HTML + CSS + JavaScript puro. Sin frameworks, sin backend, sin CDN.

   Almacenamiento:
     · localStorage  -> metadatos (libros, tareas, anuncios, fotos, museos)
     · IndexedDB     -> archivos binarios (Word, PDF, imágenes) hasta 1 GB
   ===================================================================== */

'use strict';

/* =====================================================================
   1. CONFIGURACIÓN
   ===================================================================== */

/* Credenciales: solo se guardan hashes SHA-256 en hexadecimal.
   El texto plano de la contraseña no existe en el código del frontend. */
var USUARIO_OBJETIVO = 'admin';
var HASH_USUARIO_OBJETIVO = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
var HASH_PASSWORD_OBJETIVO = 'a5f6391a182488530de2944e0047842d05f1ad151594f253082bc58819255ed6';
/* Respaldo solo para navegadores sin crypto.subtle (contexto no seguro) */
var HASH_RESPALDO_USUARIO = 'b7d9cdce219b13c9';
var HASH_RESPALDO_PASSWORD = 'b587d51ef2e1308c';
var ROLES = Object.freeze({ DOCENTE: 'docente', ESTUDIANTE: 'estudiante' });

/** Seguridad del login: bloqueo temporal tras varios intentos fallidos */
var LIMITE_INTENTOS = 5;
var SEGUNDOS_BLOQUEO = 60;
var BLOQUEO = { activo: false, hasta: 0 };
var intentosFallidos = 0;

/** Límite máximo por archivo: 1 GB = 1073741824 bytes */
var LIMITE_POR_DEFECTO = 1073741824;

/** A partir de este tamaño el .docx no se convierte (solo se descarga) */
var PREVIEW_DOCX_MAX = 90 * 1024 * 1024;

/** Techo de seguridad para la copia de seguridad completa (JSON en memoria) */
var LIMITE_BACKUP_MB = 300;

var EXT_LIBROS = ['doc', 'docx', 'pdf'];
var EXT_TAREAS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'doc', 'docx', 'pdf'];
var EXT_FOTOS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
var EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];

var CLAVES = {
  libros: 'hemeroteca_libros',
  tareas: 'hemeroteca_tareas',
  avisos: 'hemeroteca_avisos',
  fotos: 'hemeroteca_fotos',
  museos: 'hemeroteca_museos',
  sesion: 'hemeroteca_sesion',
  token: 'hemeroteca_token',
  bloqueo: 'hemeroteca_bloqueo',
  config: 'hemeroteca_config',
  perfil: 'hemeroteca_perfil',
  tema: 'hemeroteca_tema'
};

var SECCIONES = {
  inicio:  { titulo: 'Inicio',            sub: 'Resumen de la hemeroteca' },
  libros:  { titulo: 'Libros',            sub: 'Material de lectura del curso' },
  tareas:  { titulo: 'Tareas',            sub: 'Actividades y entregas' },
  anuncios: { titulo: 'Anuncios',         sub: 'Comunicados del docente' },
  fotos:   { titulo: 'Fotos',             sub: 'Galería de imágenes' },
  museos:  { titulo: 'Museos Virtuales',  sub: 'Recorridos y enlaces culturales' },
  ajustes: { titulo: 'Ajustes',           sub: 'Configuración y respaldo' }
};

/* =====================================================================
   2. UTILIDADES GENERALES
   ===================================================================== */

function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

/** Escapa texto para insertarlo con innerHTML (evita inyecciones) */
function esc(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitiza texto libre: quita caracteres de control y etiquetas HTML. */
function sanitizar(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/** Hash SHA-256 en hexadecimal usando la Web Crypto API (crypto.subtle). */
function hashSha256(texto) {
  var cadena = String(texto === null || texto === undefined ? '' : texto);
  if (!window.crypto || !window.crypto.subtle || typeof window.TextEncoder === 'undefined') {
    return Promise.reject(new Error('crypto.subtle no está disponible'));
  }
  return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(cadena)).then(function (buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return hex;
  });
}

function hashRespaldo(cadena) {
  var h1 = 0xdeadbeef ^ cadena.length;
  var h2 = 0x41c6ce57 ^ cadena.length;
  for (var i = 0; i < cadena.length; i++) {
    var ch = cadena.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ('00000000' + (h2 >>> 0).toString(16)).slice(-8) + ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
}

/** Compara las credenciales escritas contra los hashes guardados. */
function credencialesCorrectas(usuario, password) {
  function porRespaldo() {
    return hashRespaldo(usuario) === HASH_RESPALDO_USUARIO &&
           hashRespaldo(password) === HASH_RESPALDO_PASSWORD;
  }
  try {
    if (window.crypto && window.crypto.subtle && typeof window.TextEncoder !== 'undefined') {
      return Promise.all([hashSha256(usuario), hashSha256(password)]).then(function (hashes) {
        return hashes[0] === HASH_USUARIO_OBJETIVO && hashes[1] === HASH_PASSWORD_OBJETIVO;
      }).catch(function () {
        return porRespaldo();
      });
    }
  } catch (e) { /* usa el respaldo */ }
  return Promise.resolve(porRespaldo());
}

/* --- Token de sesión simple en sessionStorage --- */
function tokenSesionValido() {
  try { return !!sessionStorage.getItem(CLAVES.token); } catch (e) { return false; }
}

function crearTokenSesion() {
  var token = uid();
  try { sessionStorage.setItem(CLAVES.token, token); } catch (e) { /* sin sessionStorage */ }
  return token;
}

function cerrarSesion() {
  try { sessionStorage.removeItem(CLAVES.token); } catch (e) { /* sin sessionStorage */ }
  try { localStorage.removeItem(CLAVES.sesion); } catch (e) { /* sin localStorage */ }
  estado.sesion = null;
}

/** Persistencia del bloqueo para que no se evada recargando la página */
function cargarEstadoBloqueo() {
  try {
    var bruto = localStorage.getItem(CLAVES.bloqueo);
    if (!bruto) return;
    var datos = JSON.parse(bruto);
    if (!datos) return;
    intentosFallidos = Math.max(0, Number(datos.intentos) || 0);
    var hasta = Number(datos.hasta) || 0;
    if (hasta > Date.now()) {
      BLOQUEO.activo = true;
      BLOQUEO.hasta = hasta;
    } else if (hasta) {
      // El bloqueo ya venció: se limpia al cargar
      BLOQUEO.activo = false;
      BLOQUEO.hasta = 0;
      intentosFallidos = 0;
      guardarEstadoBloqueo();
    } else {
      BLOQUEO.activo = false;
      BLOQUEO.hasta = 0;
    }
  } catch (e) { /* sin datos de bloqueo */ }
}

function guardarEstadoBloqueo() {
  try {
    localStorage.setItem(CLAVES.bloqueo, JSON.stringify({ intentos: intentosFallidos, hasta: BLOQUEO.hasta || 0 }));
  } catch (e) { /* sin almacenamiento */ }
}

function uid() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  } catch (e) { /* ignorado */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function ahora() { return new Date().toISOString(); }

function extension(nombre) {
  var limpio = String(nombre || '').split('?')[0].split('#')[0];
  var punto = limpio.lastIndexOf('.');
  return punto === -1 ? '' : limpio.slice(punto + 1).toLowerCase();
}

function tipoArchivo(nombre) {
  var ext = extension(nombre);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx') return 'DOCX';
  if (ext === 'doc') return 'DOC';
  if (EXT_IMAGEN.indexOf(ext) !== -1) return 'imagen';
  return 'archivo';
}

function mimeDe(nombre) {
  var ext = extension(nombre);
  var mapa = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif'
  };
  return mapa[ext] || 'application/octet-stream';
}

function iconoArchivo(nombre) {
  var t = tipoArchivo(nombre);
  if (t === 'PDF') return '📕';
  if (t === 'DOCX' || t === 'DOC') return '📘';
  if (t === 'imagen') return '🖼️';
  return '📄';
}

function formatearBytes(bytes) {
  var b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  var unidades = ['KB', 'MB', 'GB', 'TB'];
  var i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < unidades.length - 1);
  return (b < 10 ? b.toFixed(1) : Math.round(b)) + ' ' + unidades[i];
}

function formatearTamano(bytes) {
  return formatearBytes(bytes);
}

function formatearFecha(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  var opciones = { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('es', opciones);
}

function haceTiempo(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  var seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  if (seg < 3600) return 'hace ' + Math.floor(seg / 60) + ' min';
  if (seg < 86400) return 'hace ' + Math.floor(seg / 3600) + ' h';
  if (seg < 604800) return 'hace ' + Math.floor(seg / 86400) + ' d';
  return formatearFecha(iso);
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Resalta la consulta dentro del texto respetando acentos y ñ.
 * Trabaja sobre una versión "plana" del texto con un mapa de índices,
 * porque normalizar(NFD) cambia la longitud de la cadena.
 */
function destacar(texto, consulta) {
  var original = String(texto === null || texto === undefined ? '' : texto);
  if (!consulta) return esc(original);
  var limpio = normalizar(consulta).trim();
  if (limpio.length < 2) return esc(original);

  var plano = '';
  var mapa = [];
  for (var i = 0; i < original.length; i++) {
    var n = normalizar(original.charAt(i));
    for (var j = 0; j < n.length; j++) {
      plano += n.charAt(j);
      mapa.push(i);
    }
  }
  var pos = plano.indexOf(limpio);
  if (pos === -1) return esc(original);
  var ini = mapa[pos];
  var fin = mapa[pos + limpio.length - 1] + 1;
  return esc(original.slice(0, ini)) + '<mark>' + esc(original.slice(ini, fin)) + '</mark>' + esc(original.slice(fin));
}

function sinAcentos(texto) {
  return normalizar(texto);
}

function descargar(nombre, contenido, mime) {
  var blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime || 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/** Exige un esquema http/https explícito: "museo.com" NO es una URL válida. */
function urlSegura(valor) {
  var v = String(valor || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) return '';
  try {
    var u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.indexOf('.') !== -1 ? u.href : '';
  } catch (e) { return ''; }
}

/** Normaliza un enlace escrito por el docente añadiendo el esquema si falta */
function normalizarEnlace(valor) {
  var v = String(valor || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
  return urlSegura(v);
}

function formatearFechaHora(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
/* =====================================================================
   3. NOTIFICACIONES (toasts)
   ===================================================================== */

function toast(mensaje, tipo, duracion) {
  var cont = $('#toasts');
  if (!cont) return;
  var iconos = { ok: '✅', error: '⛔', alerta: '⚠️', info: 'ℹ️' };
  var clase = tipo || 'info';
  var el = document.createElement('div');
  el.className = 'toast toast-' + clase;
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<span class="toast-ico" aria-hidden="true">' + (iconos[clase] || iconos.info) + '</span>' +
    '<span class="toast-txt">' + esc(mensaje) + '</span>' +
    '<button type="button" class="toast-x" aria-label="Cerrar aviso">&times;</button>';

  function cerrar() {
    el.classList.add('saliendo');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
  }
  el.querySelector('.toast-x').addEventListener('click', cerrar);
  cont.appendChild(el);
  setTimeout(cerrar, duracion || 4200);
  while (cont.children.length > 5) cont.removeChild(cont.firstChild);
}

/* =====================================================================
   4. ALMACENAMIENTO: localStorage (metadatos)
   ===================================================================== */

function leerClave(clave, porDefecto) {
  try {
    var bruto = localStorage.getItem(clave);
    if (bruto === null || bruto === undefined) return porDefecto;
    var val = JSON.parse(bruto);
    return val === null || val === undefined ? porDefecto : val;
  } catch (e) {
    console.warn('[Hemeroteca] No se pudo leer "' + clave + '":', e);
    return porDefecto;
  }
}

function escribirClave(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    console.error('[Hemeroteca] No se pudo escribir "' + clave + '":', e);
    toast('No se pudo guardar. El almacenamiento del navegador está lleno o bloqueado.', 'error', 7000);
    return false;
  }
}

function configPorDefecto() {
  return {
    nombre: 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO',
    curso: '',
    limite: LIMITE_POR_DEFECTO,
    borrarTareaEstudiante: false,
    verTodasTareas: true,
    borrarAvisosEstudiante: false
  };
}

function cargarConfig() {
  var base = configPorDefecto();
  var guardada = leerClave(CLAVES.config, null);
  if (!guardada || typeof guardada !== 'object') return base;
  Object.keys(base).forEach(function (k) {
    if (guardada[k] !== undefined && guardada[k] !== null) base[k] = guardada[k];
  });
  base.limite = Number(base.limite) || LIMITE_POR_DEFECTO;
  return base;
}

/* =====================================================================
   5. ALMACENAMIENTO: IndexedDB (archivos binarios)
   ===================================================================== */

var DB_NOMBRE = 'hemeroteca_archivos';
var DB_STORE = 'archivos';
var dbPromesa = null;
var memoriaArchivo = null; // respaldo si IndexedDB no está disponible

function indexedDBAvailable() {
  try { return typeof window.indexedDB !== 'undefined' && window.indexedDB !== null; }
  catch (e) { return false; }
}

function abrirDB() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise(function (resolver, rechazar) {
    var peticion;
    try { peticion = indexedDB.open(DB_NOMBRE, 1); }
    catch (e) { rechazar(e); return; }

    peticion.onupgradeneeded = function () {
      var db = peticion.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    peticion.onsuccess = function () {
      var db = peticion.result;
      db.onversionchange = function () { try { db.close(); } catch (e) {} dbPromesa = null; };
      resolver(db);
    };
    peticion.onerror = function () { rechazar(peticion.error || new Error('No se pudo abrir la base de archivos')); };
    peticion.onblocked = function () { rechazar(new Error('La base de archivos está bloqueada por otra pestaña')); };
  });
  dbPromesa.catch(function () { dbPromesa = null; });
  return dbPromesa;
}

function archivoGuardar(registro) {
  if (!indexedDBAvailable()) {
    if (!memoriaArchivo) memoriaArchivo = {};
    memoriaArchivo[registro.id] = registro;
    return Promise.resolve(registro);
  }
  return abrirDB().then(function (db) {
    return new Promise(function (resolver, rechazar) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(registro);
      tx.oncomplete = function () { resolver(registro); };
      tx.onerror = function () { rechazar(tx.error || new Error('Error al guardar el archivo')); };
      tx.onabort = function () { rechazar(tx.error || new Error('Guardado cancelado')); };
    });
  });
}

function archivoLeer(id) {
  if (!indexedDBAvailable()) {
    return Promise.resolve(memoriaArchivo && memoriaArchivo[id] ? memoriaArchivo[id] : null);
  }
  return abrirDB().then(function (db) {
    return new Promise(function (resolver, rechazar) {
      var tx = db.transaction(DB_STORE, 'readonly');
      var req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = function () { resolver(req.result || null); };
      req.onerror = function () { rechazar(req.error || new Error('Error al leer el archivo')); };
    });
  });
}

function archivoBorrar(id) {
  if (!indexedDBAvailable()) {
    if (memoriaArchivo) delete memoriaArchivo[id];
    return Promise.resolve();
  }
  return abrirDB().then(function (db) {
    return new Promise(function (resolver, rechazar) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = function () { resolver(); };
      tx.onerror = function () { rechazar(tx.error || new Error('Error al borrar el archivo')); };
    });
  });
}

function archivoVaciar() {
  if (!indexedDBAvailable()) { memoriaArchivo = {}; return Promise.resolve(); }
  return abrirDB().then(function (db) {
    return new Promise(function (resolver, rechazar) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = function () { resolver(); };
      tx.onerror = function () { rechazar(tx.error || new Error('Error al vaciar la base')); };
    });
  });
}

/* =====================================================================
   6. ESTADO DE LA APLICACIÓN
   ===================================================================== */

var estado = {
  sesion: null,
  config: configPorDefecto(),
  libros: [],
  tareas: [],
  avisos: [],
  fotos: [],
  museos: [],
  seccion: 'inicio',
  filtros: { libro: 'todos', tarea: 'todos', museo: 'todos' },
  busqueda: { libro: '', tarea: '', foto: '', museo: '', global: '' },
  editandoLibro: null,
  visor: { url: null, blob: null, zoom: 1, registro: null }
};

function esDocente() { return estado.sesion && estado.sesion.rol === ROLES.DOCENTE; }
function nombreUsuario() {
  if (estado.sesion && estado.sesion.nombre) return estado.sesion.nombre;
  return esDocente() ? 'Docente' : 'Estudiante';
}

/* =====================================================================
   7. PERSISTENCIA DE METADATOS
   ===================================================================== */

function guardarLibros() { escribirClave(CLAVES.libros, estado.libros); }
function guardarTareas() { escribirClave(CLAVES.tareas, estado.tareas); }
function guardarAvisos() { escribirClave(CLAVES.avisos, estado.avisos); }
function guardarFotos()  { escribirClave(CLAVES.fotos, estado.fotos); }
function guardarMuseos() { escribirClave(CLAVES.museos, estado.museos); }

function cargarTodo() {
  estado.libros = leerClave(CLAVES.libros, []);
  estado.tareas = leerClave(CLAVES.tareas, []);
  estado.avisos = leerClave(CLAVES.avisos, []);
  estado.fotos  = leerClave(CLAVES.fotos, []);
  estado.museos = leerClave(CLAVES.museos, []);

  [estado.libros, estado.tareas, estado.avisos, estado.fotos, estado.museos].forEach(function (lista) {
    if (!Array.isArray(lista)) lista.length = 0;
  });
  estado.config = cargarConfig();
}

/* =====================================================================
   8. PANTALLA DE INICIO DE SESIÓN
   ===================================================================== */

function mostrarLogin(mensaje) {
  $('#appScreen').classList.add('oculto');
  $('#loginScreen').classList.remove('oculto');
  document.body.dataset.rol = '';
  if (!mensaje && BLOQUEO.activo && Date.now() < BLOQUEO.hasta) {
    mensaje = 'Acceso bloqueado por ' + Math.max(0, Math.ceil((BLOQUEO.hasta - Date.now()) / 1000)) + ' segundos por demasiados intentos fallidos.';
  }
  $('#loginError').textContent = mensaje || '';
  $('#loginError').classList.toggle('visible', !!mensaje);
  var u = $('#loginUsuario');
  var p = $('#loginPassword');
  if (u) { u.value = ''; }
  if (p) { p.value = ''; setTimeout(function () { u.focus(); }, 120); }
}

function irAApp() {
  // Verificación del token de sesión antes de abrir las páginas internas
  if (!tokenSesionValido()) {
    cerrarSesion();
    mostrarLogin('Debes iniciar sesión para continuar.');
    return;
  }
  $('#loginScreen').classList.add('oculto');
  $('#appScreen').classList.remove('oculto');
  aplicarRolEnUI();
  aplicarConfigEnUI();
  cargarTodo();
  renderTodo();
  irA('inicio');
  pedirAlmacenamientoPersistente();
}

function aplicarRolEnUI() {
  var rol = estado.sesion ? estado.sesion.rol : '';
  document.body.dataset.rol = rol;
  var nombre = nombreUsuario();
  $('#nombreSesion').textContent = esDocente() ? 'Docente' : 'Estudiante';
  $('#usuarioSesion').textContent = nombre;
  $('#avatarInicial').textContent = (nombre.charAt(0) || '?').toUpperCase();
  $('#avatarInicial').classList.toggle('estudiante', !esDocente());
  $('#marcaNombre').textContent = estado.config.nombre || 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO';
  $('#footTexto').textContent = (estado.config.nombre || 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO') + (estado.config.curso ? ' · ' + estado.config.curso : '');
  $('#tituloSubirTarea').textContent = esDocente() ? 'Publicar tarea o subir entrega' : 'Subir mi tarea';
  if ($('#tareaAutor') && !esDocente()) $('#tareaAutor').value = nombreUsuario();
}

function configurarLogin() {
  var form = $('#loginForm');
  var inputUsuario = $('#loginUsuario');
  var inputPassword = $('#loginPassword');
  var error = $('#loginError');

  $('#togglePass').addEventListener('click', function () {
    var ver = inputPassword.type === 'password';
    inputPassword.type = ver ? 'text' : 'password';
    this.textContent = ver ? '🙈' : '👁';
    this.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    inputPassword.focus();
  });

  function bloqueado() { return BLOQUEO.activo && Date.now() < BLOQUEO.hasta; }
  function segundosDeBloqueo() { return Math.max(0, Math.ceil((BLOQUEO.hasta - Date.now()) / 1000)); }

  function mostrarErrorLogin(mensaje) {
    error.textContent = mensaje || '';
    error.classList.toggle('visible', !!mensaje);
  }

  function intentar(e) {
    if (e) e.preventDefault();

    if (bloqueado()) {
      mostrarErrorLogin('Acceso bloqueado por ' + segundosDeBloqueo() + ' segundos por demasiados intentos fallidos.');
      return;
    }

    // Sanitiza las entradas antes de compararlas (evita inyección de HTML)
    var u = sanitizar(inputUsuario.value);
    var p = sanitizar(inputPassword.value);
    if (!u || !p) {
      mostrarErrorLogin('Escribe tu usuario y tu contraseña.');
      return;
    }

    credencialesCorrectas(u, p).then(function (ok) {
      if (!ok) {
        intentosFallidos += 1;
        if (intentosFallidos >= LIMITE_INTENTOS) {
          intentosFallidos = 0;
          BLOQUEO.activo = true;
          BLOQUEO.hasta = Date.now() + (SEGUNDOS_BLOQUEO * 1000);
          mostrarErrorLogin('Demasiados intentos fallidos. Acceso bloqueado por ' + SEGUNDOS_BLOQUEO + ' segundos.');
        } else {
          var restantes = LIMITE_INTENTOS - intentosFallidos;
          mostrarErrorLogin('Usuario o contraseña incorrectos. ' +
            (restantes === 1 ? 'Queda 1 intento.' : 'Quedan ' + restantes + ' intentos.'));
        }
        guardarEstadoBloqueo();
        inputPassword.select();
        return;
      }

      // Credenciales correctas: se reinicia el contador de fallos
      BLOQUEO.activo = false;
      BLOQUEO.hasta = 0;
      intentosFallidos = 0;
      guardarEstadoBloqueo();
      mostrarErrorLogin('');

      // Sesión temporal: se pide el rol
      estado.sesion = null;
      elegirRol().then(function (rol) {
        var token = crearTokenSesion();
        estado.sesion = {
          rol: rol,
          usuario: USUARIO_OBJETIVO,
          nombre: rol === ROLES.DOCENTE ? 'Docente' : (leerClave(CLAVES.perfil, {}).nombre || 'Estudiante'),
          fecha: ahora(),
          token: token
        };
        escribirClave(CLAVES.sesion, estado.sesion);
        irAApp();
        toast('¡Bienvenido, ' + nombreUsuario() + '!', 'ok');
      });
    });
  }

  form.addEventListener('submit', intentar);
  inputUsuario.addEventListener('input', function () { error.classList.remove('visible'); });
  inputPassword.addEventListener('input', function () { error.classList.remove('visible'); });

  $('#btnCerrarSesion').addEventListener('click', function () {
    cerrarSesion();
    BLOQUEO.activo = false;
    BLOQUEO.hasta = 0;
    intentosFallidos = 0;
    guardarEstadoBloqueo();
    cerrarTodosLosModales();
    mostrarLogin('');
    toast('Sesión cerrada correctamente.', 'ok');
  });

  // Protección básica contra inspección en la pantalla de login (solo disuasión)
  document.addEventListener('contextmenu', function (e) {
    var login = $('#loginScreen');
    if (login && !login.classList.contains('oculto')) e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    var login = $('#loginScreen');
    if (!login || login.classList.contains('oculto')) return;
    var tecla = String(e.key || '').toLowerCase();
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && (tecla === 'i' || tecla === 'j' || tecla === 'k')) { e.preventDefault(); return; }
    if (e.ctrlKey && !e.metaKey && !e.altKey && tecla === 'u') { e.preventDefault(); return; }
  });

  // Desbloqueo automático al cumplirse los 60 segundos
  setInterval(function () {
    if (BLOQUEO.activo && Date.now() >= BLOQUEO.hasta) {
      BLOQUEO.activo = false;
      BLOQUEO.hasta = 0;
      intentosFallidos = 0;
      guardarEstadoBloqueo();
      var err = $('#loginError');
      if (err && err.classList.contains('visible')) {
        err.textContent = 'El bloqueo terminó. Ya puedes intentar de nuevo.';
      }
    }
  }, 1000);
}

/** Diálogo reutilizable que devuelve una promesa */
function dialogo(opciones) {
  var modal = $('#modalConfirmar');
  var p = new Promise(function (resolver) { dialogo._resolver = resolver; });
  $('#confirmIcono').textContent = opciones.icono || '⚠️';
  $('#confirmTitulo').textContent = opciones.titulo || 'Confirmar';
  $('#confirmTexto').textContent = opciones.texto || '';
  var si = $('#confirmSi'), no = $('#confirmNo');
  si.textContent = opciones.okTexto || 'Confirmar';
  si.className = 'btn ' + (opciones.peligro ? 'btn-peligro' : 'btn-primario');
  no.textContent = opciones.cancelTexto || 'Cancelar';
  no.className = 'btn ' + (opciones.okSecundario ? 'btn-primario' : 'btn-soft');
  modal.setAttribute('hidden', '');
  modal.removeAttribute('hidden');
  setTimeout(function () { (opciones.peligro ? no : si).focus(); }, 60);
  return p;
}

function cerrarConfirmar(valor) {
  var modal = $('#modalConfirmar');
  modal.setAttribute('hidden', '');
  if (dialogo._resolver) { dialogo._resolver(valor); dialogo._resolver = null; }
}

function elegirRol() {
  return dialogo({
    icono: '🎭',
    titulo: 'Elige cómo quieres entrar',
    texto: 'Las credenciales son las mismas para todos. Selecciona tu rol para ver las herramientas correspondientes.',
    okTexto: '👨‍🏫 Soy docente',
    cancelTexto: '🎓 Soy estudiante',
    okSecundario: true
  }).then(function (ok) { return ok ? ROLES.DOCENTE : ROLES.ESTUDIANTE; });
}

function confirmar(titulo, texto, okTexto, peligro) {
  return dialogo({
    icono: peligro ? '🗑️' : '❓',
    titulo: titulo,
    texto: texto,
    okTexto: okTexto || 'Confirmar',
    peligro: !!peligro
  });
}

/* =====================================================================
   9. NAVEGACIÓN
   ===================================================================== */

function irA(seccion) {
  if (!SECCIONES[seccion]) return;
  if (seccion === 'ajustes' && !esDocente()) return;
  estado.seccion = seccion;

  $$('.seccion').forEach(function (s) { s.classList.remove('activa'); });
  var destino = $('#sec-' + seccion);
  if (destino) destino.classList.add('activa');

  $$('.nav-item').forEach(function (b) {
    b.classList.toggle('activo', b.getAttribute('data-seccion') === seccion);
  });

  var info = SECCIONES[seccion];
  $('#tituloSeccion').textContent = info.titulo;
  $('#subtituloSeccion').textContent = info.sub;

  cerrarSidebarMovil();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function abrirSidebarMovil() {
  $('#sidebar').classList.add('abierto');
  $('#sidebarOverlay').hidden = false;
}
function cerrarSidebarMovil() {
  $('#sidebar').classList.remove('abierto');
  $('#sidebarOverlay').hidden = true;
}

function configurarNavegacion() {
  $('#navPrincipal').addEventListener('click', function (e) {
    var btn = e.target.closest('.nav-item');
    if (btn) irA(btn.getAttribute('data-seccion'));
  });

  $('#abrirSidebar').addEventListener('click', abrirSidebarMovil);
  $('#cerrarSidebar').addEventListener('click', cerrarSidebarMovil);
  $('#sidebarOverlay').addEventListener('click', cerrarSidebarMovil);

  document.addEventListener('click', function (e) {
    var tile = e.target.closest('[data-ir]');
    if (tile) irA(tile.getAttribute('data-ir'));
  });

  $('#inputBuscar').addEventListener('input', function () {
    var valor = this.value.trim();
    estado.busqueda.global = valor;
    var mapa = { libros: 'libro', tareas: 'tarea', fotos: 'foto', museos: 'museo' };
    var clave = mapa[estado.seccion];
    if (clave) {
      estado.busqueda[clave] = valor;
      renderSeccion(estado.seccion);
    }
  });
}

/* =====================================================================
   10. TEMA CLARO / OSCURO
   ===================================================================== */

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema === 'oscuro' ? 'oscuro' : 'claro');
  $('#btnTema').textContent = tema === 'oscuro' ? '☀️' : '🌙';
}

function configurarTema() {
  var guardado = localStorage.getItem(CLAVES.tema);
  if (!guardado) {
    guardado = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  aplicarTema(guardado);
  $('#btnTema').addEventListener('click', function () {
    var actual = document.documentElement.getAttribute('data-theme');
    var nuevo = actual === 'oscuro' ? 'claro' : 'oscuro';
    try { localStorage.setItem(CLAVES.tema, nuevo); } catch (e) { /* sin almacenamiento */ }
    aplicarTema(nuevo);
  });
}

/* =====================================================================
   11. ZONAS DE ARCHIVO (arrastrar y soltar)
   ===================================================================== */

function crearZonaArchivo(cfg) {
  var drop = $(cfg.drop);
  var input = $(cfg.input);
  var txtEl = $(cfg.txt);
  var infoEl = $(cfg.info);
  var seleccionados = [];

  function pintar(mensajeError) {
    drop.classList.toggle('error', !!mensajeError);
    if (!txtEl) return;
    if (mensajeError) txtEl.textContent = mensajeError;
    else if (seleccionados.length === 1) txtEl.textContent = seleccionados[0].name;
    else if (seleccionados.length > 1) txtEl.textContent = seleccionados.length + ' archivos seleccionados';
    else txtEl.textContent = cfg.textoPorDefecto;
    if (infoEl) {
      if (mensajeError) infoEl.textContent = 'Toca para elegir otro archivo';
      else if (seleccionados.length) {
        infoEl.textContent = seleccionados.map(function (f) {
          return f.name + ' · ' + formatearTamano(f.size);
        }).join('  |  ');
      } else infoEl.textContent = cfg.infoPorDefecto;
    }
  }

  function recibir(files) {
    seleccionados = Array.prototype.slice.call(files || []);
    pintar();
    if (cfg.alCambiar) cfg.alCambiar(seleccionados);
  }

  drop.addEventListener('click', function () { input.click(); });
  drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); input.click(); }
  });

  input.addEventListener('change', function () { recibir(this.files); });

  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('activo'); });
  });
  ['dragleave'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) {
      e.preventDefault();
      if (e.relatedTarget && drop.contains(e.relatedTarget)) return;
      drop.classList.remove('activo');
    });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('activo');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) recibir(e.dataTransfer.files);
  });

  return {
    limpiar: function () {
      seleccionados = [];
      input.value = '';
      pintar();
      if (cfg.alLimpiar) cfg.alLimpiar();
    },
    /** Igual que limpiar() pero sin disparar el callback (al entrar a editar) */
    limpiarSilencioso: function () {
      seleccionados = [];
      input.value = '';
      pintar();
    },
    archivos: function () { return seleccionados; }
  };
}

/* Valida un archivo contra una lista de extensiones y el límite de tamaño */
function validarArchivo(file, extensiones, limite) {
  if (!file) return 'Archivo vacío.';
  if (file.size === 0) return 'El archivo "' + file.name + '" está vacío.';
  var ext = extension(file.name);
  if (extensiones.indexOf(ext) === -1) {
    return 'Formato no permitido ("' + (ext || 'sin extensión') + '"). Se aceptan: ' + extensiones.join(', ');
  }
  var max = limite || estado.config.limite || LIMITE_POR_DEFECTO;
  if (file.size > max) {
    return 'El archivo "' + file.name + '" pesa ' + formatearBytes(file.size) + ' y supera el límite de ' + formatearBytes(max) + '.';
  }
  return null;
}

/* =====================================================================
   12. MODAL DE PROGRESO
   ===================================================================== */

function progresoMostrar(titulo, texto) {
  $('#progresoTitulo').textContent = titulo || 'Procesando…';
  $('#progresoTexto').textContent = texto || 'Un momento…';
  $('#progresoBarra').style.width = '8%';
  $('#modalProgreso').removeAttribute('hidden');
}
function progresoOcultar() {
  $('#modalProgreso').setAttribute('hidden', '');
}

function cerrarTodosLosModales() {
  ['modalVisor', 'modalMuseo', 'modalConfirmar', 'modalProgreso'].forEach(function (id) {
    var m = $('#' + id);
    if (m) m.setAttribute('hidden', '');
  });
  if (dialogo._resolver) { dialogo._resolver(false); dialogo._resolver = null; }
  liberarVisor();
}

/* =====================================================================
   13. LECTOR ZIP + CONVERSOR DOCX (sin dependencias externas)
   ===================================================================== */

function bytesABase64(bytes) {
  var bin = '';
  var paso = 0x8000;
  for (var i = 0; i < bytes.length; i += paso) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + paso, bytes.length)));
  }
  return btoa(bin);
}

function desinflar(bruto) {
  if (typeof window.DecompressionStream === 'undefined') {
    return Promise.reject(new Error('Este navegador no puede descomprimir archivos Word en línea.'));
  }
  var flujo = new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
}

function abrirZip(buffer) {
  var dv = new DataView(buffer);
  var total = dv.byteLength;
  if (total < 22) throw new Error('El archivo está vacío o dañado.');

  // --- Buscar el registro "End of Central Directory" (PK\005\006) ---
  var eocd = -1;
  var desde = Math.max(0, total - 66000);
  for (var i = total - 22; i >= desde; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no tiene un formato ZIP válido.');

  var numEntradas = dv.getUint16(eocd + 10, true);
  var offsetCentral = dv.getUint32(eocd + 16, true);
  var dec = new TextDecoder('utf-8');

  // --- Soporte ZIP64 ---
  if (numEntradas === 0xffff || offsetCentral === 0xffffffff) {
    for (var j = eocd - 20; j >= desde; j--) {
      if (dv.getUint32(j, true) === 0x07064b50) {
        var pos64 = Number(dv.getBigUint64(j + 8, true));
        if (pos64 > 0 && pos64 < total && dv.getUint32(pos64, true) === 0x06064b50) {
          numEntradas = Number(dv.getBigUint64(pos64 + 32, true));
          offsetCentral = Number(dv.getBigUint64(pos64 + 48, true));
        }
        break;
      }
    }
  }
  if (offsetCentral + 46 > total) throw new Error('El índice del archivo está dañado.');

  // --- Leer el directorio central ---
  var indice = {};
  var lista = [];
  var off = offsetCentral;
  for (var k = 0; k < numEntradas; k++) {
    if (off + 46 > total) break;
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    var metodo = dv.getUint16(off + 10, true);
    var tamComp = dv.getUint32(off + 20, true);
    var tamOrig = dv.getUint32(off + 24, true);
    var largoNombre = dv.getUint16(off + 28, true);
    var largoExtra = dv.getUint16(off + 30, true);
    var largoComent = dv.getUint16(off + 32, true);
    var offsetLocal = dv.getUint32(off + 42, true);
    var nombre = dec.decode(new Uint8Array(buffer, off + 46, largoNombre));

    var entrada = {
      nombre: nombre, metodo: metodo,
      tamComp: tamComp, tamOrig: tamOrig, offsetLocal: offsetLocal
    };

    // ZIP64: valores reales dentro del campo extra
    if (tamComp === 0xffffffff || tamOrig === 0xffffffff || offsetLocal === 0xffffffff) {
      var posExtra = off + 46 + largoNombre;
      var finExtra = posExtra + largoExtra;
      var p = posExtra;
      while (p + 4 <= finExtra) {
        var idExtra = dv.getUint16(p, true);
        var tamExtra = dv.getUint16(p + 2, true);
        if (idExtra === 0x0001) {
          var q = p + 4;
          if (tamOrig === 0xffffffff) { tamOrig = Number(dv.getBigUint64(q, true)); q += 8; }
          if (tamComp === 0xffffffff) { tamComp = Number(dv.getBigUint64(q, true)); q += 8; }
          if (offsetLocal === 0xffffffff) { offsetLocal = Number(dv.getBigUint64(q, true)); q += 8; }
          break;
        }
        p += 4 + tamExtra;
      }
    }

    if (!indice[nombre]) indice[nombre] = entrada;
    lista.push(entrada);
    off += 46 + largoNombre + largoExtra + largoComent;
  }

  function bytesDe(entrada) {
    var o = entrada.offsetLocal;
    if (o + 30 > total) throw new Error('El archivo "' + entrada.nombre + '" está dañado.');
    if (dv.getUint32(o, true) !== 0x04034b50) throw new Error('El archivo "' + entrada.nombre + '" está dañado.');
    var largoNombreL = dv.getUint16(o + 26, true);
    var largoExtraL = dv.getUint16(o + 28, true);
    var inicio = o + 30 + largoNombreL + largoExtraL;
    if (inicio + entrada.tamComp > total) throw new Error('El archivo "' + entrada.nombre + '" está dañado.');
    return new Uint8Array(buffer.slice(inicio, inicio + entrada.tamComp));
  }

  return {
    existe: function (nombre) { return !!indice[nombre]; },
    nombres: lista.map(function (e) { return e.nombre; }),
    leer: function (nombre) {
      var entrada = indice[nombre];
      if (!entrada) return Promise.reject(new Error('No se encontró "' + nombre + '" dentro del documento.'));
      if (entrada.metodo === 0) return Promise.resolve(bytesDe(entrada));
      if (entrada.metodo === 8) return desinflar(bytesDe(entrada));
      return Promise.reject(new Error('El documento usa una compresión no soportada.'));
    }
  };
}

function hijosPorNombre(nodo, nombre) {
  var salida = [];
  for (var i = 0; i < nodo.childNodes.length; i++) {
    if (nodo.childNodes[i].nodeName === nombre) salida.push(nodo.childNodes[i]);
  }
  return salida;
}

function primeroPorNombre(nodo, nombre) {
  if (!nodo) return null;
  for (var i = 0; i < nodo.childNodes.length; i++) {
    if (nodo.childNodes[i].nodeName === nombre) return nodo.childNodes[i];
  }
  return null;
}

function attrNS(nodo, prefijo, nombre) {
  if (!nodo) return null;
  var v = nodo.getAttribute(prefijo + ':' + nombre);
  if (v !== null) return v;
  return nodo.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', nombre);
}

function propWord(rPr, etiqueta) {
  var el = primeroPorNombre(rPr, etiqueta);
  if (!el) return false;
  var v = attrNS(el, 'w', 'val');
  return !(v === '0' || v === 'false' || v === 'off');
}

/* --- Relaciones (document.xml.rels) --- */
function analizarRelas(xmlTexto) {
  var mapa = {};
  try {
    var doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');
    var rels = doc.getElementsByTagName('Relationship');
    for (var i = 0; i < rels.length; i++) {
      mapa[rels[i].getAttribute('Id')] = {
        destino: rels[i].getAttribute('Target') || '',
        externo: (rels[i].getAttribute('TargetMode') || '') === 'External'
      };
    }
  } catch (e) { /* sin relaciones */ }
  return mapa;
}

/* --- numbering.xml: numId -> numFmt --- */
function analizarNumeracion(xmlTexto) {
  var mapa = {}; // "numId|ilvl" -> "bullet" | "decimal" | ...
  try {
    var doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');

    var abstractos = {};
    var listaAbs = doc.getElementsByTagName('w:abstractNum');
    for (var a = 0; a < listaAbs.length; a++) {
      var idAbs = attrNS(listaAbs[a], 'w', 'abstractNumId');
      var niveles = {};
      var lvl = listaAbs[a].getElementsByTagName('w:lvl');
      for (var l = 0; l < lvl.length; l++) {
        var ilvl = attrNS(lvl[l], 'w', 'ilvl') || '0';
        var fmt = primeroPorNombre(lvl[l], 'w:numFmt');
        niveles[ilvl] = fmt ? (attrNS(fmt, 'w', 'val') || 'decimal') : 'decimal';
      }
      abstractos[idAbs] = niveles;
    }

    var num = doc.getElementsByTagName('w:num');
    for (var n = 0; n < num.length; n++) {
      var numId = attrNS(num[n], 'w', 'numId');
      var ref = primeroPorNombre(num[n], 'w:abstractNumId');
      var destino = ref ? attrNS(ref, 'w', 'val') : null;
      if (destino === null || !abstractos[destino]) continue;
      for (var lvlId in abstractos[destino]) {
        if (Object.prototype.hasOwnProperty.call(abstractos[destino], lvlId)) {
          mapa[numId + '|' + lvlId] = abstractos[destino][lvlId];
        }
      }
    }
  } catch (e) { /* sin numeración */ }
  return mapa;
}

var ORDENES_SIN_VINIETA = ['decimal', 'decimalZero', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman'];

/* --- Conversión de document.xml a HTML --- */
function docxXmlAHtml(xmlTexto, ctx) {
  var doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) throw new Error('El contenido del documento no se pudo interpretar.');
  var body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('El documento está vacío.');

  var salida = [];
  var listaAbierta = null; // 'ul' | 'ol'
  var dentroDeTabla = false;

  function cerrarLista() {
    if (dentroDeTabla) return;
    if (listaAbierta) { salida.push('</' + listaAbierta + '>'); listaAbierta = null; }
  }

  function abrirLista(tipo) {
    if (dentroDeTabla) return;
    if (listaAbierta === tipo) return;
    cerrarLista();
    salida.push('<' + tipo + '>');
    listaAbierta = tipo;
  }

  function runDeImagen(nodo) {
    var ids = [];
    var blips = nodo.getElementsByTagName('a:blip');
    for (var i = 0; i < blips.length; i++) {
      var id = attrNS(blips[i], 'r', 'embed') || attrNS(blips[i], 'r', 'link');
      if (id) ids.push(id);
    }
    var vml = nodo.getElementsByTagName('v:imagedata');
    for (var j = 0; j < vml.length; j++) {
      var idv = attrNS(vml[j], 'r', 'id');
      if (idv) ids.push(idv);
    }
    var html = '';
    for (var k = 0; k < ids.length && ctx.imagenesHechas < 12; k++) {
      var src = ctx.imagenes[ids[k]];
      if (!src) continue;
      ctx.imagenesHechas++;
      html += '<img src="' + esc(src) + '" alt="Imagen del documento">';
    }
    return html;
  }

  function renderRun(r) {
    var rPr = primeroPorNombre(r, 'w:rPr');
    var interno = '';
    var hijos = r.childNodes;
    for (var i = 0; i < hijos.length; i++) {
      var c = hijos[i];
      var n = c.nodeName;
      if (n === 'w:t') interno += esc(c.textContent);
      else if (n === 'w:tab') interno += '&nbsp;&nbsp;&nbsp;';
      else if (n === 'w:br' || n === 'w:cr') interno += '<br>';
      else if (n === 'w:noBreakHyphen') interno += '-';
      else if (n === 'w:softHyphen') interno += '';
      else if (n === 'w:drawing' || n === 'w:pict' || n === 'w:object') interno += runDeImagen(c);
    }
    if (!interno) return '';

    if (rPr) {
      var estilo = primeroPorNombre(rPr, 'w:rStyle');
      var valEstilo = estilo ? (attrNS(estilo, 'w', 'val') || '') : '';
      if (/Emphasis/i.test(valEstilo)) interno = '<em>' + interno + '</em>';
      if (/Fuerte|Strong/i.test(valEstilo)) interno = '<strong>' + interno + '</strong>';
      if (propWord(rPr, 'w:i')) interno = '<em>' + interno + '</em>';
      if (propWord(rPr, 'w:b')) interno = '<strong>' + interno + '</strong>';
      if (propWord(rPr, 'w:strike')) interno = '<s>' + interno + '</s>';
      if (propWord(rPr, 'w:u')) interno = '<u>' + interno + '</u>';
      var tam = primeroPorNombre(rPr, 'w:sz');
      if (tam) {
        var medio = parseInt(attrNS(tam, 'w', 'val') || '0', 10);
        if (medio > 0 && Math.abs(medio - 22) > 1) {
          interno = '<span style="font-size:' + (medio / 2) + 'pt">' + interno + '</span>';
        }
      }
      var color = primeroPorNombre(rPr, 'w:color');
      if (color) {
        var hex = attrNS(color, 'w', 'val');
        if (hex && /^[0-9a-f]{6}$/i.test(hex) && hex.toLowerCase() !== 'auto') {
          interno = '<span style="color:#' + hex + '">' + interno + '</span>';
        }
      }
    }
    return interno;
  }

  function renderHijos(contenedor) {
    var html = '';
    var hijos = contenedor.childNodes;
    for (var i = 0; i < hijos.length; i++) {
      var c = hijos[i];
      var n = c.nodeName;
      if (n === 'w:r') html += renderRun(c);
      else if (n === 'w:hyperlink') {
        var rid = attrNS(c, 'r', 'id');
        var rel = rid ? ctx.rels[rid] : null;
        var url = rel && !rel.externo ? '' : (rel ? rel.destino : '');
        var dentro = renderHijos(c);
        html += url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + dentro + '</a>' : dentro;
      } else if (n === 'w:ins' || n === 'w:smartTag' || n === 'w:sdt' || n === 'w:sdtContent') {
        html += renderHijos(c);
      } else if (n === 'w:p') {
        html += renderParrafo(c);
      } else if (n === 'w:del') {
        /* texto eliminado: se ignora */
      }
    }
    return html;
  }

  /** Devuelve el <w:pPr> del párrafo (o null) */
  function propParrafo(p) {
    return primeroPorNombre(p, 'w:pPr');
  }

  /** Devuelve un hijo de <w:pPr> */
  function propiedadParrafo(p, etiqueta) {
    return primeroPorNombre(propParrafo(p), etiqueta);
  }

  function nivelTitulo(p) {
    var estilo = propiedadParrafo(p, 'w:pStyle');
    if (!estilo) return 0;
    var v = sinAcentos(attrNS(estilo, 'w', 'val') || '').replace(/[^a-z0-9]/g, '');
    if (/^heading([1-6])$/.test(v)) return parseInt(v.slice(-1), 10);
    if (/^ttulo([1-6])$/.test(v)) return parseInt(v.slice(-1), 10);
    if (/^titulo([1-6])$/.test(v)) return parseInt(v.slice(-1), 10);
    if (v === 'title' || v === 'titulo') return 1;
    if (v === 'subtitle' || v === 'subtitulo') return 2;
    return 0;
  }

  function nivelLista(p) {
    var numPr = propiedadParrafo(p, 'w:numPr');
    if (!numPr) return null;
    var numIdEl = primeroPorNombre(numPr, 'w:numId');
    var ilvlEl = primeroPorNombre(numPr, 'w:ilvl');
    var numId = numIdEl ? attrNS(numIdEl, 'w', 'val') : null;
    if (!numId || numId === '0') return null;
    var ilvl = ilvlEl ? (attrNS(ilvlEl, 'w', 'val') || '0') : '0';
    var fmt = ctx.numeracion[numId + '|' + ilvl] || 'bullet';
    return (ORDENES_SIN_VINIETA.indexOf(fmt) !== -1) ? 'ol' : 'ul';
  }

  function alineacionDe(p) {
    var jc = propiedadParrafo(p, 'w:jc');
    var v = jc ? (attrNS(jc, 'w', 'val') || '') : '';
    if (v === 'center') return ' style="text-align:center"';
    if (v === 'right' || v === 'end') return ' style="text-align:right"';
    if (v === 'both' || v === 'justify') return ' style="text-align:justify"';
    return '';
  }

  function renderParrafo(p) {
    var tipoLista = nivelLista(p);
    if (tipoLista) {
      abrirLista(tipoLista);
      return '<li>' + renderHijos(p) + '</li>';
    }
    cerrarLista();

    var contenido = renderHijos(p);
    var nivel = nivelTitulo(p);
    if (nivel >= 1 && nivel <= 6 && contenido) return '<h' + nivel + '>' + contenido + '</h' + nivel + '>';
    if (!contenido) return '';
    var estiloP = propiedadParrafo(p, 'w:pStyle');
    var valP = estiloP ? (attrNS(estiloP, 'w', 'val') || '') : '';
    if (/Quote|Cita/i.test(valP)) return '<blockquote>' + contenido + '</blockquote>';
    return '<p' + alineacionDe(p) + '>' + contenido + '</p>';
  }

  function renderTabla(tbl) {
    var html = '<table>';
    var filas = hijosPorNombre(tbl, 'w:tr');
    var antes = dentroDeTabla;
    dentroDeTabla = true;
    for (var i = 0; i < filas.length; i++) {
      html += '<tr>';
      var celdas = hijosPorNombre(filas[i], 'w:tc');
      for (var j = 0; j < celdas.length; j++) {
        var celda = '';
        var bloques = celdas[j].childNodes;
        for (var b = 0; b < bloques.length; b++) {
          var nb = bloques[b].nodeName;
          if (nb === 'w:p') celda += renderParrafo(bloques[b]);
          else if (nb === 'w:tbl') celda += renderTabla(bloques[b]);
          else if (nb === 'w:sdt' || nb === 'w:sdtContent') celda += renderHijos(bloques[b]);
        }
        html += '<td>' + (celda || '&nbsp;') + '</td>';
      }
      html += '</tr>';
    }
    dentroDeTabla = antes;
    return html + '</table>';
  }

  /**
   * Recorre los bloques del documento. Los resultados se acumulan en
   * `salida` porque las listas deben abrirse y cerrarse entre párrafos.
   */
  function renderNodo(nodo) {
    for (var i = 0; i < nodo.childNodes.length; i++) {
      var c = nodo.childNodes[i];
      var n = c.nodeName;
      if (n === 'w:p') salida.push(renderParrafo(c));
      else if (n === 'w:tbl') salida.push(renderTabla(c));
      else if (n === 'w:sdt') renderNodo(primeroPorNombre(c, 'w:sdtContent') || c);
      else if (n === 'w:bookmarkStart' || n === 'w:bookmarkEnd' || n === 'w:sectPr') continue;
    }
  }

  renderNodo(body);
  cerrarLista();

  var resultado = salida.join('');
  if (!resultado.replace(/<[^>]*>/g, '').trim()) throw new Error('El documento no tiene texto legible.');
  return resultado;
}

/** Convierte un Blob .docx a HTML listo para mostrar */
function docxAHtml(blob) {
  if (blob.size > PREVIEW_DOCX_MAX) {
    return Promise.reject(new Error('El documento pesa ' + formatearBytes(blob.size) + ', demasiado grande para la vista previa en línea.'));
  }
  if (typeof window.DecompressionStream === 'undefined') {
    return Promise.reject(new Error('Este navegador no puede mostrar archivos Word en línea. Usa Chrome, Edge o Firefox actualizados.'));
  }
  return blob.arrayBuffer().then(function (buffer) {
    var zip = abrirZip(buffer);
    return zip.leer('word/document.xml').then(function (bytesXml) {
      var xmlTexto = new TextDecoder('utf-8').decode(bytesXml);
      return zip.leer('word/_rels/document.xml.rels').then(function (bytesRels) {
        return analizarRelas(new TextDecoder('utf-8').decode(bytesRels));
      }).catch(function () { return {}; }).then(function (rels) {
        return zip.leer('word/numbering.xml').then(function (bytesNum) {
          return analizarNumeracion(new TextDecoder('utf-8').decode(bytesNum));
        }).catch(function () { return {}; }).then(function (numeracion) {
          // Precargar imágenes del documento (máx. 12)
          var ctx = { rels: rels, numeracion: numeracion, imagenes: {}, imagenesHechas: 0 };
          var pendientes = [];
          Object.keys(rels).forEach(function (id) {
            var rel = rels[id];
            if (!rel || rel.externo) return;
            var dest = String(rel.destino || '').replace(/^\/+/, '');
            if (dest.indexOf('media/') === -1 && dest.indexOf('image') === -1) return;
            var ruta = dest.indexOf('word/') === 0 ? dest : 'word/' + dest;
            if (!zip.existe(ruta)) return;
            pendientes.push({ id: id, ruta: ruta });
          });
          var limite = pendientes.slice(0, 12);
          return Promise.all(limite.map(function (p) {
            return zip.leer(p.ruta).then(function (bytes) {
              if (bytes.length > 6 * 1024 * 1024) return;
              var mime = /\.png$/i.test(p.ruta) ? 'image/png'
                : /\.jpg$|\.jpeg$/i.test(p.ruta) ? 'image/jpeg'
                : /\.gif$/i.test(p.ruta) ? 'image/gif'
                : /\.bmp$/i.test(p.ruta) ? 'image/bmp'
                : /\.emf$|\.wmf$/i.test(p.ruta) ? null
                : 'image/png';
              if (!mime) return;
              ctx.imagenes[p.id] = 'data:' + mime + ';base64,' + bytesABase64(bytes);
            }).catch(function () { /* imagen opcional */ });
          })).then(function () {
            return docxXmlAHtml(xmlTexto, ctx);
          });
        });
      });
    });
  });
}

/* =====================================================================
   14. VISOR DE ARCHIVOS
   ===================================================================== */

function liberarVisor() {
  if (estado.visor.url) {
    URL.revokeObjectURL(estado.visor.url);
    estado.visor.url = null;
  }
  estado.visor.blob = null;
  estado.visor.registro = null;
  estado.visor.zoom = 1;
}

function ajustarZoom(nivel) {
  estado.visor.zoom = Math.min(5, Math.max(0.25, nivel));
  var img = $('#visorBody .visor-imagen');
  $('#zoomNivel').textContent = Math.round(estado.visor.zoom * 100) + '%';
  if (img) img.style.transform = 'scale(' + estado.visor.zoom + ')';
}

function sinVistaPrevia(nombre, razon) {
  return '<div class="sin-vista">' +
    '<div class="ico">' + iconoArchivo(nombre) + '</div>' +
    '<h3>Vista previa no disponible</h3>' +
    '<p>' + esc(razon) + '</p>' +
    '<div class="acciones">' +
      '<button type="button" class="btn btn-primario" data-accion="descargar">Descargar archivo</button>' +
    '</div>' +
    '</div>';
}

function abrirVisor(registro) {
  var modal = $('#modalVisor');
  var cuerpo = $('#visorBody');

  liberarVisor();
  estado.visor.registro = registro;

  $('#visorTitulo').textContent = registro.titulo || registro.nombre;
  $('#visorSub').textContent = registro.nombre + ' · ' + formatearTamano(registro.tamano || 0);
  $('#zoomControles').hidden = true;
  ajustarZoom(1);
  cuerpo.innerHTML = '<div class="cargando"><span class="spinner"></span><p>Cargando archivo…</p></div>';
  modal.removeAttribute('hidden');

  archivoLeer(registro.archivoId).then(function (datos) {
    if (!datos || !datos.blob) {
      cuerpo.innerHTML = sinVistaPrevia(registro.nombre, 'El archivo no se encontró en este navegador. Vuelve a subirlo desde el botón de carga.');
      return;
    }
    var blob = datos.blob;
    estado.visor.blob = blob;
    var url = URL.createObjectURL(blob);
    estado.visor.url = url;

    var tipo = tipoArchivo(registro.nombre);

    if (tipo === 'PDF') {
      cuerpo.innerHTML = '<iframe class="visor-frame" src="' + url + '#toolbar=0&view=FitH" title="' + esc(registro.nombre) + '"></iframe>';
      return;
    }

    if (tipo === 'imagen') {
      cuerpo.innerHTML = '<img class="visor-imagen" src="' + url + '" alt="' + esc(registro.titulo || registro.nombre) + '">';
      $('#zoomControles').hidden = false;
      ajustarZoom(1);
      return;
    }

    if (tipo === 'DOCX') {
      cuerpo.innerHTML = '<div class="cargando"><span class="spinner"></span><p>Abriendo documento de Word…</p></div>';
      docxAHtml(blob).then(function (html) {
        cuerpo.innerHTML = '<article class="visor-docx">' + html + '</article>';
        cuerpo.scrollTop = 0;
      }).catch(function (err) {
        console.warn('[Hemeroteca] Vista previa DOCX:', err);
        cuerpo.innerHTML = sinVistaPrevia(registro.nombre, err && err.message ? err.message : 'No se pudo convertir el documento.');
      });
      return;
    }

    if (tipo === 'DOC') {
      cuerpo.innerHTML = sinVistaPrevia(registro.nombre,
        'Los archivos .doc (Word 97-2003) no se pueden mostrar en línea. Descárgalo y ábrelo con Microsoft Word o LibreOffice.');
      return;
    }

    cuerpo.innerHTML = sinVistaPrevia(registro.nombre, 'Este formato no tiene vista previa en el navegador.');
  }).catch(function (err) {
    console.error('[Hemeroteca] Error al abrir el archivo:', err);
    cuerpo.innerHTML = sinVistaPrevia(registro.nombre, 'Ocurrió un error al leer el archivo desde el almacenamiento del navegador.');
  });
}

function descargarRegistro(registro) {
  archivoLeer(registro.archivoId).then(function (datos) {
    if (!datos || !datos.blob) {
      toast('No se encontró el archivo en este navegador.', 'error');
      return;
    }
    descargar(registro.nombre, datos.blob);
    toast('Descarga iniciada: ' + registro.nombre, 'ok');
  }).catch(function () {
    toast('No se pudo descargar el archivo.', 'error');
  });
}

function configurarVisor() {
  $('#visorCerrar').addEventListener('click', cerrarTodosLosModales);
  $('#visorDescargar').addEventListener('click', function () {
    if (estado.visor.registro) descargarRegistro(estado.visor.registro);
  });
  $('#zoomMas').addEventListener('click', function () { ajustarZoom(estado.visor.zoom + 0.25); });
  $('#zoomMenos').addEventListener('click', function () { ajustarZoom(estado.visor.zoom - 0.25); });
  $('#zoomReset').addEventListener('click', function () { ajustarZoom(1); });
  $('#visorBody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion="descargar"]');
    if (btn && estado.visor.registro) descargarRegistro(estado.visor.registro);
  });
  $('#visorBody').addEventListener('dblclick', function (e) {
    if (e.target.classList && e.target.classList.contains('visor-imagen')) {
      ajustarZoom(estado.visor.zoom >= 2 ? 1 : 2);
    }
  });

  $('#museoModalCerrar').addEventListener('click', function () {
    $('#modalMuseo').setAttribute('hidden', '');
    $('#museoIframe').src = 'about:blank';
  });
}

/* =====================================================================
   15. UTILIDADES DE RENDER: vacíos y tarjetas
   ===================================================================== */

function vacio(icono, titulo, texto, acciones) {
  return '<div class="vacio">' +
    '<span class="ico">' + icono + '</span>' +
    '<h3>' + esc(titulo) + '</h3>' +
    '<p>' + esc(texto) + '</p>' +
    (acciones || '') +
    '</div>';
}

function coincide(texto, consulta) {
  if (!consulta) return true;
  return normalizar(texto).indexOf(normalizar(consulta)) !== -1;
}

function tarjetasDocumento(lista, opciones) {
  var consulta = estado.busqueda[opciones.claveBusqueda] || '';
  var filtradas = lista.filter(function (r) {
    var texto = [r.titulo, r.autor, r.categoria, r.materia, r.descripcion, r.nombre].join(' ');
    return coincide(texto, consulta);
  });

  if (!filtradas.length) {
    if (!lista.length) {
      return vacio(opciones.emojiVacio, opciones.tituloVacio, opciones.textoVacio, opciones.accionesVacias || '');
    }
    return vacio('🔍', 'Sin resultados', 'Ningún elemento coincide con «' + consulta + '».');
  }

  return filtradas.map(function (r) {
    var esDoc = esDocente();
    var acciones = '<button type="button" class="btn btn-sm btn-primario" data-accion="ver">Ver</button>' +
      '<button type="button" class="btn btn-sm btn-soft" data-accion="descargar">Descargar</button>';
    if (esDoc) {
      if (opciones.permiteEditar) {
        acciones += '<button type="button" class="btn btn-sm btn-soft" data-accion="editar">Editar</button>';
      }
      acciones += '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar">Eliminar</button>';
    } else if (opciones.permiteBorrarPropio(r)) {
      acciones += '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar">Borrar</button>';
    }

    var tags = '';
    if (r.categoria) tags += '<span class="tag tag-azul">' + esc(r.categoria) + '</span>';
    if (r.materia) tags += '<span class="tag tag-azul">' + esc(r.materia) + '</span>';
    if (r.autor) tags += '<span class="tag">' + esc(r.autor) + '</span>';
    if (opciones.etiqueta(r)) tags += '<span class="tag ' + opciones.claseEtiqueta(r) + '">' + esc(opciones.etiqueta(r)) + '</span>';

    return '<article class="card" data-id="' + esc(r.id) + '">' +
      '<div class="card-media" data-accion="ver">' +
        '<span class="tipo-ico">' + iconoArchivo(r.nombre) + '</span>' +
        '<span class="tipo-tag">' + esc(tipoArchivo(r.nombre)) + '</span>' +
        (opciones.marcaDocente(r) ? '<span class="docente-tag">Docente</span>' : '') +
        '<span class="lupa" aria-hidden="true">🔍</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-titulo">' + destacar(r.titulo, consulta) + '</h3>' +
        (r.descripcion ? '<p class="card-desc">' + destacar(r.descripcion, consulta) + '</p>' : '') +
        (tags ? '<div class="card-meta">' + tags + '</div>' : '') +
        '<div class="card-mini"><span>' + esc(haceTiempo(r.fecha)) + '</span><span>' + esc(formatearTamano(r.tamano)) + '</span></div>' +
      '</div>' +
      '<div class="card-foot">' + acciones + '</div>' +
    '</article>';
  }).join('');
}

/* =====================================================================
   16. RENDER — SECCIÓN INICIO
   ===================================================================== */

function renderInicio() {
  var tareasVisibles = tareasDelUsuario();
  var stats = [
    { ico: '📚', val: estado.libros.length, nom: 'Libros' },
    { ico: '📝', val: tareasVisibles.length, nom: 'Tareas' },
    { ico: '📢', val: estado.avisos.length, nom: 'Anuncios' },
    { ico: '🖼️', val: estado.fotos.length, nom: 'Fotos' },
    { ico: '🏛️', val: estado.museos.length, nom: 'Museos' }
  ];
  if (esDocente()) {
    stats.push({ ico: '💾', val: formatearBytes(totalBytes()), nom: 'Archivos' });
  } else {
    stats.push({ ico: '📤', val: estado.tareas.filter(function (t) { return t.autor === nombreUsuario(); }).length, nom: 'Mis entregas' });
  }
  $('#statsGrid').innerHTML = stats.map(function (s) {
    return '<div class="stat"><span class="stat-ico">' + s.ico + '</span><div><div class="stat-val">' +
      esc(s.val) + '</div><div class="stat-nom">' + esc(s.nom) + '</div></div></div>';
  }).join('');

  var ultimos = estado.avisos.slice(0, 3);
  $('#inicioAnuncios').innerHTML = ultimos.length
    ? ultimos.map(tarjetaAviso).join('')
    : '<p style="color:var(--c-texto-tenue);font-size:.87rem">Todavía no hay anuncios publicados.</p>';
}

function renderBadges() {
  $('#badgeLibros').textContent = estado.libros.length;
  $('#badgeTareas').textContent = tareasDelUsuario().length;
  $('#badgeAnuncios').textContent = estado.avisos.length;
  $('#badgeFotos').textContent = estado.fotos.length;
  $('#badgeMuseos').textContent = estado.museos.length;
  $('#badgeAnuncios').classList.toggle('oculto', estado.avisos.length === 0);
}

/* =====================================================================
   17. RENDER — LIBROS
   ===================================================================== */

function categoriasDeLibros() {
  var set = {};
  estado.libros.forEach(function (l) { if (l.categoria) set[l.categoria] = true; });
  return Object.keys(set).sort();
}

function renderFiltrosLibros() {
  var cats = categoriasDeLibros();
  var html = '<button type="button" class="filtro' + (estado.filtros.libro === 'todos' ? ' activo' : '') + '" data-filtro="todos">Todas</button>';
  cats.forEach(function (c) {
    html += '<button type="button" class="filtro' + (estado.filtros.libro === c ? ' activo' : '') + '" data-filtro="' + esc(c) + '">' + esc(c) + '</button>';
  });
  $('#filtrosCategoria').innerHTML = cats.length ? html : '';
}

function librosFiltrados() {
  return estado.libros.filter(function (l) {
    if (estado.filtros.libro !== 'todos' && l.categoria !== estado.filtros.libro) return false;
    return true;
  });
}

function renderLibros() {
  renderFiltrosLibros();
  var lista = librosFiltrados();
  var accionesDoc = esDocente()
    ? '<div class="acciones"><button type="button" class="btn btn-primario" data-ir="libros">Ir a subir libros</button></div>'
    : '';
  $('#gridLibros').innerHTML = tarjetasDocumento(lista, {
    claveBusqueda: 'libro',
    emojiVacio: '📚',
    tituloVacio: 'La biblioteca está vacía',
    textoVacio: esDocente()
      ? 'Sube el primer libro en Word o PDF (hasta 1 GB) usando el formulario de arriba.'
      : 'Todavía el docente no ha compartido libros. Vuelve más tarde.',
    accionesVacias: accionesDoc,
    permiteEditar: true,
    permiteBorrarPropio: function () { return false; },
    marcaDocente: function () { return false; },
    etiqueta: function (r) { return r.autor ? r.autor : ''; },
    claseEtiqueta: function () { return ''; }
  });
}

function iniciarEdicionLibro(id) {
  var libro = estado.libros.filter(function (l) { return l.id === id; })[0];
  if (!libro) return;
  // Limpia cualquier archivo pendiente para no confundirse con el libro editado
  if (zonaLibro) zonaLibro.limpiarSilencioso();
  estado.editandoLibro = id;
  $('#libroTitulo').value = libro.titulo || '';
  $('#libroAutor').value = libro.autor || '';
  $('#libroCategoria').value = libro.categoria || '';
  $('#libroDesc').value = libro.descripcion || '';
  $('#btnGuardarLibro').textContent = 'Guardar cambios';
  $('#avisoEdicionLibro').classList.remove('oculto');
  $('#libroTitulo').focus();
  $('#sec-libros').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicionLibro() {
  estado.editandoLibro = null;
  $('#formLibro').reset();
  $('#btnGuardarLibro').textContent = 'Guardar libro';
  $('#avisoEdicionLibro').classList.add('oculto');
}

/* =====================================================================
   18. RENDER — TAREAS
   ===================================================================== */

function tareasDelUsuario() {
  if (esDocente()) return estado.tareas;
  if (estado.config.verTodasTareas) return estado.tareas;
  return estado.tareas.filter(function (t) {
    return t.ambito === 'actividad' || t.autor === nombreUsuario();
  });
}

function tiposDeTarea() {
  var set = {};
  tareasDelUsuario().forEach(function (t) {
    set[t.ambito === 'entrega' ? 'entregas' : 'actividades'] = true;
  });
  return Object.keys(set);
}

function renderFiltrosTarea() {
  var tipos = tiposDeTarea();
  if (!tipos.length) { $('#filtrosTarea').innerHTML = ''; return; }
  var html = '<button type="button" class="filtro' + (estado.filtros.tarea === 'todos' ? ' activo' : '') + '" data-filtro="todos">Todas</button>';
  html += '<button type="button" class="filtro' + (estado.filtros.tarea === 'actividades' ? ' activo' : '') + '" data-filtro="actividades">Actividades</button>';
  if (tipos.indexOf('entregas') !== -1) {
    html += '<button type="button" class="filtro' + (estado.filtros.tarea === 'entregas' ? ' activo' : '') + '" data-filtro="entregas">Entregas</button>';
  }
  $('#filtrosTarea').innerHTML = html;
}

function renderTareas() {
  renderFiltrosTarea();
  var lista = tareasDelUsuario().filter(function (t) {
    if (estado.filtros.tarea === 'actividades' && t.ambito === 'entrega') return false;
    if (estado.filtros.tarea === 'entregas' && t.ambito !== 'entrega') return false;
    return true;
  });

  var accionesDoc = esDocente()
    ? '<div class="acciones"><button type="button" class="btn btn-primario" data-ir="tareas">Ir a subir tareas</button></div>'
    : '';

  $('#gridTareas').innerHTML = tarjetasDocumento(lista, {
    claveBusqueda: 'tarea',
    emojiVacio: '📝',
    tituloVacio: 'Aún no hay tareas',
    textoVacio: esDocente()
      ? 'Publica una actividad o sube una entrega usando el formulario de arriba.'
      : 'Sube tu tarea en foto, Word o PDF usando el formulario de arriba.',
    accionesVacias: accionesDoc,
    permiteEditar: false,
    marcaDocente: function (r) { return r.ambito === 'actividad'; },
    etiqueta: function (r) { return r.ambito === 'entrega' ? (r.autor || 'Entrega') : 'Actividad'; },
    claseEtiqueta: function (r) { return r.ambito === 'actividad' ? 'tag-naranja' : 'tag-verde'; },
    permiteBorrarPropio: function (r) {
      return !esDocente() && estado.config.borrarTareaEstudiante === true && r.autor === nombreUsuario();
    }
  });
}

/* =====================================================================
   19. RENDER — ANUNCIOS
   ===================================================================== */

function tarjetaAviso(a) {
  var puedeBorrar = esDocente() || estado.config.borrarAvisosEstudiante === true;
  return '<article class="anuncio" data-id="' + esc(a.id) + '">' +
    '<div class="anuncio-head">' +
      '<h3 class="anuncio-titulo">' + esc(a.titulo) + '</h3>' +
      (puedeBorrar ? '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar">Eliminar</button>' : '') +
    '</div>' +
    '<div class="anuncio-cuerpo">' + esc(a.cuerpo) + '</div>' +
    '<div class="anuncio-meta"><span>📢 ' + esc(a.autor || 'Docente') + '</span><span>·</span><span title="' + esc(formatearFechaHora(a.fecha)) + '">🕒 ' + esc(formatearFecha(a.fecha)) + '</span><span>·</span><span>' + esc(haceTiempo(a.fecha)) + '</span></div>' +
  '</article>';
}

function renderAvisos() {
  if (!estado.avisos.length) {
    $('#listaAvisos').innerHTML = vacio('📢', 'No hay anuncios',
      esDocente() ? 'Publica el primer comunicado con el formulario de arriba.' : 'El docente aún no ha publicado ningún comunicado.');
    return;
  }
  $('#listaAvisos').innerHTML = estado.avisos.map(tarjetaAviso).join('');
}

/* =====================================================================
   20. RENDER — FOTOS
   ===================================================================== */

function fotosFiltradas() {
  var consulta = estado.busqueda.foto || '';
  return estado.fotos.filter(function (f) {
    return coincide([f.titulo, f.descripcion, f.nombre].join(' '), consulta);
  });
}

function renderFotos() {
  var lista = fotosFiltradas();
  if (!lista.length) {
    var hay = estado.fotos.length;
    $('#gridFotos').innerHTML = vacio('🖼️', hay ? 'Sin resultados' : 'La galería está vacía',
      hay ? 'Ninguna foto coincide con la búsqueda.'
         : (esDocente() ? 'Sube imágenes para compartir material visual con el curso.' : 'El docente aún no ha compartido fotos.'),
      esDocente() ? '<div class="acciones"><button type="button" class="btn btn-primario" data-ir="fotos">Ir a subir fotos</button></div>' : '');
    return;
  }

  $('#gridFotos').innerHTML = lista.map(function (f) {
    var puedeBorrar = esDocente();
    return '<article class="card card-foto" data-id="' + esc(f.id) + '">' +
      '<div class="card-media" data-accion="ver">' +
        '<img loading="lazy" data-miniatura="' + esc(f.archivoId) + '" alt="' + esc(f.titulo || f.nombre) + '">' +
        '<span class="lupa" aria-hidden="true">🔍</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-titulo">' + destacar(f.titulo || f.nombre, estado.busqueda.foto) + '</h3>' +
        '<div class="card-mini"><span>' + esc(haceTiempo(f.fecha)) + '</span><span>' + esc(formatearTamano(f.tamano)) + '</span></div>' +
      '</div>' +
      '<div class="card-foot">' +
        '<button type="button" class="btn btn-sm btn-primario" data-accion="ver">Ver</button>' +
        '<button type="button" class="btn btn-sm btn-soft" data-accion="descargar">Descargar</button>' +
        (puedeBorrar ? '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar">Eliminar</button>' : '') +
      '</div>' +
    '</article>';
  }).join('');

  cargarMiniaturas(lista);
}

/** Carga las miniaturas de las fotos visibles desde IndexedDB */
function cargarMiniaturas(lista) {
  void lista;
  $$('#gridFotos img[data-miniatura]').forEach(function (elemento) {
    var id = elemento.getAttribute('data-miniatura');
    if (!id || elemento.dataset.cargada === '1') return;
    archivoLeer(id).then(function (datos) {
      if (!datos || !datos.blob) return;
      var url = URL.createObjectURL(datos.blob);
      elemento.dataset.cargada = '1';
      elemento.src = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function () { /* sin miniatura */ });
  });
}

/* =====================================================================
   21. RENDER — MUSEOS VIRTUALES
   ===================================================================== */

function museosFiltrados() {
  return estado.museos.filter(function (m) {
    if (estado.filtros.museo !== 'todos' && m.categoria !== estado.filtros.museo) return false;
    return true;
  });
}

function renderMuseos() {
  var lista = museosFiltrados();
  var consulta = estado.busqueda.museo || '';
  var filtrados = lista.filter(function (m) {
    return coincide([m.titulo, m.descripcion, m.url, m.categoria].join(' '), consulta);
  });

  if (!filtrados.length) {
    var hay = estado.museos.length;
    $('#gridMuseos').innerHTML = vacio('🏛️', hay ? 'Sin resultados' : 'Aún no hay museos virtuales',
      hay ? 'Ningún enlace coincide con la búsqueda.'
         : (esDocente() ? 'Agrega enlaces a museos y recorridos virtuales para enriquecer las clases.' : 'El docente aún no ha agregado recorridos virtuales.'),
      esDocente() ? '<div class="acciones"><button type="button" class="btn btn-primario" data-ir="museos">Ir a agregar museos</button></div>' : '');
    return;
  }

  $('#gridMuseos').innerHTML = filtrados.map(function (m) {
    var url = urlSegura(m.url);
    var portada = '';
    var imgSegura = urlSegura(m.imagenUrl || '');
    if (imgSegura) {
      portada = '<img loading="lazy" src="' + esc(imgSegura) + '" alt="" onerror="this.remove()" referrerpolicy="no-referrer">';
    }
    var acciones = '<button type="button" class="btn btn-sm btn-primario" data-accion="abrir">Visitar</button>' +
      '<button type="button" class="btn btn-sm btn-soft" data-accion="incrustar">Ver aquí</button>' +
      '<a class="btn btn-sm btn-soft" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="Abrir en una pestaña nueva">↗</a>';
    if (esDocente()) {
      acciones += '<button type="button" class="btn btn-sm btn-peligro" data-accion="eliminar">Eliminar</button>';
    }
    return '<article class="card card-museo" data-id="' + esc(m.id) + '">' +
      '<div class="card-media">' + (portada || '<span class="tipo-ico">🏛️</span>') + '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-titulo">' + destacar(m.titulo, consulta) + '</h3>' +
        (m.descripcion ? '<p class="card-desc">' + destacar(m.descripcion, consulta) + '</p>' : '') +
        '<div class="card-meta"><span class="tag tag-azul">' + esc(dominioDe(url)) + '</span>' +
        (m.categoria ? '<span class="tag">' + esc(m.categoria) + '</span>' : '') + '</div>' +
        '<div class="card-mini"><span>' + esc(haceTiempo(m.fecha)) + '</span></div>' +
      '</div>' +
      '<div class="card-foot">' + acciones + '</div>' +
    '</article>';
  }).join('');
}

function dominioDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (e) { return 'enlace'; }
}

function abrirMuseoExterno(id, incrustar) {
  var museo = estado.museos.filter(function (m) { return m.id === id; })[0];
  if (!museo) return;
  var url = urlSegura(museo.url);
  if (!url) { toast('El enlace de este museo no es válido.', 'error'); return; }
  if (!incrustar) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  $('#museoModalTitulo').textContent = museo.titulo;
  $('#museoModalSub').textContent = url;
  $('#museoModalAbrir').href = url;
  $('#modalMuseo').removeAttribute('hidden');
  $('#museoIframe').src = url;
}

/* =====================================================================
   22. RENDER — AJUSTES Y ALMACENAMIENTO
   ===================================================================== */

function totalBytes() {
  var suma = 0;
  estado.libros.forEach(function (r) { suma += Number(r.tamano) || 0; });
  estado.tareas.forEach(function (r) { suma += Number(r.tamano) || 0; });
  estado.fotos.forEach(function (r) { suma += Number(r.tamano) || 0; });
  return suma;
}

function aplicarConfigEnUI() {
  var c = estado.config;
  $('#cfgNombre').value = c.nombre || '';
  $('#cfgCurso').value = c.curso || '';
  $('#cfgLimite').value = String(c.limite);
  $('#cfgBorrarTarea').checked = c.borrarTareaEstudiante === true;
  $('#cfgVerTodas').checked = c.verTodasTareas === true;
  $('#cfgVerAnuncios').checked = c.borrarAvisosEstudiante === true;
  var limite = formatearBytes(c.limite);
  $('#chipMaxLibro').textContent = limite;
  $('#chipMaxTarea').textContent = limite;
  $('#chipMaxFoto').textContent = limite;
  $('#marcaNombre').textContent = c.nombre || 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO';
  $('#footTexto').textContent = (c.nombre || 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO') + (c.curso ? ' · ' + c.curso : '');
}

function infoAlmacenamiento() {
  if (navigator.storage && typeof navigator.storage.estimate === 'function') {
    return navigator.storage.estimate().then(function (est) {
      var uso = est.usage || 0;
      var cuota = est.quota || 0;
      return { uso: uso, cuota: cuota, pct: cuota ? Math.min(100, (uso / cuota) * 100) : 0 };
    }).catch(function () { return { uso: totalBytes(), cuota: 0, pct: 0 }; });
  }
  return Promise.resolve({ uso: totalBytes(), cuota: 0, pct: 0 });
}

function renderAlmacenamiento() {
  return infoAlmacenamiento().then(function (info) {
    var pct = Math.max(info.pct, 0);
    $('#almacenMiniBarra').style.width = pct.toFixed(1) + '%';
    $('#almacenTxt').textContent = formatearBytes(info.uso) + (info.cuota ? ' de ' + formatearBytes(info.cuota) : '');
    $('#almacenBarra').style.width = Math.min(100, pct).toFixed(1) + '%';

    var nota;
    if (info.cuota) {
      nota = 'Tus ' + formatearBytes(totalBytes()) + ' de archivos ocupan el ' + pct.toFixed(1) + '% del espacio disponible en este navegador.';
    } else {
      nota = 'Archivos guardados: ' + formatearBytes(totalBytes()) + '. El navegador no informa la cuota total.';
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (ok) {
        $('#almacenNota').textContent = nota + (ok ? ' Almacenamiento permanente activo.' : '');
      }).catch(function () { $('#almacenNota').textContent = nota; });
    } else {
      $('#almacenNota').textContent = nota;
    }
    $('#almacenMiniTxt').textContent = formatearBytes(info.uso);
    $('#almacenMiniNota').textContent = nota;
    return info;
  }).catch(function () { return null; });
}

function renderAjustes() {
  aplicarConfigEnUI();
  renderAlmacenamiento();
}

function pedirAlmacenamientoPersistente() {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
  navigator.storage.persist().catch(function () { /* sin soporte o denegado */ });
}

function solicitarPersistente() {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
    toast('Este navegador no admite almacenamiento permanente.', 'alerta');
    return;
  }
  navigator.storage.persist().then(function (ok) {
    if (ok) {
      toast('Almacenamiento permanente activado. El navegador no borrará tus archivos automáticamente.', 'ok', 6000);
    } else {
      toast('El navegador denegó el almacenamiento permanente. Tus datos podrían borrarse si libera espacio.', 'alerta', 7000);
    }
    renderAlmacenamiento();
  }).catch(function () { toast('No se pudo solicitar almacenamiento permanente.', 'error'); });
}

/* =====================================================================
   23. RENDER GLOBAL
   ===================================================================== */

function renderSeccion(seccion) {
  switch (seccion) {
    case 'inicio': renderInicio(); renderAlmacenamiento(); break;
    case 'libros': renderLibros(); break;
    case 'tareas': renderTareas(); break;
    case 'anuncios': renderAvisos(); break;
    case 'fotos': renderFotos(); break;
    case 'museos': renderMuseos(); break;
    case 'ajustes': renderAjustes(); break;
  }
}

function renderTodo() {
  renderBadges();
  renderSeccion(estado.seccion);
  renderLibros();
  renderTareas();
  renderAvisos();
  renderFotos();
  renderMuseos();
  if (estado.seccion === 'inicio') { renderInicio(); renderAlmacenamiento(); }
  if (estado.seccion === 'ajustes') renderAjustes();
}

/* =====================================================================
   24. ACCIONES: LIBROS
   ===================================================================== */

var zonaLibro = null;

function configurarLibros() {
  zonaLibro = crearZonaArchivo({
    drop: '#dropLibro',
    input: '#inputLibro',
    txt: '#dropLibroTxt',
    info: '#dropLibroInfo',
    textoPorDefecto: 'Arrastra el archivo aquí o haz clic para elegir',
    infoPorDefecto: '.doc · .docx · .pdf',
    alLimpiar: cancelarEdicionLibro
  });

  $('#formLibro').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!esDocente()) { toast('Solo el docente puede manage libros.', 'alerta'); return; }

    var archivos = zonaLibro.archivos();
    var titulo = $('#libroTitulo').value.trim();
    var autor = $('#libroAutor').value.trim();
    var categoria = $('#libroCategoria').value.trim();
    var descripcion = $('#libroDesc').value.trim();

    if (!titulo) { toast('Escribe el título del libro.', 'alerta'); $('#libroTitulo').focus(); return; }

    // --- Edición de metadatos (sin cambiar el archivo) ---
    if (estado.editandoLibro) {
      var libro = estado.libros.filter(function (l) { return l.id === estado.editandoLibro; })[0];
      if (!libro) { cancelarEdicionLibro(); return; }
      if (archivos.length) {
        var errorArchivo = validarArchivo(archivos[0], EXT_LIBROS);
        if (errorArchivo) { toast(errorArchivo, 'error', 7000); return; }
      }
      var cambios = { titulo: titulo, autor: autor, categoria: categoria, descripcion: descripcion, modificado: ahora() };
      if (archivos.length) {
        cambios.nombre = archivos[0].name;
        cambios.tamano = archivos[0].size;
        cambios.mime = mimeDe(archivos[0].name);
      }
      progresoMostrar('Actualizando libro…', 'Guardando los cambios.');
      if (archivos.length) {
        var nuevoId = uid();
        archivoGuardar({ id: nuevoId, nombre: archivos[0].name, mime: cambios.mime, tamano: archivos[0].size, fecha: ahora(), blob: archivos[0] })
          .then(function () {
            var viejo = libro.archivoId;
            Object.keys(cambios).forEach(function (k) { libro[k] = cambios[k]; });
            libro.archivoId = nuevoId;
            guardarLibros();
            return archivoBorrar(viejo);
          })
          .then(function () { finalizarEdicion(); })
          .catch(function (err) { progresoOcultar(); console.error(err); toast('No se pudo actualizar el libro: ' + err.message, 'error', 7000); });
        return;
      }
      Object.keys(cambios).forEach(function (k) { libro[k] = cambios[k]; });
      guardarLibros();
      finalizarEdicion();
      return;
    }

    // --- Libro nuevo ---
    if (!archivos.length) { toast('Selecciona un archivo Word o PDF.', 'alerta'); return; }
    var err = validarArchivo(archivos[0], EXT_LIBROS);
    if (err) { toast(err, 'error', 7000); return; }

    var archivo = archivos[0];
    var archivoId = uid();
    progresoMostrar('Subiendo libro…', 'Guardando "' + archivo.name + '" (' + formatearBytes(archivo.size) + ').');

    archivoGuardar({
      id: archivoId, nombre: archivo.name, mime: mimeDe(archivo.name),
      tamano: archivo.size, fecha: ahora(), blob: archivo
    }).then(function () {
      estado.libros.unshift({
        id: uid(), titulo: titulo, autor: autor, categoria: categoria,
        descripcion: descripcion, nombre: archivo.name, mime: mimeDe(archivo.name),
        tamano: archivo.size, archivoId: archivoId, fecha: ahora(), subidoPor: nombreUsuario()
      });
      guardarLibros();
      finalizarEdicion();
      toast('Libro «' + titulo + '» agregado a la biblioteca.', 'ok');
      renderAlmacenamiento();
    }).catch(function (e) {
      progresoOcultar();
      console.error(e);
      toast('No se pudo guardar el archivo: ' + (e && e.message ? e.message : 'error desconocido'), 'error', 8000);
    });
  });

  $('#btnCancelarEdicion').addEventListener('click', cancelarEdicionLibro);
  $('#btnLimpiarLibro').addEventListener('click', function () { setTimeout(cancelarEdicionLibro, 0); });

  $('#buscarLibro').addEventListener('input', function () { estado.busqueda.libro = this.value.trim(); renderLibros(); });

  $('#filtrosCategoria').addEventListener('click', function (e) {
    var btn = e.target.closest('.filtro');
    if (!btn) return;
    estado.filtros.libro = btn.getAttribute('data-filtro');
    renderLibros();
  });

  $('#gridLibros').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion]');
    if (!btn) return;
    var tarjeta = btn.closest('.card');
    if (!tarjeta) return;
    var id = tarjeta.getAttribute('data-id');
    var accion = btn.getAttribute('data-accion');
    var libro = estado.libros.filter(function (l) { return l.id === id; })[0];
    if (!libro) return;
    if (accion === 'ver') abrirVisor(libro);
    else if (accion === 'descargar') descargarRegistro(libro);
    else if (accion === 'editar' && esDocente()) iniciarEdicionLibro(id);
    else if (accion === 'eliminar' && esDocente()) {
      confirmar('Eliminar libro', 'Se eliminará «' + libro.titulo + '» y su archivo. Esta acción no se puede deshacer.', 'Eliminar', true)
        .then(function (ok) {
          if (!ok) return;
          archivoBorrar(libro.archivoId).catch(function () { /* ya no estaba */ });
          estado.libros = estado.libros.filter(function (l) { return l.id !== id; });
          guardarLibros();
          if (estado.editandoLibro === id) cancelarEdicionLibro();
          renderTodo();
          renderAlmacenamiento();
          toast('Libro eliminado.', 'ok');
        });
    }
  });
}

function finalizarEdicion() {
  progresoOcultar();
  zonaLibro.limpiar();
  $('#formLibro').reset();
  estado.editandoLibro = null;
  $('#btnGuardarLibro').textContent = 'Guardar libro';
  $('#avisoEdicionLibro').classList.add('oculto');
  renderTodo();
}

/* =====================================================================
   25. ACCIONES: TAREAS
   ===================================================================== */

var zonaTarea = null;

function configurarTareas() {
  zonaTarea = crearZonaArchivo({
    drop: '#dropTarea',
    input: '#inputTarea',
    txt: '#dropTareaTxt',
    info: '#dropTareaInfo',
    textoPorDefecto: 'Arrastra tu tarea aquí o haz clic para elegir',
    infoPorDefecto: '.jpg · .png · .doc · .docx · .pdf'
  });

  $('#formTarea').addEventListener('submit', function (e) {
    e.preventDefault();
    var archivos = zonaTarea.archivos();
    var titulo = $('#tareaTitulo').value.trim();
    var materia = $('#tareaMateria').value.trim();
    var descripcion = $('#tareaDesc').value.trim();
    var radio = document.querySelector('input[name="tareaAmbito"]:checked');
    var ambito = esDocente() ? (radio ? radio.value : 'actividad') : 'entrega';

    if (!titulo) { toast('Escribe el título de la tarea.', 'alerta'); $('#tareaTitulo').focus(); return; }
    if (!archivos.length) { toast('Selecciona el archivo de la tarea.', 'alerta'); return; }

    var errores = [];
    var validos = [];
    archivos.forEach(function (f) {
      var err = validarArchivo(f, EXT_TAREAS);
      if (err) errores.push(err); else validos.push(f);
    });
    if (!validos.length) { toast(errores[0], 'error', 7000); return; }

    var autorEstudiante = $('#tareaAutor') ? $('#tareaAutor').value.trim() : '';
    var nombreAutor = esDocente() ? 'Docente' : (autorEstudiante || nombreUsuario());
    if (!esDocente() && autorEstudiante) {
      escribirClave(CLAVES.perfil, { nombre: autorEstudiante });
      estado.sesion.nombre = autorEstudiante;
      escribirClave(CLAVES.sesion, estado.sesion);
    }

    progresoMostrar('Subizando tarea…', validos.length === 1
      ? 'Guardando «' + validos[0].name + '» (' + formatearBytes(validos[0].size) + ').'
      : 'Guardando ' + validos.length + ' archivos.');

    var nuevas = [];

    Promise.all(validos.map(function (f) {
      var archivoId = uid();
      return archivoGuardar({ id: archivoId, nombre: f.name, mime: mimeDe(f.name), tamano: f.size, fecha: ahora(), blob: f })
        .then(function () {
          return {
            id: uid(),
            titulo: validos.length > 1 ? titulo + ' (' + f.name + ')' : titulo,
            materia: materia, descripcion: descripcion, ambito: ambito,
            autor: nombreAutor, nombre: f.name, mime: mimeDe(f.name), tamano: f.size,
            archivoId: archivoId, fecha: ahora(), subidoPor: nombreUsuario()
          };
        });
    })).then(function (creadas) {
      nuevas = creadas;
      estado.tareas = nuevas.concat(estado.tareas);
      guardarTareas();
      progresoOcultar();
      zonaTarea.limpiar();
      $('#formTarea').reset();
      if ($('#tareaAutor')) $('#tareaAutor').value = nombreUsuario();
      renderTodo();
      renderAlmacenamiento();
      toast(validos.length === 1 ? 'Tarea «' + titulo + '» guardada.' : validos.length + ' archivos guardados.', 'ok');
      if (errores.length) toast(errores.join(' '), 'alerta', 8000);
    }).catch(function (err) {
      progresoOcultar();
      console.error(err);
      toast('No se pudo guardar la tarea: ' + (err && err.message ? err.message : 'error desconocido'), 'error', 8000);
    });
  });

  $('#buscarTarea').addEventListener('input', function () { estado.busqueda.tarea = this.value.trim(); renderTareas(); });

  $('#filtrosTarea').addEventListener('click', function (e) {
    var btn = e.target.closest('.filtro');
    if (!btn) return;
    estado.filtros.tarea = btn.getAttribute('data-filtro');
    renderTareas();
  });

  $('#gridTareas').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion]');
    if (!btn) return;
    var tarjeta = btn.closest('.card');
    if (!tarjeta) return;
    var id = tarjeta.getAttribute('data-id');
    var accion = btn.getAttribute('data-accion');
    var tarea = estado.tareas.filter(function (t) { return t.id === id; })[0];
    if (!tarea) return;

    if (accion === 'ver') abrirVisor(tarea);
    else if (accion === 'descargar') descargarRegistro(tarea);
    else if (accion === 'eliminar') {
      var propio = tarea.autor === nombreUsuario();
      if (!esDocente() && !(estado.config.borrarTareaEstudiante === true && propio)) {
        toast('No tienes permiso para eliminar esta tarea.', 'alerta');
        return;
      }
      confirmar('Eliminar tarea', 'Se eliminará «' + tarea.titulo + '» y su archivo. Esta acción no se puede deshacer.', 'Eliminar', true)
        .then(function (ok) {
          if (!ok) return;
          archivoBorrar(tarea.archivoId).catch(function () { /* ya no estaba */ });
          estado.tareas = estado.tareas.filter(function (t) { return t.id !== id; });
          guardarTareas();
          renderTodo();
          renderAlmacenamiento();
          toast('Tarea eliminada.', 'ok');
        });
    }
  });
}

/* =====================================================================
   26. ACCIONES: ANUNCIOS
   ===================================================================== */

function configurarAnuncios() {
  $('#formAviso').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!esDocente()) { toast('Solo el docente puede publicar anuncios.', 'alerta'); return; }
    var titulo = $('#avisoTitulo').value.trim();
    var cuerpo = $('#avisoCuerpo').value.trim();
    if (!titulo || !cuerpo) { toast('Completa el título y el mensaje del anuncio.', 'alerta'); return; }

    estado.avisos.unshift({ id: uid(), titulo: titulo, cuerpo: cuerpo, autor: nombreUsuario(), fecha: ahora() });
    guardarAvisos();
    $('#formAviso').reset();
    renderTodo();
    toast('Anuncio publicado.', 'ok');
  });

  function manejarBorrarAviso(e) {
    var btn = e.target.closest('[data-accion="eliminar"]');
    if (!btn) return;
    var tarjeta = btn.closest('.anuncio');
    if (!tarjeta) return;
    var id = tarjeta.getAttribute('data-id');
    var aviso = estado.avisos.filter(function (a) { return a.id === id; })[0];
    if (!aviso) return;
    if (!esDocente() && estado.config.borrarAvisosEstudiante !== true) {
      toast('No tienes permiso para eliminar anuncios.', 'alerta');
      return;
    }
    confirmar('Eliminar anuncio', 'Se eliminará «' + aviso.titulo + '».', 'Eliminar', true).then(function (ok) {
      if (!ok) return;
      estado.avisos = estado.avisos.filter(function (a) { return a.id !== id; });
      guardarAvisos();
      renderTodo();
      toast('Anuncio eliminado.', 'ok');
    });
  }

  $('#listaAvisos').addEventListener('click', manejarBorrarAviso);
  $('#inicioAnuncios').addEventListener('click', manejarBorrarAviso);
}

/* =====================================================================
   27. ACCIONES: FOTOS
   ===================================================================== */

var zonaFoto = null;

function configurarFotos() {
  zonaFoto = crearZonaArchivo({
    drop: '#dropFoto',
    input: '#inputFoto',
    txt: '#dropFotoTxt',
    info: null,
    textoPorDefecto: 'Arrastra las imágenes o haz clic para elegir',
    infoPorDefecto: '',
    alCambiar: function (files) {
      var total = files.reduce(function (s, f) { return s + f.size; }, 0);
      $('#notaFotos').textContent = files.length
        ? files.length + ' imagen(es) seleccionada(s) · ' + formatearBytes(total)
        : '';
    }
  });

  $('#formFoto').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!esDocente()) { toast('Solo el docente puede subir fotos.', 'alerta'); return; }
    var archivos = zonaFoto.archivos();
    var titulo = $('#fotoTitulo').value.trim();
    if (!archivos.length) { toast('Selecciona al menos una imagen.', 'alerta'); return; }

    var validos = [];
    var errores = [];
    archivos.forEach(function (f) {
      var err = validarArchivo(f, EXT_FOTOS);
      if (err) errores.push(err); else validos.push(f);
    });
    if (!validos.length) { toast(errores[0], 'error', 7000); return; }

    progresoMostrar('Subiendo fotos…', validos.length + ' imagen(es) · ' + formatearBytes(validos.reduce(function (s, f) { return s + f.size; }, 0)));

    Promise.all(validos.map(function (f) {
      var archivoId = uid();
      return archivoGuardar({ id: archivoId, nombre: f.name, mime: mimeDe(f.name), tamano: f.size, fecha: ahora(), blob: f })
        .then(function () {
          return {
            id: uid(), titulo: titulo || f.name, descripcion: '', nombre: f.name,
            mime: mimeDe(f.name), tamano: f.size, archivoId: archivoId,
            fecha: ahora(), subidoPor: nombreUsuario()
          };
        });
    })).then(function (nuevas) {
      estado.fotos = nuevas.reverse().concat(estado.fotos);
      guardarFotos();
      progresoOcultar();
      zonaFoto.limpiar();
      $('#formFoto').reset();
      $('#notaFotos').textContent = '';
      renderTodo();
      renderAlmacenamiento();
      toast(nuevas.length === 1 ? 'Foto subida.' : nuevas.length + ' fotos subidas.', 'ok');
      if (errores.length) toast(errores.join(' '), 'alerta', 8000);
    }).catch(function (err) {
      progresoOcultar();
      console.error(err);
      toast('No se pudieron subir las fotos: ' + (err && err.message ? err.message : 'error desconocido'), 'error', 8000);
    });
  });

  $('#buscarFoto').addEventListener('input', function () { estado.busqueda.foto = this.value.trim(); renderFotos(); });

  $('#gridFotos').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion]');
    if (!btn) return;
    var tarjeta = btn.closest('.card');
    if (!tarjeta) return;
    var id = tarjeta.getAttribute('data-id');
    var foto = estado.fotos.filter(function (f) { return f.id === id; })[0];
    if (!foto) return;
    var accion = btn.getAttribute('data-accion');
    if (accion === 'ver') abrirVisor(foto);
    else if (accion === 'descargar') descargarRegistro(foto);
    else if (accion === 'eliminar' && esDocente()) {
      confirmar('Eliminar foto', 'Se eliminará «' + (foto.titulo || foto.nombre) + '».', 'Eliminar', true).then(function (ok) {
        if (!ok) return;
        archivoBorrar(foto.archivoId).catch(function () { /* ya no estaba */ });
        estado.fotos = estado.fotos.filter(function (f) { return f.id !== id; });
        guardarFotos();
        renderTodo();
        renderAlmacenamiento();
        toast('Foto eliminada.', 'ok');
      });
    }
  });
}

/* =====================================================================
   28. ACCIONES: MUSEOS
   ===================================================================== */

function configurarMuseos() {
  $('#formMuseo').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!esDocente()) { toast('Solo el docente puede agregar museos.', 'alerta'); return; }
    var titulo = $('#museoTitulo').value.trim();
    var url = normalizarEnlace($('#museoUrl').value);
    var imagenUrl = normalizarEnlace($('#museoImg').value);
    var descripcion = $('#museoDesc').value.trim();

    if (!titulo) { toast('Escribe el nombre del museo.', 'alerta'); $('#museoTitulo').focus(); return; }
    if (!url) { toast('El enlace debe ser una dirección web válida (ej. https://museodelprado.es).', 'alerta', 6000); $('#museoUrl').focus(); return; }
    if (imagenUrl && !urlSegura(imagenUrl)) { toast('La imagen de portada debe ser un enlace válido (http/https).', 'alerta'); $('#museoImg').focus(); return; }

    var duplicado = estado.museos.some(function (m) { return urlSegura(m.url) === url; });
    if (duplicado) { toast('Ese enlace ya está en la lista.', 'alerta'); return; }

    estado.museos.unshift({
      id: uid(), titulo: titulo, url: url, imagenUrl: imagenUrl || '',
      descripcion: descripcion, categoria: '', fecha: ahora(), agregadoPor: nombreUsuario()
    });
    guardarMuseos();
    $('#formMuseo').reset();
    renderTodo();
    toast('Museo virtual agregado.', 'ok');
  });

  $('#buscarMuseo').addEventListener('input', function () { estado.busqueda.museo = this.value.trim(); renderMuseos(); });

  $('#gridMuseos').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion="eliminar"]');
    if (!btn || !esDocente()) return;
    var tarjeta = btn.closest('.card');
    if (!tarjeta) return;
    var id = tarjeta.getAttribute('data-id');
    var museo = estado.museos.filter(function (m) { return m.id === id; })[0];
    if (!museo) return;
    confirmar('Eliminar museo virtual', 'Se quitará «' + museo.titulo + '» de la lista.', 'Eliminar', true).then(function (ok) {
      if (!ok) return;
      estado.museos = estado.museos.filter(function (m) { return m.id !== id; });
      guardarMuseos();
      renderTodo();
      toast('Museo virtual eliminado.', 'ok');
    });
  });

  $('#gridMuseos').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accion="abrir"], [data-accion="incrustar"]');
    if (!btn) return;
    var tarjeta = btn.closest('.card');
    if (!tarjeta) return;
    abrirMuseoExterno(tarjeta.getAttribute('data-id'), btn.getAttribute('data-accion') === 'incrustar');
  });
}

/* =====================================================================
   29. ACCIONES: AJUSTES, RESPALDO E IMPORTACIÓN
   ===================================================================== */

function configurarAjustes() {
  $('#formConfig').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!esDocente()) return;
    var limite = parseInt($('#cfgLimite').value, 10);
    if (!limite || limite < 1048576) limite = LIMITE_POR_DEFECTO;
    estado.config = {
      nombre: $('#cfgNombre').value.trim() || 'Hemeroteca de la I.E. SAN JOSÉ DE PUNO',
      curso: $('#cfgCurso').value.trim(),
      limite: limite,
      borrarTareaEstudiante: $('#cfgBorrarTarea').checked,
      verTodasTareas: $('#cfgVerTodas').checked,
      borrarAvisosEstudiante: $('#cfgVerAnuncios').checked
    };
    escribirClave(CLAVES.config, estado.config);
    aplicarConfigEnUI();
    renderTodo();
    toast('Ajustes guardados.', 'ok');
  });

  $('#btnPersistente').addEventListener('click', solicitarPersistente);
  $('#btnExportarMeta').addEventListener('click', exportarMetadatos);
  $('#btnExportarTodo').addEventListener('click', exportarCompleto);
  $('#btnImportar').addEventListener('click', function () { $('#inputImportar').click(); });

  $('#inputImportar').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    if (f.size > 400 * 1024 * 1024) { toast('El archivo de respaldo es demasiado grande.', 'error'); return; }
    f.text().then(function (texto) {
      var datos;
      try { datos = JSON.parse(texto); }
      catch (e) { toast('El archivo no es un respaldo válido (JSON incorrecto).', 'error', 7000); return; }
      confirmar('Importar respaldo',
        'Se reemplazarán los datos actuales por los del respaldo («' + (datos.libros || []).length + ' libros, ' +
        (datos.tareas || []).length + ' tareas, ' + (datos.fotos || []).length + ' fotos).',
        'Importar', true).then(function (ok) {
          if (ok) importarRespaldo(datos);
        });
    }).catch(function () { toast('No se pudo leer el archivo.', 'error'); });
  });

  $('#btnBorrarTodo').addEventListener('click', function () {
    confirmar('Borrar todos los datos',
      'Se eliminarán TODOS los libros, tareas, anuncios, fotos y museos de este navegador. Esta acción no se puede deshacer. Te recomendamos exportar una copia de seguridad primero.',
      'Borrar todo', true).then(function (ok) {
        if (!ok) return;
        progresoMostrar('Borrando datos…', 'Limpiando el almacenamiento del navegador.');
        archivoVaciar().catch(function () { /* seguimos */ }).then(function () {
          estado.libros = []; estado.tareas = []; estado.avisos = []; estado.fotos = []; estado.museos = [];
          guardarLibros(); guardarTareas(); guardarAvisos(); guardarFotos(); guardarMuseos();
          progresoOcultar();
          renderTodo();
          renderAlmacenamiento();
          toast('Todos los datos fueron eliminados.', 'ok');
        });
      });
  });
}

function nombreRespaldo(sufijo) {
  var d = new Date();
  var sello = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
              '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  return 'hemeroteca-' + sufijo + '-' + sello + '.json';
}

function exportarMetadatos() {
  var datos = {
    formato: 'hemeroteca-backup',
    version: 1,
    conArchivos: false,
    generado: ahora(),
    config: estado.config,
    libros: estado.libros,
    tareas: estado.tareas,
    avisos: estado.avisos,
    fotos: estado.fotos,
    museos: estado.museos
  };
  descargar(nombreRespaldo('metadatos'), JSON.stringify(datos, null, 2), 'application/json');
  toast('Respaldo de metadatos descargado.', 'ok');
}

function exportarCompleto() {
  var mb = totalBytes() / (1024 * 1024);
  if (mb > LIMITE_BACKUP_MB) {
    confirmar('Respaldo muy pesado',
      'Tus archivos ocupan ' + formatearBytes(totalBytes()) + '. El navegador no puede crear un JSON tan grande de forma segura (límite ' + LIMITE_BACKUP_MB + ' MB). Se recomienda exportar solo los metadatos.',
      'Exportar solo metadatos', false).then(function (ok) { if (ok) exportarMetadatos(); });
    return;
  }
  confirmar('Exportar copia completa',
    'Se generará un archivo JSON con los metadatos y los archivos binarios embebidos en base64. Tamaño estimado: ' + formatearBytes(totalBytes()) + '.',
    'Exportar', false).then(function (ok) {
      if (!ok) return;
      progresoMostrar('Generando respaldo…', 'Codificando archivos…');
      var archivos = [];
      [].concat(estado.libros, estado.tareas, estado.fotos).forEach(function (r) {
        if (r.archivoId && archivos.indexOf(r.archivoId) === -1) archivos.push(r.archivoId);
      });

      Promise.all(archivos.map(function (id) {
        return archivoLeer(id).then(function (d) {
          if (!d || !d.blob) return;
          return d.blob.arrayBuffer().then(function (buf) {
            return new Promise(function (res) {
              var lector = new FileReader();
              lector.onload = function () { res({ id: id, nombre: d.nombre, mime: d.mime, tamano: d.tamano, base64: lector.result }); };
              lector.onerror = function () { res(null); };
              lector.readAsDataURL(d.blob);
            });
          });
        }).catch(function () { return null; });
      })).then(function (lista) {
        var datos = {
          formato: 'hemeroteca-backup',
          version: 1,
          conArchivos: true,
          generado: ahora(),
          config: estado.config,
          libros: estado.libros,
          tareas: estado.tareas,
          avisos: estado.avisos,
          fotos: estado.fotos,
          museos: estado.museos,
          archivos: lista.filter(Boolean)
        };
        progresoOcultar();
        descargar(nombreRespaldo('completo'), JSON.stringify(datos), 'application/json');
        toast('Copia completa descargada.', 'ok', 6000);
      }).catch(function (err) {
        progresoOcultar();
        console.error(err);
        toast('No se pudo generar la copia completa: ' + (err && err.message ? err.message : 'error'), 'error', 8000);
      });
    });
}

function importarRespaldo(datos) {
  if (!datos || datos.formato !== 'hemeroteca-backup') {
    toast('El archivo no corresponde a un respaldo de la Hemeroteca.', 'error', 7000);
    return;
  }
  progresoMostrar('Importando respaldo…', 'Restaurando datos…');
  archivoVaciar().catch(function () { /* seguimos */ }).then(function () {
    if (datos.config) escribirClave(CLAVES.config, datos.config);
    if (datos.conArchivos && Array.isArray(datos.archivos)) {
      return datos.archivos.reduce(function (cadena, a) {
        return cadena.then(function () {
          if (!a || !a.base64) return null;
          try {
            var partes = String(a.base64).split(',');
            var binario = atob(partes[1] || '');
            var bytes = new Uint8Array(binario.length);
            for (var i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
            var blob = new Blob([bytes], { type: a.mime || 'application/octet-stream' });
            return archivoGuardar({ id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, fecha: ahora(), blob: blob });
          } catch (e) { console.warn('[Hemeroteca] Archivo de respaldo dañado:', a.nombre, e); return null; }
        });
      }, Promise.resolve());
    }
    return null;
  }).then(function () {
    estado.libros = Array.isArray(datos.libros) ? datos.libros : [];
    estado.tareas = Array.isArray(datos.tareas) ? datos.tareas : [];
    estado.avisos = Array.isArray(datos.avisos) ? datos.avisos : [];
    estado.fotos = Array.isArray(datos.fotos) ? datos.fotos : [];
    estado.museos = Array.isArray(datos.museos) ? datos.museos : [];
    guardarLibros(); guardarTareas(); guardarAvisos(); guardarFotos(); guardarMuseos();
    estado.config = cargarConfig();
    progresoOcultar();
    aplicarConfigEnUI();
    renderTodo();
    renderAlmacenamiento();
    toast('Respaldo importado correctamente.', 'ok', 6000);
  }).catch(function (err) {
    progresoOcultar();
    console.error(err);
    toast('Error al importar: ' + (err && err.message ? err.message : 'desconocido'), 'error', 8000);
  });
}

/* =====================================================================
   30. ATAJOS DE TECLADO Y EVENTOS GLOBALES
   ===================================================================== */

function configurarGlobales() {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('#modalConfirmar').hasAttribute('hidden')) { cerrarConfirmar(false); return; }
      if (!$('#modalVisor').hasAttribute('hidden')) { cerrarTodosLosModales(); return; }
      if (!$('#modalMuseo').hasAttribute('hidden')) { $('#museoModalCerrar').click(); return; }
      if ($('#sidebar').classList.contains('abierto')) cerrarSidebarMovil();
    }
  });

  // Evita que el navegador abra el archivo al soltarlo fuera de una zona
  window.addEventListener('dragover', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
  });
  window.addEventListener('drop', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
  });

  $('#confirmSi').addEventListener('click', function () { cerrarConfirmar(true); });
  $('#confirmNo').addEventListener('click', function () { cerrarConfirmar(false); });
  $('#modalConfirmar').addEventListener('click', function (e) {
    if (e.target === this) cerrarConfirmar(false);
  });

  window.addEventListener('beforeunload', function () {
    if (estado.visor.url) URL.revokeObjectURL(estado.visor.url);
  });

  // Aviso si el navegador está por quedarse sin espacio
  if (navigator.storage && typeof navigator.storage.persisted === 'function') {
    navigator.storage.persisted().then(function (ok) {
      if (!ok && esDocente()) {
        setTimeout(function () {
          toast('Sugerencia: activa «almacenamiento permanente» en Ajustes para que el navegador no borre tus archivos.', 'info', 8000);
        }, 4000);
      }
    }).catch(function () { /* sin soporte */ });
  }
}

/* =====================================================================
   31. ARRANQUE
   ===================================================================== */

function iniciar() {
  cargarEstadoBloqueo();
  configurarTema();
  configurarLogin();
  configurarNavegacion();
  configurarVisor();
  configurarLibros();
  configurarTareas();
  configurarAnuncios();
  configurarFotos();
  configurarMuseos();
  configurarAjustes();
  configurarGlobales();

  // Reanudar sesión solo si hay token en sessionStorage y datos de sesión
  var sesion = leerClave(CLAVES.sesion, null);
  var sesionValida = tokenSesionValido() && sesion &&
    (sesion.rol === ROLES.DOCENTE || sesion.rol === ROLES.ESTUDIANTE);
  if (sesionValida) {
    estado.sesion = sesion;
    irAApp();
  } else {
    // Sin token válido no se permite el acceso a las páginas internas
    try { sessionStorage.removeItem(CLAVES.token); } catch (e) { /* sin sessionStorage */ }
    try { localStorage.removeItem(CLAVES.sesion); } catch (e) { /* sin localStorage */ }
    mostrarLogin('');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
