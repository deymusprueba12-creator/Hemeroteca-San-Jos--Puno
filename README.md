# 📚 BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO

Proyecto educativo de sitio estático: una biblioteca y aula digital construida con
HTML, CSS y JavaScript puro, publicable en **GitHub Pages**.

No utiliza framework frontend, servidor ni base de datos. Node.js 22 se usa únicamente
para generar la configuración local de demostración y ejecutar las comprobaciones; la
interfaz continúa siendo una aplicación estática.

---

## ✨ Funcionalidades

### 🔐 Acceso por rol

La pantalla de inicio ofrece dos accesos independientes: **DOCENTES** y **ESTUDIANTES**.
Cada rol valida su propio usuario y contraseña configurados mediante variables de entorno.
No se guardan credenciales reales en los archivos versionados.

### ⚠️ Limitación de seguridad del sitio estático

El proyecto continúa siendo HTML, CSS y JavaScript publicado como sitio estático.
El archivo de configuración se genera durante la publicación desde variables de entorno,
pero sus valores llegan al navegador y pueden inspeccionarse. Por ello este login es
**solo una maqueta funcional de demostración**: no protege datos ni sustituye una
autenticación de servidor. Para seguridad real se necesita un backend que valide
credenciales y permisos en cada solicitud.

Se conserva el bloqueo visual de intentos y la sesión local, pero ambos son controles
del navegador y pueden manipularse.

### 👨‍🏫 Rol DOCENTE

- **Libros**: subir archivos **Word (.doc / .docx)** y **PDF** de hasta **1 GB** cada uno,
  **editar** los datos (y reemplazar el archivo) y **eliminar**.
- **Tareas**: publicar actividades para el curso o subir entregas.
- **Anuncios por área curricular**: publicar comunicados dentro de la lista independiente de cada área.
- **Fotos**: subir una o varias imágenes a la vez y eliminarlas.
- **Museos Virtuales**: agregar enlaces (URL) a museos y recorridos virtuales.
- **Ajustes**: nombre de la institución, curso, límite de tamaño, permisos y respaldo.

### 🎓 Rol ESTUDIANTE

- **Ver y leer** todos los libros (con visor integrado).
- **Subir sus tareas** en formato **foto, Word o PDF**.
- **Ver y usar** los museos virtuales.
- **Ver** los anuncios publicados en cada área curricular.
- ❌ **No puede** editar ni eliminar nada.

> Por defecto el estudiante **no** puede borrar nada. Si lo prefieres, el docente
> puede activarlo en **Ajustes → Permisos de estudiantes**.

### 🖥️ Visor de documentos integrado

- **PDF** → se muestra en pantalla completa con el visor nativo del navegador.
- **Word (.docx)** → se convierte a HTML **dentro del navegador** (títulos, negritas,
  cursivas, listas numeradas y con viñetas, tablas, hipervínculos, alineación,
  imágenes y cambios de tamaño). Conversor propio, **sin librerías externas**.
- **Imágenes** → visor con zoom (+, −, restablecer y doble clic).
- **Word antiguo (.doc)** y otros formatos → se ofrece la descarga (el navegador no
  puede interpretar ese formato binario).

---

## 📁 Estructura del proyecto

```
hemeroteca-oficial/
├── index.html    ← Estructura de la página
├── styles.css    ← Estilos, temas claro/oscuro y diseño responsive
├── script.js     ← Toda la lógica de la aplicación
├── auth-config.js ← Generado localmente; ignorado por Git
├── .env.example  ← Nombres de variables, sin credenciales reales
├── scripts/      ← Generador de configuración estática
├── .github/workflows/ ← Validación y publicación en Pages
└── README.md     ← Este archivo
```

---

## 🚀 Abrir en VS Code y ejecutar

### 1. Abrir el proyecto

1. Abre **Visual Studio Code**.
2. Menú **Archivo → Abrir carpeta…**
3. Selecciona la carpeta `hemeroteca oficial`.
4. Verás los 4 archivos en el explorador lateral.

