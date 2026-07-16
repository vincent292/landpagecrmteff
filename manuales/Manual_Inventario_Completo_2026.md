# Manual completo de uso del módulo de inventario

## 1. Objetivo del módulo

El módulo de inventario sirve para controlar insumos, productos, materiales, equipos, lotes, vencimientos, compras, consumos, mermas, turnos y reportes operativos de la clínica.

La idea principal es simple:

- El stock debe cambiar por movimientos claros.
- Los lotes deben conservar trazabilidad cuando el insumo tiene vencimiento o control sanitario.
- Los turnos sirven para corregir la realidad física cuando algo no fue registrado durante el día.
- Los reportes deben permitir saber qué se compró, qué se consumió, quién lo registró y qué diferencias aparecieron.

Este manual está escrito para el uso diario del equipo, no para desarrollo técnico.

## 2. Conceptos importantes

### Item o insumo

Es el producto principal que se controla.

Ejemplos:

- Toxina botulínica 100U.
- Ácido hialurónico 1 ml.
- Aguja 30G.
- Guantes nitrilo M.
- Gasas estériles 10x10.

El item tiene un stock actual general. Ese número responde a la pregunta: "¿Cuánto tenemos disponible en total?"

### Lote

Es una partida específica de un item.

Ejemplo:

- Item: Toxina botulínica 100U.
- Lote: BTX-2026-08.
- Vencimiento: 2026-08-30.
- Cantidad actual: 5 ampollas.

El lote responde a la pregunta: "¿De qué partida viene este stock y cuándo vence?"

### Movimiento

Es cualquier acción que cambia o documenta el stock.

Tipos comunes:

- Entrada: compra, recepción o ingreso.
- Salida: uso interno, descuento manual o consumo sin paciente.
- Merma: descarte, vencido, daño, pérdida confirmada.
- Transferencia: traslado entre ubicaciones.
- Conteo: diferencia encontrada al cerrar un turno.

### Turno de inventario

Es una apertura y cierre de control físico.

Al abrir un turno, el sistema guarda el stock esperado en ese momento. Al cerrar, el usuario cuenta físicamente y el sistema calcula diferencias.

Ejemplo:

- El sistema esperaba 5 ampollas.
- La responsable cuenta 4.
- El cierre registra una diferencia de -1.
- El stock final queda en 4.

### Kardex

Es el historial de movimientos de cada item. Sirve para responder:

- Cuándo entró.
- Cuándo salió.
- Quién lo registró.
- Qué lote se afectó.
- Qué paciente o uso estuvo relacionado.
- Qué diferencia apareció en el cierre.

## 3. Roles y permisos

### Superusuario

Puede administrar todo el inventario, reabrir turnos cerrados, restaurar registros y hacer correcciones avanzadas.

### Administrador/a

Puede gestionar inventario operativo, editar items, registrar movimientos, administrar proveedores, lotes y reportes.

### Asistente o personal autorizado

Puede registrar movimientos operativos según permisos configurados.

### Doctora + inventario

Puede acceder a flujos de inventario cuando su rol lo permite, especialmente consumo y control ligado a atención clínica.

## 4. Flujo recomendado de trabajo diario

### Al inicio del día

1. Entrar a Panel administrativo.
2. Abrir Inventario.
3. Revisar alertas de stock bajo y vencimientos.
4. Abrir turno si se hará control por responsable o ubicación.
5. Confirmar que los items críticos tienen lote y vencimiento correcto.

### Durante el día

Registrar cada evento en el momento más cercano posible:

- Si llega mercadería: registrar entrada o recibir pedido proveedor.
- Si se usa en consulta: descontar desde historia clínica o registrar uso correspondiente.
- Si se usa internamente: usar "Uso interno".
- Si se descarta: registrar merma.
- Si se mueve de lugar: registrar transferencia.

### Al final del día

1. Ir a Turnos.
2. Revisar el turno abierto.
3. Contar físicamente los items.
4. Guardar conteos.
5. Cerrar turno.
6. Revisar diferencias.
7. Si hay diferencias raras, revisar Kardex.

