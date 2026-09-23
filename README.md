# Consulta Vehicular QR

Sistema web privado para registrar vehículos y generar un QR único para cada registro.

## Requisitos
- Node.js 18 o superior.

## Instalación

```bash
npm install
```

Copia `.env.example` como `.env` y cambia la contraseña y el secreto de sesión.

Ejemplo:

```text
PORT=3000
BASE_URL=http://localhost:3000
SESSION_SECRET=una-clave-larga-y-aleatoria
ADMIN_USER=EQSOLET2027
ADMIN_PASSWORD=SAN_JACINTO_EQSOLET2026
```

Inicia:

```bash
npm start
```

Abre:

`http://localhost:3000`

## Funcionamiento

1. Entra a "Administración".
2. Inicia sesión.
3. Agrega los datos del vehículo.
4. Pulsa "QR".
5. El QR contiene una dirección como `/consulta/1`.
6. Al escanearlo, se muestra la ficha pública del vehículo.

## Para ponerlo en Internet

En el servidor de alojamiento define `BASE_URL` con el dominio real, por ejemplo:

`https://tudominio.com`

No uses `localhost` para QR que deban funcionar desde otros teléfonos.

## Seguridad

Esta versión es una base funcional. Antes de usarla para datos reales conviene:
- usar HTTPS;
- establecer una contraseña fuerte;
- cambiar SESSION_SECRET;
- usar almacenamiento persistente;
- hacer copias de seguridad;
- limitar los datos personales publicados.

La pantalla pública identifica el sistema como privado y no como una plataforma oficial de la ANT o de una entidad pública.