### 2. Instalar la extensión *Live Server*

1. En la barra lateral izquierda haz clic en **Extensiones** (icono de cuadros).
2. Busca **Live Server** (autor *Ritwick Dey*).
3. Haz clic en **Instalar**.

### 3. Configurar accesos de demostración

1. Copia `.env.example` como `.env`.
2. Edita `.env` y define los cuatro valores para docente y estudiante.
3. Con Node.js 22 o superior, ejecuta:

```powershell
node scripts/generate-auth-config.mjs
```

El comando genera `auth-config.js` localmente. Ese archivo está excluido de Git.

### 4. Ejecutar

1. Abre `index.html`.
2. Clic derecho sobre `index.html` → **Open with Live Server**.
3. Se abrirá en el navegador en `http://127.0.0.1:5500/index.html`.
4. ¡Listo! La aplicación funciona completa.

> **Importante:** usa siempre *Live Server* (o cualquier servidor local).
> Si abres `index.html` con doble clic (`file:///`), algunos navegadores
> bloquean el almacenamiento local y los datos **no se guardarán**.

### 5. Detener el servidor

Cierra la pestaña del navegador o pulsa **Ctrl + Shift + P → Live Server: Stop Server**
en VS Code.

---

## 🔑 Iniciar sesión

En la pantalla inicial selecciona **DOCENTES** o **ESTUDIANTES** e introduce las
credenciales correspondientes a ese rol. El cierre de sesión está disponible en
la barra lateral. Tras cinco intentos fallidos se aplica un bloqueo local de 60 segundos.

Para la publicación en GitHub Pages configura estos cuatro **Actions Secrets** en
`Settings → Secrets and variables → Actions`:

- `DOCENTE_USERNAME`
- `DOCENTE_PASSWORD`
- `ESTUDIANTE_USERNAME`
- `ESTUDIANTE_PASSWORD`

El workflow genera `auth-config.js` durante la publicación. **No reutilices contraseñas
personales**: los valores generados quedan expuestos en el JavaScript público del sitio.
Utiliza únicamente credenciales ficticias de demostración hasta migrar a un backend.

---

## 🌐 Publicar en GitHub Pages (gratis)

### Paso 1 — Crear el repositorio

