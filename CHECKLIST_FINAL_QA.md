# Checklist Final QA

Este checklist sirve para la salida final del sistema y para las pruebas con doctoras, admin y superadmin.

## 1. Accesos y roles

- Iniciar sesion como `paciente`, `admin`, `doctor` y `superadmin`.
- Confirmar que cada rol solo vea lo que le corresponde.
- Verificar que `superadmin` si pueda ver eliminados, auditoria y reportes completos.
- Confirmar que un usuario normal no pueda entrar a `/panel`.

## 2. Landing y catalogo publico

- Revisar `promociones`, `tratamientos`, `cursos` y `libros` en celular y desktop.
- Confirmar que fotos de doctora, cursos y promociones carguen bien.
- Validar filtros visibles donde se definieron como obligatorios.
- Revisar textos largos, botones y cards en pantallas pequenas.

## 3. Flujo de cursos

- Entrar sin sesion a un curso y confirmar que aparezca `registrate o inicia sesion`.
- Entrar con sesion y abrir la modal de inscripcion.
- Confirmar que el QR se vea correctamente.
- Subir comprobante y verificar que sin comprobante no deje enviar.
- En admin, aprobar la inscripcion.
- Confirmar que:
  - baje el cupo del curso
  - aparezca en panel del paciente
  - entre a caja con monto y metodo correctos
- Verificar que ya no permita reenviar la misma inscripcion.

## 4. Flujo de citas

- Crear una reserva desde paciente con comprobante.
- Aprobarla desde admin indicando monto y metodo.
- Confirmar entrada automatica a caja.
- Crear una cita manual pagada desde admin.
- Confirmar que tambien genere ingreso en caja.
- Probar rechazo o cancelacion y revisar que no deje estados inconsistentes.

## 5. Flujo de libros

- Comprar libro con comprobante.
- Aprobar desde admin.
- Confirmar token, estado del pedido e ingreso a caja.
- Validar mensaje y descarga si aplica.

## 6. Caja

- Crear caja/sucursal.
- Abrir caja con monto inicial.
- Registrar ingreso manual.
- Registrar egreso manual.
- Hacer arqueo parcial.
- Hacer cierre y revisar diferencia esperado vs contado.
- Descargar CSV y revisar columnas.
- Confirmar que pagos de citas, cursos y libros entren con origen correcto.
- Revisar que anulados o eliminados desaparezcan de la vista normal pero sigan visibles para superadmin.

## 7. Inventario

- Crear categoria, unidad, proveedor y ubicacion.
- Crear item con stock minimo y costo.
- Crear lote con vencimiento.
- Registrar movimiento de entrada.
- Registrar merma o ajuste nocturno.
- Verificar alertas de stock bajo y lotes por vencer.
- Descargar reportes CSV.
- Revisar que eliminados no se pierdan para auditoria superadmin.

## 8. Tiempo real y notificaciones

- Abrir el panel en dos navegadores.
- Crear una reserva, solicitud o inscripcion nueva.
- Confirmar que el panel reciba el cambio sin borrar formularios abiertos.
- Revisar campana/notificaciones en desktop y celular.

## 9. Responsivo

- Revisar sidebar en celular con scroll.
- Revisar tablas largas, modales y cards administrativas.
- Confirmar que botones fijos o flotantes no tapen contenido importante.

## 10. Seguridad y datos

- Revisar cambios de QR con usuario autorizado.
- Confirmar quien cambio QR, fecha y auditoria.
- Verificar subida y descarga de comprobantes.
- Confirmar que no haya rutas expuestas sin sesion.

## 11. Revision humana recomendada

- Probar con pagos y comprobantes reales.
- Revisar textos finales, ortografia y tono comercial.
- Confirmar WhatsApp, mensajes y numeros reales.
- Hacer una jornada de uso real de un dia con admin o recepcion.
