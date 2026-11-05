# Mis Cuentas (finanzas)

Microapp instalable (PWA) para controlar deudas, gastos, ingresos y el balance general. Sin dependencias ni compilación: son archivos estáticos.

- **Inicio:** balance general (positivo/negativo), plata que tengo, total que debo, ingresos y gastos del mes, saldo por cuenta (efectivo, Mercado Pago, banco, tarjeta…).
- **Deudas:** carga manual por tipo (materias primas, tarjetas…); los pagos descuentan de la cuenta elegida.
- **Gastos / Ingresos:** por mes y categoría; cada movimiento suma o resta en una cuenta.
- **Ajustes:** PIN, copia de seguridad (exportar/restaurar) y **Panel de administrador** (marca, clientes con código y vencimiento).

Los datos viven en el dispositivo (`localStorage`). Para probar: abrir `finanzas/index.html` o servir la carpeta.

Publicación (Cloudflare Pages): directorio raíz `finanzas`, sin comando de compilación, salida `.`.

## Uso personal vs. comercial

`config.js` controla la copia. Hoy `commercial:false` (uso personal, sin panel de administrador). Para vender, poné `commercial:true` en la copia propia: aparece el **Panel de administrador** en Ajustes (marca, clientes, códigos, vencimientos). Cada cliente recibe su propia copia con `commercial:false`.