1. Ve a [github.com](https://github.com) y haz clic en **+ → New repository**.
2. Nombre sugerido: `hemeroteca-oficial`.
3. Marca **Public** (obligatorio para Pages gratuito).
4. Clic en **Create repository**.

### Paso 2 — Subir los archivos

Desde la terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/hemeroteca-oficial.git
git push -u origin main
```

> Si no tienes Git instalado, puedes subir los archivos arrastrándolos a la web de GitHub
> (botón **Add file → Upload files**).

### Paso 3 — Activar GitHub Pages

1. En tu repositorio ve a **Settings → Pages**.
2. En **Source**, elige **Deploy from a branch**.
3. En **Branch**, selecciona **main** y la carpeta **/(root)**.
4. Clic en **Save**.

### Paso 4 — Obtener tu dirección

Espera 1–2 minutos. GitHub publicará la página en:

```
https://TU_USUARIO.github.io/hemeroteca-oficial/
```

¡Eso es todo! Anota esa dirección y compártela con tus estudiantes.

> **Cada dispositivo guarda sus propios datos.** Si el docente sube libros en su
> computadora, los estudiantes **no** los verán automáticamente (no hay servidor).
> Para compartir, usa **Ajustes → Exportar copia completa** en el equipo del
> docente e **Importar copia de seguridad** en el de cada estudiante.
> Consulta la sección siguiente para entender el almacenamiento.

---

## 💾 Cómo se guardan los datos

La aplicación usa **dos almacenes del navegador**, ambos 100 % locales y gratuitos:

| Dato | Dónde se guarda | Detalle |
|---|---|---|
| Libros, tareas, anuncios, fotos, museos, sesión y ajustes | **`localStorage`** | Claves `hemeroteca_libros`, `hemeroteca_tareas`, `hemeroteca_avisos`, `hemeroteca_fotos`, `hemeroteca_museos`, `hemeroteca_sesion`, `hemeroteca_config`, `hemeroteca_bloqueo` |
| Token de sesión | **`sessionStorage`** | Clave `hemeroteca_token` (se borra al cerrar sesión o la pestaña) |
| Archivos binarios (Word, PDF, imágenes) | **`IndexedDB`** | Base `hemeroteca_archivos`, almacén `archivos` |

### ¿Por qué dos almacenes?

`localStorage` es rapidísimo pero está limitado a **~5 MB**, muy poco para libros.
`IndexedDB` permite guardar **hasta 1 GB por archivo**, que es lo que exige el proyecto.

Los **metadatos** (títulos, autores, fechas, autores de cada registro) se guardan en
`localStorage` con el prefijo `hemeroteca_`; cada registro apunta a su archivo real
mediante el campo `archivoId`.

### ⚠️ Cosas importantes que debes saber

1. **Los datos son locales.** Cada navegador y cada computadora tiene su propia
   hemeroteca. No hay nube ni sincronización automática.
2. **No borres los datos del navegador** (no uses «Borrar datos de navegación» ni
   herramientas de limpieza sin saber lo que haces).
3. **Activa el almacenamiento permanente** en *Ajustes → Solicitar almacenamiento
   permanente* para que el navegador no libere espacio por su cuenta.
4. **Haz respaldos** en *Ajustes → Exportar copia completa* de vez en cuando.

---

## 📦 Respaldo y restauración

En **Ajustes** (solo docente) tienes:

| Botón | Qué hace |
|---|---|
| **Solicitar almacenamiento permanente** | Pide al navegador no borrar los archivos automáticamente. |
| **Exportar metadatos (JSON)** | Descarga solo títulos, autores y fechas (archivo pequeño). |
| **Exportar copia completa (con archivos)** | Descarga **también los archivos** en base64. Si superan 300 MB avisa y sugiere la primera opción. |
| **Importar copia de seguridad** | Restaura un respaldo `.json` (reemplaza los datos actuales). |
| **Borrar todos los datos** | Elimina absolutamente todo. Pide confirmación. |

**Flujo recomendado para repartir material:** el docente exporta la copia completa
y la importa en el equipo de cada aula.

---

## ⚙️ Personalización rápida

### Cambiar usuario y contraseña

Edita las cuatro variables del archivo local `.env` o los cuatro Actions Secrets
indicados en *Iniciar sesión*. Después, genera nuevamente `auth-config.js` para
la prueba local o vuelve a ejecutar el workflow de GitHub Pages.

No guardes `.env` ni `auth-config.js` en el repositorio. Los valores de configuración
incluidos en el sitio publicado son visibles para los visitantes y no constituyen
credenciales seguras.

### Áreas curriculares

La sección de áreas contiene exclusivamente estas áreas, cada una con su propio
formulario de publicación y su propia lista de anuncios:

- Área de Desarrollo Personal, Ciudadanía y Cívica
- Área de Ciencias Sociales
- Área de Educación Física
- Área de Arte y Cultura
- Área de Comunicación
- Área de Castellano como Segunda Lengua
- Área de Inglés como Lengua Extranjera
- Área de Matemática
- Área de Ciencia y Tecnología
- Área de Educación para el Trabajo
- Área de Educación Religiosa

Los anuncios antiguos que no tengan un identificador de área se conservan en los
datos locales y respaldos, pero no se muestran mezclados en ninguna lista curricular.

### Cambiar colores

Abre `styles.css` y modifica el bloque `:root`:

```css
:root {
  --c-primario: #4f46e5;   /* color principal */
  --c-acento:   #0ea5e9;   /* color de acento  */
}
```

También hay un tema oscuro completo ya incluido; el usuario puede alternarlo con
el botón 🌙 / ☀️ de la barra superior.

### Cambiar el límite de tamaño

Por defecto está en `styles.css`/`script.js` a **1 GB**, pero el docente puede elegir
100 MB, 500 MB, 1 GB o 2 GB desde **Ajustes → Límite máximo por archivo**.

> El límite real también depende de lo que permita tu navegador y del espacio
> disponible en el disco.

### Cambiar textos fijos de la interfaz

Casi todos están en `index.html`. Para buscarlos rápidamente en VS Code:
`Ctrl + Shift + F` (Buscar en archivos).

---

## 🧩 Estructura del código (`script.js`)

El archivo está organizado en secciones numeradas para que sea fácil de leer:

| Sección | Contenido |
|---|---|
| 1 | Configuración (credenciales, roles, extensiones permitidas) |
| 2–3 | Utilidades y notificaciones (toasts) |
| 4–5 | Almacenamiento: `localStorage` e `IndexedDB` |
| 6–7 | Estado de la aplicación y persistencia |
| 8 | Inicio de sesión de demostración con accesos independientes por rol |
| 9–10 | Navegación y temas |
| 11 | Zonas de arrastrar y soltar |
| 12 | Modales y barra de progreso |
| **13** | **Lector ZIP + conversor DOCX a HTML (sin dependencias)** |
| 14 | Visor de archivos (PDF, imágenes, Word) |
| 15–22 | Renderizado de cada sección y anuncios separados por área curricular |
| 23 | Renderizado general |
| 24–29 | Acciones (libros, tareas, anuncios, fotos, museos, ajustes) |
| 30 | Atajos de teclado y eventos globales |
| 31 | Arranque |

---

## ❓ Preguntas frecuentes

**¿Puedo subir un archivo de 1 GB?**
Sí, hasta el límite configurado (1 GB por defecto). El navegador graba el archivo
en IndexedDB; puede tardar unos segundos. Si el archivo supera el límite verás un
aviso rojo antes de subirlo.

**¿Los estudiantes ven lo que sube el docente?**
Sí, pero **solo en el mismo navegador**. Como no hay servidor, cada equipo tiene su
propia copia. Usa *Exportar / Importar* para repartir el material.

**¿Puedo cambiar las credenciales?**
Sí. Cambia las variables `DOCENTE_USERNAME`, `DOCENTE_PASSWORD`, `ESTUDIANTE_USERNAME` y `ESTUDIANTE_PASSWORD` en `.env` o en GitHub Actions Secrets y vuelve a generar la configuración. Recuerda que es solo una demostración estática.

**¿Por qué no se guardan mis datos al abrir el archivo con doble clic?**
Porque en `file:///` algunos navegadores bloquean el almacenamiento. Usa **Live Server**
o publica en GitHub Pages.

**El archivo Word `.doc` no se ve en pantalla.**
Es el formato antiguo de Word 97‑2003 (binario). Solo se puede ver el `.docx`
(Word 2007 en adelante). Para el `.doc` la app ofrece la descarga.

**¿Cómo limpio todo y empiezo de cero?**
Ajustes → **Borrar todos los datos**, o bien desde el navegador: F12 →
Application → *Clear site data*.

**¿Funciona en el celular y la tablet?**
Sí. El menú lateral se convierte en un menú deslizable y toda la interfaz es
responsive. En el celular la mejor opción es abrir la dirección de GitHub Pages.

**¿Necesito conexión a internet?**
Solo para cargar la página y los enlaces de los museos. Los archivos ya subidos se
leen localmente. El conversor de Word **no** usa ninguna librería externa, así que
funciona incluso sin internet.

---

## ✅ Compatibilidad

Probado y funcional en **Chrome / Edge 90+**, **Firefox 90+** y **Safari 15.4+**.

La conversión de `.docx` usa la API nativa `DecompressionStream`. En navegadores
antiguos la app lo detecta y ofrece la descarga en lugar de fallar.

---

## 📄 Licencia

Proyecto educativo de uso libre. Puedes modificarlo y adaptarlo a tu institución
sin restricciones.