## 5. Configuración inicial

Antes de usar inventario todos los días, conviene cargar estos catálogos.

### Categorías

Sirven para ordenar items.

Ejemplos:

- Medicamentos estéticos.
- Descartables.
- Bioseguridad.
- Material de curación.
- Cosmetología.

Uso recomendado:

- No crear categorías duplicadas con nombres parecidos.
- Usar nombres amplios y estables.
- Evitar categorías como "varios" si luego se necesitan reportes claros.

### Unidades

La unidad define cómo se descuenta el item.

Ejemplos:

- Unidad: u.
- Ampolla: amp.
- Mililitro: ml.
- Caja: caja.
- Gramo: g.

Caso importante: presentación de compra.

Un item puede comprarse en caja, pero usarse por unidad.

Ejemplo:

- Aguja 30G.
- Se usa en consulta por unidad.
- Se compra en caja.
- 1 caja trae 100 unidades.

En el item:

- Unidad que se usa en consulta: Unidad.
- Se compra en: Caja.
- Cuántas unidades trae cada presentación: 100.

Así el sistema puede mostrar:

- Stock: 250 u.
- Equivalente: 2,5 cajas.

### Ubicaciones

Sirven para saber dónde está el stock.

Ejemplos:

- Almacén central.
- Consultorio 1.
- Cabina estética.

Recomendación:

- Usar pocas ubicaciones bien definidas.
- Evitar cambiar la ubicación del item manualmente si lo correcto es registrar una transferencia.

### Proveedores

El proveedor se usa para compras, pedidos, recompra y trazabilidad.

Datos útiles:

- Nombre.
- Contacto.
- Teléfono.
- WhatsApp.
- Plazo de pago.
- Si permite consignación.
- Notas.

Ejemplo:

Proveedor: MedPro Bolivia.
Contacto: Laura Medina.
WhatsApp: 59170000001.
Plazo: 15 días.
Tipo: compra directa.

## 6. Creación de items

Ruta:

Inventario > Items / Insumos > Item.

Campos principales:

- Nombre.
- Tipo.
- Categoría.
- SKU.
- Código de barras.
- Unidad que se usa en consulta.
- Presentación de compra.
- Ubicación.
- Proveedor principal.
- Stock mínimo.
- Costo unitario.
- Precio referencial.
- Lote actual.
- Vencimiento.
- Días de alerta por vencimiento.
- Notas.

### Ejemplo 1: Aguja 30G

Nombre: Aguja 30G.
Tipo: insumo.
Categoría: Descartables.
Unidad de uso: Unidad.
Se compra en: Caja.
Unidades por presentación: 100.
Stock mínimo: 200 unidades.
Proveedor: Descartables SRL.

Si se cargan 3 cajas como entrada, se debe registrar 300 unidades si el movimiento trabaja en unidad interna.

### Ejemplo 2: Ácido hialurónico 1 ml

Nombre: Ácido hialurónico 1 ml.
Tipo: producto.
Categoría: Cosmetología.
Unidad de uso: ml.
Se compra en: ampolla.
Unidades por presentación: 1.
Stock mínimo: 4.
Proveedor: CosmoLab.
Precio referencial: 950.

### Qué no hacer

- No usar el campo de stock actual como forma normal de corregir inventario.
- No crear un item nuevo si solo cambió el lote.
- No borrar items con historial si solo se dejaron de usar. Mejor desactivarlos o archivarlos.

## 7. Lotes y vencimientos

Ruta:

Inventario > Lotes > Lote.

Un lote debe tener:

- Item.
- Número de lote.
- Proveedor.
- Ubicación.
- Fecha de recepción.
- Fecha de vencimiento.
- Cantidad inicial.
- Cantidad actual.
- Costo unitario.

### Cuándo crear lote

Crear lote cuando:

