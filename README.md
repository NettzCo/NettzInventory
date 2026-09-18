# Nettz · Inventario de SIM cards

**Software:** Nettz Inventory · **Versión:** 1.0 · **Creador:** Mario Diaz · **Bogotá, Colombia**

Plataforma para gestionar el inventario de SIM cards: entregas, estados,
números cortos y clientes, con hoja de vida completa (historial permanente)
por cada SIM.

## Qué incluye

- Login con roles (super administrador, comercial, broker, solo lectura).
- Registro de entrega de una o varias SIM a un cliente.
- Búsqueda rápida por ICC o número corto.
- Hoja de vida por SIM: historial de estados, de número corto y de
  asignaciones/reasignaciones de cliente, cada uno con fecha y usuario.
- Panel de super administrador para crear usuarios y gestionar roles.

## 1. Crear la base de datos (Supabase — gratis)

1. Crea una cuenta en https://supabase.com y un nuevo proyecto.
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase/schema.sql`
   y ejecútalo. Esto crea todas las tablas, la vista de estado actual y las
   políticas de seguridad.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key
   - `service_role` key (¡secreta! nunca la publiques ni la subas a un repo
     público)

## 2. Crear tu primer super administrador

El primer usuario no se puede crear desde la app (todavía no hay nadie con
permiso). Créalo directamente en Supabase:

1. Ve a **Authentication → Users → Add user** y crea tu usuario con correo y
   contraseña (marca "Auto Confirm User").
2. Ve a **Table Editor → profiles**, busca la fila que se creó automáticamente
   para ese usuario, y complétala así:
   - `organization_id`: el id de la organización "Nettz" (ya viene creada;
     puedes copiarlo desde **Table Editor → organizations**).
   - `role_id`: el id del rol "Super administrador" de esa misma organización
     (**Table Editor → roles**, filtra por `organization_id` = el de Nettz).
3. Desde ahí ya puedes iniciar sesión en la plataforma. Como super
   administrador verás **Usuarios**, **Roles**, y **Organizaciones** — el
   único que puede ver y crear organizaciones nuevas es quien tenga el rol
   "Super administrador" (no hay un permiso aparte para esto).

## 3. Ejecutar localmente (opcional, para probar antes de publicar)

```bash
npm install
cp .env.example .env.local   # y completa los 3 valores de Supabase
npm run dev
```

Abre http://localhost:3000

## 4. Desplegar en Vercel

1. Sube este proyecto a un repositorio de GitHub (puede ser privado).
2. Entra a https://vercel.com → **Add New Project** → importa el repositorio.
3. En **Environment Variables** agrega las 3 variables de `.env.example` con
   los valores reales de tu proyecto de Supabase.
4. Despliega. Vercel te dará una URL tipo `nettz-sim-inventory.vercel.app`.

## 5. Conectar tu subdominio de Nettz.co

1. En Vercel: **Project → Settings → Domains → Add** y escribe, por ejemplo,
   `inventario.nettz.co`.
2. Vercel te mostrará un registro DNS tipo:
   ```
   CNAME   inventario   cname.vercel-dns.com
   ```
3. Ve al proveedor DNS donde administras Nettz.co (donde compraste el
   dominio, o donde apuntas sus registros) y crea ese registro CNAME.
4. Espera unos minutos a que propague — Vercel confirma automáticamente y
   activa HTTPS.

Listo: `https://inventario.nettz.co` (o el nombre que elijas) queda apuntando
a la plataforma.

## Marca blanca (revender a otros clientes)

Toda la marca vive en dos lugares, y solo hay que tocar esos dos para
convertir esto en la plataforma de otro cliente:

1. **`lib/branding.ts`** — nombre, tagline y rutas de logo.
2. **`public/brand/`** — los archivos de logo. Reemplázalos por los del nuevo
   cliente (mismo nombre de archivo, o actualiza las rutas en `branding.ts`).
3. Si el cliente tiene sus propios colores, ajusta los tokens en
   `app/globals.css` (`--ink-900`, `--chip-gold`, etc.) — son los únicos
   lugares donde vive el color de marca.

Nada más en el código hace referencia a "Nettz" directamente: el sidebar, el
login, y el título de la pestaña del navegador toman todo de `BRAND`.

Para revender a varios clientes en paralelo, lo más simple es un repositorio
por cliente (cada uno con su propio proyecto de Supabase y su propio
despliegue en Vercel) — es la vía más rápida sin tener que construir un
sistema multi-tenant.

## Recuperación de contraseña

