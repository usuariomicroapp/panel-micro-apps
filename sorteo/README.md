# SORTEO

Aplicación web instalable (PWA) para sorteos con resultados de la Quiniela de la Ciudad.

**Estado:** Etapa 2 (diseño visual y navegación). Modo demostración: los datos son de ejemplo, no hay base de datos, no se venden números ni se aceptan pagos.

Plan completo (Etapa 1): https://claude.ai/artifact/SMxVzs8ao7PiKCnkVQyDH3

## Pantallas

| Ruta | Pantalla |
| --- | --- |
| `#/bienvenida` | Bienvenida |
| `#/` | Sorteos activos |
| `#/sorteo/:id` | Detalle del sorteo y grilla de números |
| `#/resultados` | Resultados |
| `#/perfil` | Ingreso y perfil del participante |
| `#/invitar` | Invitar participantes |
| `#/admin` | Panel administrativo |

## Desarrollo

```bash
cd sorteo
npm install
npm run dev     # servidor local
npm run build   # compila en sorteo/dist
```

## Publicación en Cloudflare Pages (plan gratuito)

- Repositorio: `usuariomicroapp/panel-micro-apps`
- Directorio raíz: `sorteo`
- Comando de compilación: `npm run build`
- Directorio de salida: `dist`

No requiere tarjeta ni variables de entorno en esta etapa.