- El insumo tiene vencimiento.
- Es medicamento o producto clínico.
- Se necesita rastrear qué partida se usó en paciente.
- El proveedor entrega mercadería con número de lote.

### Ejemplo

Item: Toxina botulínica 100U.
Lote: BTX-2026-08.
Vencimiento: 2026-08-30.
Cantidad inicial: 6 ampollas.
Cantidad actual: 6 ampollas.

Si luego se usa 1 ampolla, el lote debe bajar a 5.

## 8. Entradas de inventario

Ruta:

Inventario > Registrar entrada.

Usar entrada cuando:

- Llegó mercadería.
- Se compró stock sin pedido proveedor.
- Se encontró stock que no estaba cargado y se decide registrarlo como ingreso.

Campos importantes:

- Item.
- Lote existente si aplica.
- Cantidad.
- Proveedor.
- Ubicación de ingreso.
- Costo unitario.
- Referencia.
- Fecha.
- Motivo.

### Ejemplo

Llegan 250 agujas 30G.

Movimiento:

- Tipo: Entrada.
- Item: Aguja 30G.
- Cantidad: 250.
- Lote: AG30-L1.
- Proveedor: Descartables SRL.
- Ubicación: Almacén central.
- Referencia: Factura 123.
- Motivo: Compra mensual.

Resultado:

- Stock general sube 250.
- El lote sube 250.
- El kardex muestra una entrada.

## 9. Uso interno o descuento manual

Ruta:

Inventario > Uso interno.

Usar cuando el consumo no está ligado a un paciente específico.

Ejemplos:

- Agujas usadas en práctica interna.
- Gasas usadas para limpieza de cabina.
- Guantes usados en preparación.

### Ejemplo

Se usaron 25 agujas 30G.

Movimiento:

- Tipo: salida.
- Item: Aguja 30G.
- Cantidad: 25.
- Lote: AG30-L1.
- Motivo: Uso interno sin paciente.

Resultado:

- Stock general baja 25.
- El lote baja 25.
- El kardex muestra una salida.

## 10. Uso en paciente

Cuando el consumo se registra desde historia clínica, debe quedar ligado al paciente.

Ejemplo:

- Paciente: María López.
- Item: Toxina botulínica 100U.
- Cantidad: 1 ampolla.
- Lote: BTX-2026-08.

Resultado esperado:

- Stock general baja 1.
- Lote baja 1.
- Kardex muestra salida.
- Historial del item muestra uso en paciente.
- Historia clínica conserva trazabilidad.

Recomendación:

Siempre seleccionar lote cuando el insumo tenga vencimiento o trazabilidad clínica.

## 11. Mermas, vencidos y descartes

Ruta:

Inventario > Registrar merma.

Usar merma cuando el stock ya no debe usarse.

Ejemplos:

- Producto vencido.
- Empaque abierto o contaminado.
- Ampolla dañada.
- Pérdida confirmada.

### Ejemplo

Se descartan 20 guantes por lote vencido.

Movimiento:

- Tipo: merma.
- Item: Guantes nitrilo M.
- Cantidad: 20.
- Lote: GUA-M-L1.
- Motivo: Descarte por lote vencido.

Resultado:

- Stock general baja 20.
- Lote baja 20.
- Reportes muestran merma.

## 12. Transferencias

Ruta:

Inventario > Movimiento > Transferencia.

La transferencia documenta traslado entre ubicaciones.

Ejemplo:

- Desde: Almacén central.
- Hacia: Consultorio 1.
- Item: Gasas estériles.
- Cantidad: 30.

Uso recomendado:

- Registrar la transferencia para tener historial.
- Verificar luego la ubicación principal del item si se trabaja con stock por ubicación.

Nota operativa:

El módulo actual conserva stock general por item. Si la clínica necesita saldos separados por ubicación, conviene evolucionar a stock por item, lote y ubicación.

## 13. Turnos de inventario

Ruta:

Inventario > Turnos.

### Para qué sirve un turno

Sirve para comparar lo que el sistema esperaba contra lo que realmente hay.