Ya está lista la opción "¿Olvidaste tu contraseña?" en el login — envía un
correo con un enlace para crear una contraseña nueva, usando el sistema de
correos que ya trae Supabase Auth (no hay que configurar SMTP para probarlo:
Supabase tiene un servicio de correo propio con un límite bajo de envíos por
hora, suficiente para probar; para producción real, conecta tu propio SMTP en
**Project Settings → Auth → SMTP Settings** para no depender de ese límite).

Para que el enlace del correo funcione, en el proyecto de Supabase ve a
**Authentication → URL Configuration** y agrega:
- **Site URL**: la URL de tu app en producción (ej. `https://inventario.nettz.co`)
- **Redirect URLs**: agrega `https://inventario.nettz.co/reset-password` (y
  `http://localhost:3000/reset-password` si vas a probar en local)

## Integración con APIs de proveedores (preparado para el futuro)

La plataforma ya tiene el mecanismo completo para traer inventario y estado
en línea desde la plataforma de cada proveedor — lo único que falta es la
API real de cada uno, que no existe todavía en el código porque no
tenemos sus credenciales ni su documentación.

**Cómo funciona:**
- Cada proveedor puede tener un "conector" (`lib/integrations/*.ts`) que
  implementa una interfaz común (`testConnection`, `fetchInventory`).
- Hoy solo existe `demoAdapter.ts`, un conector de demostración que no llama
  a ninguna API real — sirve para probar el flujo completo (Configuración →
  Proveedores → Configurar API → Probar conexión / Sincronizar ahora) sin
  tener credenciales de nadie todavía.
- Cuando tengas acceso a la API de un proveedor real (ej. Claro), copias
  `demoAdapter.ts`, lo renombras (`claroAdapter.ts`), implementas las
  llamadas reales, y lo registras en `lib/integrations/registry.ts`. No hay
  que tocar nada más — la UI y las acciones de sincronización ya funcionan
  contra la interfaz genérica.
- Al sincronizar, la plataforma solo actualiza el **estado** de las SIM que
  ya existen en el inventario (por ICC). Si el proveedor reporta una SIM que
  no está registrada en Nettz, queda contada como "no encontrada" en la
  bitácora, pero no se crea automáticamente — crear una SIM requiere datos
  de negocio (cliente, precio, comercial) que la API del proveedor no tiene.
- Las credenciales de API se guardan en una tabla separada
  (`provider_credentials`) que solo el super administrador puede leer o
  escribir, y nunca se envían al navegador.
- Toda corrida de sincronización queda en `sync_logs` (proveedor, cuándo,
  cuántas SIM se revisaron/actualizaron, y si hubo error).

## Notas de uso

- **Perfiles y módulos**: los roles son Super administrador, Comercial,
  Broker y **Facturación** (antes llamado "Consulta" — solo lectura). Más
  allá del rol, el super administrador decide exactamente qué módulos ve
  cada usuario (Inventario, Búsqueda rápida, Alertas, Registrar entrega,
  Clientes) desde Configuración → Usuarios — al crear el usuario, o después
  con "Editar módulos" en su fila. El rol solo define la selección inicial
  sugerida; lo que realmente manda es la lista de módulos guardada en cada
  usuario. **Configuración** es la única excepción: siempre queda reservada
  al super administrador, sin poder delegarse.

- El **ICC** es único y permanente: una vez registrado, la SIM queda para
  siempre en el inventario con toda su hoja de vida.
- Al registrar una entrega, si el proveedor es **Claro**, el número corto es
  obligatorio.
- Para reasignar una SIM a otro cliente, o cambiarle el número corto o el
  estado, se hace desde la página de detalle de la SIM — nunca se borra el
  historial anterior, solo se cierra y se abre un nuevo registro.
- **Proveedores** y **APN** se administran desde sus propios módulos (solo
  super administrador). Desactivar o eliminar uno de la lista no afecta las
  SIM que ya lo tenían asignado — el dato queda guardado como texto en cada
  SIM, la lista solo controla qué aparece como opción al registrar SIM nuevas.
- **Carga masiva**: en "Registrar entrega" puedes descargar una plantilla de
  Excel generada al vuelo (`/dashboard/nueva/plantilla`) con listas
  desplegables reales — proveedor, APN, estado, unidad de plan, tipo de plan,
  forma de pago, comercial y broker — tomadas de la configuración vigente,
  para evitar errores de escritura. Al subir el archivo, primero se
  **revisa** (sin guardar nada todavía): si el nombre de un cliente se
  parece a uno ya existente pero no es idéntico, se te pregunta si es el
  mismo cliente antes de continuar. Solo al confirmar se guarda de verdad.
  Si el ICC de una fila ya existe, se actualiza (no se rechaza) y el cambio
  queda en la hoja de vida de esa SIM, igual que si lo hicieras a mano.
