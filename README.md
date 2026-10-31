# 🧁 Pastelería Mafer

Tienda en línea para la pastelería **Mafer**: menú con categorías y buscador, carrito, pedidos a domicilio o para recoger (estilo Uber Eats), seguimiento del pedido en tiempo real, panel de administrador para subir pasteles y gestionar pedidos, y pagos con **Stripe en modo prueba**.

**Stack:** HTML · SCSS · JavaScript (frontend) — Node.js + Express (servidor) — MySQL (base de datos) — Stripe Checkout (pagos de prueba).

---

## 1. Requisitos

- Node.js 18 o superior
- MySQL 8 (o MariaDB 10.5+)
- Una cuenta gratuita de Stripe (sólo para ver el pago con tarjeta)

## 2. Instalación local

```bash
npm install                 # instala dependencias y compila el SCSS
cp .env.example .env        # copia la configuración y edítala
npm run db:init             # crea la base "mafer", tablas y categorías
npm start                   # abre http://localhost:3000
```

En `.env` llena como mínimo `DB_USER`, `DB_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `JWT_SECRET`.

Si prefieres crear la base a mano: `mysql -u root -p < database/schema.sql`.

Para desarrollar con recarga automática del SCSS y del servidor: `npm run dev`.

## 3. Panel de administrador

Entra a **http://localhost:3000/admin/** con el `ADMIN_EMAIL` y `ADMIN_PASSWORD` de tu `.env` (el usuario se crea solo la primera vez que arranca el servidor).

- **Pedidos:** tarjetas de cada pedido con botón rápido para avanzar el estado (Recibido → En el horno → En camino → Entregado), sonido al llegar pedidos nuevos, filtros y ventas del día.
- **Pasteles:** subir pastel con foto (JPG/PNG/WEBP, máx. 5 MB), precio, categoría, tiempo de preparación, marcar como favorito o agotado, editar y eliminar.
- **Categorías:** agregar o quitar categorías del menú.
- **Portada:** sube las dos fotos redondas que van a los lados del título. Si no subes ninguna, se usan los archivos `public/img/izquierdo.png` y `public/img/derecho.png`.

> Si cambias la contraseña en `.env` después de la primera vez, no se actualiza sola: borra la fila de la tabla `admins` y reinicia el servidor.

## 4. Pagos con Stripe (modo prueba)

1. Crea una cuenta en https://dashboard.stripe.com y deja activado **"Modo de prueba"**.
2. Copia tus llaves de https://dashboard.stripe.com/test/apikeys en `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. Reinicia el servidor. En la consola verás `💳 Stripe en MODO PRUEBA`.
4. Haz un pedido eligiendo **Tarjeta** y paga con:
   - Tarjeta `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC → pago aprobado
   - Tarjeta `4000 0000 0000 0002` → pago rechazado
5. Stripe te regresa a la página de seguimiento y el pedido aparece en el admin como **Pagado**.

Por seguridad el proyecto **rechaza llaves `sk_live_`**: sólo funciona en modo prueba hasta que tú decidas cambiarlo en `server/config.js`.

**Webhook (opcional, recomendado al publicar):** el pago se confirma al volver de Stripe, pero si el cliente cierra la ventana antes, el webhook lo confirma igual.
- Local: `stripe listen --forward-to localhost:3000/api/payments/webhook` y copia el `whsec_...` a `STRIPE_WEBHOOK_SECRET`.
- En internet: en el dashboard de Stripe crea un webhook a `https://TU-DOMINIO/api/payments/webhook` con los eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`.

Sin llaves de Stripe la tienda sigue funcionando con pago en **efectivo**.

## 5. Subirlo a internet

Este proyecto necesita un hosting que ejecute **Node.js** (un hosting compartido sólo de PHP no sirve). Opciones sencillas:

**Railway (más fácil, todo en un lugar)**
1. Sube la carpeta a un repositorio de GitHub.
2. En railway.app: *New Project → Deploy from GitHub* y elige el repo.
3. Agrega un servicio **MySQL** en el mismo proyecto.
4. En las variables del servicio web pon las de tu `.env`, usando los datos de conexión que te da Railway para `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, y `BASE_URL=https://tu-app.up.railway.app`.
5. Ejecuta una vez `npm run db:init` (desde la consola de Railway) o importa `database/schema.sql` en su MySQL.

**Render / VPS (DigitalOcean, Hostinger VPS, etc.)**
- Comando de build: `npm install` · Comando de inicio: `npm start`.
- Base de datos MySQL externa (PlanetScale, Aiven, Railway, o MySQL en el mismo VPS).
- En un VPS usa `pm2 start server/index.js --name mafer` y Nginx como proxy al puerto 3000.

Recuerda en producción:
- `NODE_ENV=production` (las cookies de sesión pasan a ser seguras).
- Un `JWT_SECRET` largo y aleatorio y una contraseña de admin fuerte.
- Las fotos se guardan en `public/uploads/`. En plataformas con disco efímero (Render gratis, Railway sin volumen) monta un volumen persistente en esa carpeta para no perderlas al redeploy.

## 6. Estructura

```
mafer/
├── database/schema.sql        Tablas y datos de ejemplo
├── scripts/init-db.js         Crea la base de datos con npm run db:init
├── server/
│   ├── index.js               Servidor Express
│   ├── config.js, db.js       Configuración y conexión MySQL
│   ├── middleware/auth.js     Sesión del administrador (JWT en cookie)
│   ├── services/orders.js     Cálculo de precios y estados de pedidos
│   └── routes/                catalog, orders, admin, webhook (Stripe)
├── src/scss/                  Estilos fuente (tokens, base, componentes, layout, admin)
└── public/                    Lo que ve el navegador
    ├── index.html             Tienda
    ├── checkout.html          Finalizar pedido y pago
    ├── pedido.html            Seguimiento del pedido
    ├── admin/index.html       Panel de administración
    ├── css/                   CSS compilado (no editar, edita src/scss)
    ├── js/                    common, store, checkout, track, admin
    ├── img/                   Logo e ilustraciones
    └── uploads/               Fotos que sube el admin
```

## 7. Personalizar

- **Colores y tipografía:** `src/scss/_tokens.scss` y luego `npm run build:css`.
- **Envío:** `DELIVERY_FEE` y `FREE_DELIVERY_FROM` en `.env`.
- **Horario y contacto:** pie de página en `public/index.html`.
- **Productos:** la tienda arranca vacía; sube cada pastel con su foto desde `/admin/` → Pasteles → "+ Subir pastel". Marca "Favorito de la casa" para que aparezca en la sección de favoritos.

## 8. Seguridad incluida

- Los precios siempre se recalculan en el servidor con MySQL (el navegador no puede alterar el total).
- Contraseñas con bcrypt, sesión en cookie `httpOnly`.
- Validación de tipo y tamaño de imágenes.
- La página pública de seguimiento no muestra teléfono ni correo del cliente.
- Webhook de Stripe verificado por firma.