Esto es normal en una clínica. A veces no se registra un uso en el momento, alguien descarta algo, se usa un insumo rápido, o se cuenta después.

El cierre de turno corrige esa realidad.

### Abrir turno

Al abrir turno, el sistema crea una línea por cada item activo de la ubicación.

Guarda:

- Stock dejado al abrir.
- Stock esperado.
- Stock contado.
- Diferencia.

### Cerrar turno

Al cerrar turno, la responsable escribe el conteo físico.

Ejemplo:

- Sistema esperaba 5 ampollas de Botox.
- Conteo físico: 4.
- Diferencia: -1.
- Stock final: 4.

Con trazabilidad por lote:

- Si existe lote activo, el sistema descuenta la diferencia del lote más lógico.
- Prioriza el lote con vencimiento más cercano.
- Si no encuentra lote, deja un movimiento de conteo sin lote identificado.

### Diferencia negativa

Significa faltante físico.

Ejemplo:

- Esperado: 5.
- Contado: 4.
- Diferencia: -1.

Qué hacer:

1. Confirmar si fue uso en paciente no registrado.
2. Confirmar si fue uso interno.
3. Confirmar si fue merma o descarte.
4. Si no se sabe, cerrar turno y dejar nota clara.

Resultado:

- El sistema corrige stock a 4.
- Si hay lote, baja el lote.
- Kardex registra diferencia de cierre.

### Diferencia positiva

Significa sobrante físico.

Ejemplo:

- Esperado: 10.
- Contado: 12.
- Diferencia: +2.

Posibles causas:

- Compra no registrada.
- Entrada pendiente.
- Error de conteo anterior.
- Item encontrado en otra zona.

Resultado:

- El sistema corrige stock a 12.
- Si hay lote activo, suma al lote más lógico.
- Si no hay lote, deja movimiento sin lote identificado.

### Reabrir turno

Solo Superusuario puede reabrir turno cerrado.

Usar cuando:

- Se cerró con conteo equivocado.
- Se escribió mal una cantidad.
- Se necesita corregir una nota de cierre.

No usar para ocultar diferencias. Si hubo faltante real, debe quedar registrado.

## 14. Alertas

Ruta:

Inventario > Alertas.

El sistema muestra:

- Stock bajo.
- Sin stock.
- Lotes vencidos.
- Lotes por vencer.
- Items sin costo configurado.

### Stock bajo

Un item aparece cuando:

Stock actual <= stock mínimo.

Ejemplo:

- Stock actual: 4.
- Stock mínimo: 8.
- Aparece en alerta.

### Vencimiento

Un lote aparece por vencer si está dentro de los días de alerta configurados.

Ejemplo:

- Hoy: 2026-07-16.
- Lote vence: 2026-08-05.
- Días de alerta: 30.
- Aparece como lote por vencer.

### Qué hacer con alertas

Stock bajo:

1. Revisar proveedor principal.
2. Revisar si hay pedido abierto.
3. Crear pedido proveedor si corresponde.

Lote por vencer:

1. Priorizar uso si es clínicamente válido.
2. Evitar comprar más del mismo producto si hay stock próximo a vencer.
3. Registrar merma si ya no se puede usar.

Lote vencido:

1. No usar en pacientes.
2. Separar físicamente.
3. Registrar merma o descarte.

## 15. Pedidos a proveedores

Ruta:

Inventario > Pedidos.

Sirve para pedir, recibir y pagar mercadería.

### Crear pedido

Campos:

- Proveedor.
- Tipo de pedido: compra, crédito o consignación.
- Ubicación de ingreso.
- Ciudad.
- Número de pedido.
- Número de factura.
- Fecha de solicitud.
- Vencimiento o cobranza.
- Items del pedido.
- Cantidad pedida.
- Cantidad recibida.
- Costo unitario.
- Lote.
- Vencimiento.

### Ejemplo

Pedido:

- Proveedor: Estériles Express.
- Item: Gasas estériles 10x10.
- Cantidad pedida: 100.
- Cantidad recibida: 100.
- Costo unitario: Bs. 0,50.
- Lote: GAS-L2.
- Vencimiento: 2027-07-16.

Resultado al recibir:

- Pedido cambia a recibido.
- Se crea o actualiza lote.
- Se registra entrada de inventario.
- Stock sube.
- Kardex muestra entrada.

### Pedido por WhatsApp

El módulo permite armar mensaje con proveedor e items.

Recomendación:

- Revisar cantidades antes de enviar.
- Confirmar proveedor y WhatsApp.
- Guardar pedido antes de enviarlo.

### Pago a proveedor

Cuando se registra pago:

- Se crea pago del pedido.
- Se puede enlazar a caja como egreso.
- Cambia estado de pago: pendiente, parcial o pagado.

Ejemplo:

- Total pedido: Bs. 50.
- Pago registrado: Bs. 25.
- Estado: parcial.
- Pendiente: Bs. 25.

Regla recomendada:

No registrar pagos mayores al saldo salvo que exista una decisión administrativa explícita.

## 16. Reportes

Ruta:

Inventario > Reportes.

Reportes disponibles:

- Consumo detalle.
- Consumo resumen.
- Conteos responsables.
- Responsables por periodo.
- Items.
- Lotes.
- Kardex completo.
- Proveedores.

### Consumo por insumo

Muestra:

- Uso en pacientes.
- Uso interno.
- Merma.
- Total consumido.
- Costo estimado.

Ejemplo:

Item: Aguja 30G.
Interno: 25 unidades.
Merma: 0.
Pacientes: 0.
Costo estimado: 25 x costo unitario.

### Responsables del periodo

Sirve para ver quién registró movimientos o conteos.

Uso recomendado:

- Revisar diferencias recurrentes por turno.
- Detectar si alguien registra consumos sin lote.
- Capacitar al equipo si hay errores repetidos.

### Kardex completo

Sirve para auditoría.

Debe responder:

- Qué cambió.
- Cuánto cambió.
- Cuándo cambió.
- Quién lo registró.
- Con qué lote.
- Con qué referencia.

## 17. Correcciones y buenas prácticas

### Si se olvidó registrar una salida

Opción A:

- Registrar salida manual con motivo real.

Opción B:

- Si se detecta al cierre, dejar que el turno corrija y escribir nota.

Recomendación:

Si se sabe exactamente qué pasó, registrar salida. Si solo se descubre al contar, usar cierre de turno con nota clara.

### Si se cargó una entrada duplicada

No borrar sin revisar.

Pasos:

1. Ir a Movimientos.
2. Buscar el item o referencia.
3. Confirmar si hay duplicado.
4. Si el rol lo permite, archivar o corregir según política interna.
5. Revisar lote y stock final.

### Si el lote no coincide con stock general

Posibles causas:

- Cierre antiguo que ajustó stock sin lote.
- Movimiento sin lote.
- Corrección manual directa.
- Transferencia o carga inicial incompleta.

Qué hacer:

1. Ver Kardex del item.
2. Revisar lotes disponibles.
3. Revisar turnos con diferencia.
4. Si se sabe el lote correcto, registrar ajuste operativo.
5. Si no se sabe, dejar nota y corregir en siguiente cierre.

### Si hay lote vencido con stock

No usar.

Pasos:

1. Separar físicamente.
2. Registrar merma.
3. Dejar motivo: "Descarte por lote vencido".
4. Revisar alertas.

### Si hay sobrante físico

Ejemplo:

El sistema dice 8, pero se cuentan 10.

Posibles acciones:

- Si se encontró factura o compra no registrada, registrar entrada.
- Si no se sabe origen, cerrar turno con diferencia positiva y nota.

## 18. Reglas de oro

- Todo insumo clínico con vencimiento debe tener lote.
- Todo consumo en paciente debe registrar lote cuando aplique.
- No usar stock actual directo como flujo normal.
- Las entradas deben venir de compra, lote o pedido proveedor.
- Las salidas deben venir de paciente, uso interno, merma o cierre.
- Toda diferencia de turno debe tener nota.
- No borrar historial para "arreglar números".
- Si hay duda, registrar nota antes que inventar una causa.

## 19. Checklist rápido

### Antes de abrir clínica

- Revisar alertas.
- Revisar lotes por vencer.
- Abrir turno si corresponde.
- Confirmar stock crítico.

### Durante la atención

- Registrar uso en paciente.
- Registrar mermas al momento.
- Registrar entradas al recibir productos.
- Usar lote correcto.

### Antes de cerrar

- Contar físicamente.
- Guardar conteos.
- Cerrar turno.
- Revisar diferencias.
- Crear pedidos si hay stock bajo.

## 20. Ejemplos completos

### Caso 1: Compra directa de agujas

Situación:

Llegan 250 agujas 30G del proveedor.

Acción:

Registrar entrada con lote AG30-L1.

Resultado:

- Stock sube 250.
- Lote sube 250.
- Kardex muestra entrada.
- Reporte de entradas incluye la compra.

### Caso 2: Uso en paciente

Situación:

Se aplica 1 ampolla de Botox a una paciente.

Acción:

Registrar consumo en historia clínica o movimiento ligado al paciente.

Resultado:

- Stock baja 1.
- Lote baja 1.
- Kardex muestra salida.
- Historial clínico conserva trazabilidad.

### Caso 3: Cierre detecta faltante

Situación:

El sistema esperaba 5 ampollas, pero hay 4.

Acción:

Cerrar turno con conteo 4 y nota: "Faltante detectado en cierre, revisar atención de la tarde".

Resultado:

- Stock final queda en 4.
- Si existe lote activo, el lote baja a 4.
- Kardex muestra diferencia de cierre.

### Caso 4: Pedido a proveedor recibido parcialmente

Situación:

Se pidieron 100 gasas, pero llegaron 60.

Acción:

En pedido proveedor, poner cantidad recibida 60.

Resultado:

- Entra solo 60 al inventario.
- El pedido queda según el flujo configurado.
- Debe revisarse el saldo pendiente con proveedor.

### Caso 5: Producto vencido

Situación:

Lote de guantes vencido con 80 unidades.

Acción:

Registrar merma de 80 con motivo "Lote vencido".

Resultado:

- Stock baja 80.
- Lote baja 80.
- Alerta desaparece cuando ya no hay cantidad disponible.

## 21. Problemas frecuentes

### "No pudimos cargar el inventario completo"

Puede pasar si falla una consulta, permiso, tabla o relación.

Qué revisar:

- Si Supabase está corriendo.
- Si el usuario tiene rol autorizado.
- Si las tablas de inventario existen.
- Si hay políticas RLS correctas.
- Si el módulo de pedidos/proveedores tiene datos inconsistentes.

### "El movimiento dejaría stock negativo"

Significa que se intenta descontar más de lo disponible.

Qué hacer:

- Revisar stock actual.
- Revisar lote seleccionado.
- Revisar si el movimiento ya fue registrado.
- Hacer conteo físico si el sistema no coincide.

### "El lote quedaría con cantidad negativa"

Significa que el lote elegido no tiene suficiente cantidad.

Qué hacer:

- Seleccionar otro lote con stock.
- Verificar cantidad.
- Revisar si el consumo corresponde a otro lote.

### "Ya tienes un turno abierto"

Solo debe haber un turno abierto por responsable y ubicación.

Qué hacer:

- Cerrar el turno anterior.
- Pedir a Superusuario que revise si quedó abierto por error.

## 22. Cierre

El módulo de inventario funciona mejor cuando se usa como bitácora operativa, no como una hoja de cálculo.

Cada entrada, salida, merma, recepción, pago, lote y conteo cuenta una parte de la historia. Si el equipo registra con disciplina y deja notas claras cuando algo no se sabe, el inventario se vuelve confiable para decisiones clínicas, compras y auditoría.
