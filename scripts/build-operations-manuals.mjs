import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopPosition,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";

const BRAND = {
  ink: "2B211B",
  copy: "6F5A4C",
  accent: "B88A5A",
  mocha: "6E4A2F",
  beige: "EFE5DA",
  soft: "FFF9F4",
  border: "D8C2AE",
  green: "6F7A60",
};

const outputDir = path.resolve("manuales");
fs.mkdirSync(outputDir, { recursive: true });

const today = new Date().toLocaleDateString("es-BO", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function pageFooter(label) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${label}  |  `, color: BRAND.copy, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: BRAND.copy, size: 18 }),
        ],
      }),
    ],
  });
}

function baseText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 140, line: 320 },
    ...opts,
    children: [new TextRun({ text, color: BRAND.ink, size: 22 })],
  });
}

function title(text, level = HeadingLevel.HEADING_1, pageBreakBefore = false) {
  return new Paragraph({
    text,
    heading: level,
    pageBreakBefore,
    spacing: { before: 120, after: 140 },
    thematicBreak: false,
    children: [new TextRun({ text, bold: true, color: BRAND.mocha, size: level === HeadingLevel.HEADING_1 ? 34 : 28 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, color: BRAND.ink, size: 22 })],
  });
}

function coverBlock(titleText, subtitle) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: BRAND.mocha, color: BRAND.mocha },
            margins: { top: 260, bottom: 260, left: 260, right: 260 },
            borders: noBorders(),
            children: [
              new Paragraph({
                children: [new TextRun({ text: titleText, bold: true, color: "FFFFFF", size: 42 })],
                spacing: { after: 120 },
              }),
              new Paragraph({
                children: [new TextRun({ text: subtitle, color: "F7F2EC", size: 24 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2800, 6200],
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          tableCell(label, { bold: true, shading: BRAND.beige }),
          tableCell(value),
        ],
      })
    ),
  });
}

function noteBox(titleText, bodyText) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: softBorders(),
            shading: { fill: BRAND.soft, color: BRAND.soft },
            margins: { top: 160, bottom: 160, left: 180, right: 180 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: titleText, bold: true, color: BRAND.green, size: 22 })],
              }),
              new Paragraph({
                spacing: { after: 20, line: 300 },
                children: [new TextRun({ text: bodyText, color: BRAND.ink, size: 22 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function workflowTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((item) =>
          new TableCell({
            shading: { fill: BRAND.mocha, color: BRAND.mocha },
            margins: { top: 140, bottom: 140, left: 140, right: 140 },
            borders: noBorders(),
            children: [
              new Paragraph({
                children: [new TextRun({ text: item, bold: true, color: "FFFFFF", size: 20 })],
              }),
            ],
          })
        ),
      }),
      ...rows.map((row) =>
        new TableRow({
          children: row.map((item, index) =>
            tableCell(item, {
              bold: index === 0,
              shading: index === 0 ? BRAND.beige : undefined,
            })
          ),
        })
      ),
    ],
  });
}

function tableCell(text, options = {}) {
  return new TableCell({
    borders: softBorders(),
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    shading: options.shading ? { fill: options.shading, color: options.shading } : undefined,
    children: [
      new Paragraph({
        spacing: { after: 20, line: 280 },
        children: [
          new TextRun({
            text,
            color: BRAND.ink,
            size: 20,
            bold: options.bold ?? false,
          }),
        ],
      }),
    ],
  });
}

function softBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: BRAND.border },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BRAND.border },
    left: { style: BorderStyle.SINGLE, size: 1, color: BRAND.border },
    right: { style: BorderStyle.SINGLE, size: 1, color: BRAND.border },
  };
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
}

function spacer(lines = 1) {
  return new Paragraph({ spacing: { after: 80 * lines } });
}

function buildInventoryDoc() {
  return new Document({
    creator: "Codex",
    title: "Manual Operativo de Inventario",
    description: "Guia de uso del modulo de inventario para el equipo clinico y administrativo.",
    sections: [
      {
        properties: {},
        footers: { default: pageFooter("Manual de Inventario") },
        children: [
          coverBlock("Manual Operativo de Inventario", "Uso diario del modulo de insumos, lotes, movimientos, conteos y reportes."),
          spacer(2),
          infoTable([
            ["Dirigido a", "Doctoras, asistentes y administracion"],
            ["Modulo", "Panel / Inventario"],
            ["Version", "Inventario profundo con categorias, unidades, proveedores, lotes y conteos"],
            ["Fecha", today],
          ]),
          spacer(2),
          noteBox(
            "Objetivo del modulo",
            "Mantener control claro de los insumos y productos: cuanto hay, donde esta, quien lo movio, que lote se uso, que esta por vencer y que reportes se pueden descargar."
          ),
          title("1. Que se puede hacer en inventario", HeadingLevel.HEADING_1, true),
          baseText("La pantalla de inventario tiene nueve areas principales:"),
          bullet("Resumen: muestra stock bajo, sin stock, lotes por vencer, vencidos y valor estimado."),
          bullet("Items / Insumos: catalogo principal de todo lo que se controla."),
          bullet("Categorias: agrupan por familia, por ejemplo toxina, relleno, ortomolecular, bioseguridad o papeleria."),
          bullet("Lotes: permiten saber numero de lote, proveedor, costo, ubicacion y fecha de vencimiento."),
          bullet("Movimientos: funciona como kardex para entradas, salidas, mermas, transferencias y ajustes."),
          bullet("Conteos: registra conteos fisicos para actualizar stock real."),
          bullet("Alertas: concentra stock bajo, vencimientos y faltas de costo."),
          bullet("Reportes: descarga CSV para auditoria o cierre administrativo."),
          bullet("Proveedores: guarda contactos de compra y tambien ubicaciones y unidades de medida."),
          noteBox(
            "Idea clave",
            "En inventario no se recomienda corregir datos 'por encima'. Lo correcto es crear un movimiento o un conteo para dejar trazabilidad."
          ),
          title("2. Flujo recomendado de cada dia", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Momento", "Accion", "Donde", "Resultado esperado"],
            [
              ["Al iniciar", "Revisar Resumen y Alertas", "Pestanas Resumen y Alertas", "Ver si hay faltantes, vencidos o costos pendientes"],
              ["Cuando llega mercaderia", "Registrar compra / entrada", "Resumen o Movimientos", "Sube stock, deja fecha y proveedor"],
              ["Si se desperdicia o dana algo", "Registrar merma", "Resumen o Movimientos", "Baja stock con motivo"],
              ["Si cambia de lugar", "Registrar transferencia", "Movimientos", "Queda claro origen y destino"],
              ["Al final del dia o la noche", "Crear conteo", "Conteos", "Ajusta stock real y deja historial"],
              ["Al cerrar semana o mes", "Exportar reportes", "Reportes", "Se obtiene respaldo en CSV"],
            ]
          ),
          title("3. Crear y mantener items", HeadingLevel.HEADING_1, true),
          baseText("Cada item o insumo debe existir una sola vez. Antes de crear uno nuevo, busca si ya existe para evitar duplicados."),
          workflowTable(
            ["Campo", "Para que sirve", "Recomendacion practica"],
            [
              ["Nombre", "Identifica el insumo", "Usar nombre claro y estable"],
              ["Tipo", "Diferencia insumo, producto u otro control", "Mantener criterio igual para todo el equipo"],
              ["Categoria", "Ordena el inventario", "Crear categorias sencillas y reutilizables"],
              ["Unidad", "Controla stock por pieza, gramo, litro, caja, etc.", "Elegir la unidad base real de trabajo"],
              ["Proveedor", "Relaciona compras y lotes", "Seleccionar si ya existe"],
              ["Stock minimo", "Dispara alerta", "Definirlo segun consumo real"],
              ["Costo referencial", "Ayuda al valor estimado", "No dejarlo vacio si ya se conoce"],
              ["Ubicacion", "Dice donde se guarda", "Ejemplo: refrigerador, deposito, consultorio 1"],
            ]
          ),
          noteBox(
            "Buena practica",
            "Si un insumo viene en caja pero se usa por unidad, el item debe reflejar la unidad que realmente se consume. La caja puede manejarse como empaque o en el lote."
          ),
          title("4. Categorias, unidades, proveedores y ubicaciones", HeadingLevel.HEADING_1, true),
          baseText("Estas configuraciones se llenan una vez y luego se reutilizan en todo el modulo."),
          bullet("Categorias: sirven para ordenar y filtrar. No hace falta crear demasiadas."),
          bullet("Unidades: permiten trabajar con pieza, unidad, gramo, kilogramo, mililitro, litro, caja, ampolla u otras."),
          bullet("Proveedores: guardan nombre, contacto, telefono, email, direccion y notas."),
          bullet("Ubicaciones: representan almacen principal, refrigerador, deposito, consultorio, barra o cualquier zona interna."),
          title("5. Lotes y vencimientos", HeadingLevel.HEADING_1, true),
          baseText("Los lotes son importantes para insumos clinicos porque ayudan a trazabilidad, costos y vencimientos."),
          workflowTable(
            ["Dato del lote", "Uso operativo", "Ejemplo"],
            [
              ["Numero de lote", "Trazabilidad", "Lote del fabricante"],
              ["Proveedor", "Rastrea compra", "Distribuidor o laboratorio"],
              ["Ubicacion", "Sabe donde esta el lote", "Refrigerador 1"],
              ["Cantidad inicial", "Cuanto entro", "10 ampollas"],
              ["Cantidad actual", "Cuanto queda de ese lote", "6 ampollas"],
              ["Fecha de vencimiento", "Alertas y seguridad", "31/12/2026"],
            ]
          ),
          noteBox(
            "Regla sencilla",
            "Si un producto tiene vencimiento o lote del fabricante, lo recomendable es registrarlo como lote. Eso protege a la clinica en control y auditoria."
          ),
          title("6. Movimientos: entrada, salida, merma y transferencia", HeadingLevel.HEADING_1, true),
          baseText("El kardex es el historial de cada cambio de stock. No solo dice cuanto se movio, sino por que y desde donde."),
          workflowTable(
            ["Tipo de movimiento", "Cuando usarlo", "Impacto"],
            [
              ["Entrada", "Llega compra o reposicion", "Sube stock"],
              ["Salida", "Se entrega o consume de forma controlada", "Baja stock"],
              ["Merma", "Producto roto, vencido o desperdiciado", "Baja stock con motivo"],
              ["Transferencia", "Pasa de una ubicacion a otra", "No cambia total, solo lugar"],
              ["Ajuste", "Correccion operativa especial", "Cambia stock con justificacion"],
            ]
          ),
          bullet("Siempre escribir motivo cuando el movimiento no sea una compra simple."),
          bullet("Si el movimiento esta ligado a lote, elegir el lote correcto."),
          bullet("Si la operacion cambia de lugar, completar origen y destino."),
          title("7. Conteos fisicos", HeadingLevel.HEADING_1, true),
          baseText("Los conteos sirven para cuadrar el sistema con lo que realmente existe al final del dia o de la noche."),
          bullet("Entrar a Conteos o usar el boton rapido 'Crear conteo'."),
          bullet("Elegir item, stock contado real, ubicacion y notas."),
          bullet("Guardar el conteo. El sistema actualiza stock y deja historial."),
          noteBox(
            "Recomendacion de cierre",
            "Si el equipo hace conteo nocturno, conviene que una sola persona cierre los conteos del dia para evitar dobles correcciones sobre el mismo item."
          ),
          title("8. Alertas y reportes", HeadingLevel.HEADING_1, true),
          baseText("La pestana de Alertas no es solo informativa. Debe revisarse como rutina de control."),
          bullet("Stock bajo: programar compra o traslado."),
          bullet("Sin stock: detener promesa de uso hasta reponer."),
          bullet("Por vencer: priorizar uso o revisar si corresponde devolver."),
          bullet("Vencidos: registrar merma y aislar el producto."),
          bullet("Sin costo: completar para que el valor estimado no quede incompleto."),
          baseText("En Reportes se descargan CSV de items, lotes, movimientos, conteos y proveedores. Son utiles para auditoria, conciliacion interna y respaldo administrativo."),
          title("9. Buenas practicas para el equipo", HeadingLevel.HEADING_1, true),
          bullet("No editar un item para 'tapar' una diferencia. Usar movimiento o conteo."),
          bullet("No duplicar proveedores o unidades por diferencias pequenas de escritura."),
          bullet("Registrar mermas el mismo dia, no varios dias despues."),
          bullet("Usar notas claras cuando algo se ajusta manualmente."),
          bullet("Archivar registros obsoletos, pero no borrar si todavia hay historial relevante."),
          title("10. Errores comunes y como resolverlos", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Problema", "Que revisar", "Solucion recomendada"],
            [
              ["No aparece el item", "Filtro o archivo", "Buscar por nombre o revisar si fue archivado"],
              ["El stock no coincide", "Ultimos movimientos y conteos", "Hacer conteo fisico y ajustar con trazabilidad"],
              ["No sale la ubicacion correcta", "Campo de ubicacion del item o lote", "Actualizar item o hacer transferencia"],
              ["No hay costo estimado", "Costo referencial o costo del lote", "Completar el valor faltante"],
              ["Hay demasiadas alertas", "Stock minimo o fechas mal cargadas", "Corregir configuracion base del item o lote"],
            ]
          ),
          title("11. Checklist rapido del dia", HeadingLevel.HEADING_1, true),
          bullet("Revisar Resumen y Alertas."),
          bullet("Registrar compras, salidas o mermas en el momento en que ocurren."),
          bullet("No dejar lotes nuevos sin fecha o sin proveedor."),
          bullet("Antes de salir, revisar si hubo diferencias y si hace falta conteo."),
          bullet("Descargar reportes cuando administracion los solicite."),
        ],
      },
    ],
  });
}

function buildCashDoc() {
  return new Document({
    creator: "Codex",
    title: "Manual Operativo de Caja",
    description: "Guia de uso del modulo de caja para el equipo clinico y administrativo.",
    sections: [
      {
        properties: {},
        footers: { default: pageFooter("Manual de Caja") },
        children: [
          coverBlock("Manual Operativo de Caja", "Uso diario del modulo de aperturas, movimientos, arqueos, cierres y pagos aprobados desde el sistema."),
          spacer(2),
          infoTable([
            ["Dirigido a", "Doctoras, asistentes y administracion"],
            ["Modulo", "Panel / Caja"],
            ["Version", "Caja avanzada con sesiones, arqueos, cajas, metodos y entradas automaticas"],
            ["Fecha", today],
          ]),
          spacer(2),
          noteBox(
            "Objetivo del modulo",
            "Controlar todo dinero que entra o sale: aperturas, ingresos, egresos, arqueos, cierres y pagos aprobados desde cursos, libros o citas."
          ),
          title("1. Conceptos basicos de caja", HeadingLevel.HEADING_1, true),
          bullet("Caja o sucursal: lugar fisico o punto de control donde se reciben pagos."),
          bullet("Apertura: inicio de la jornada con monto base."),
          bullet("Movimiento: ingreso o egreso manual o automatico."),
          bullet("Arqueo: conteo parcial para revisar si el efectivo coincide."),
          bullet("Cierre: conteo final de la jornada para dejar diferencia registrada."),
          bullet("Metodo de pago: efectivo, QR, transferencia, tarjeta u otro configurado."),
          bullet("Ingreso automatico: pago que entra a caja cuando se aprueba algo desde otro modulo."),
          noteBox(
            "Diferencia importante",
            "Caja no solo sirve para anotar pagos manuales. Tambien recibe automaticamente ingresos aprobados desde reservas, inscripciones y libros."
          ),
          title("2. Que entra automaticamente a caja", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Origen", "Cuando entra", "Que pide el sistema"],
            [
              ["Reserva de cita", "Cuando administracion aprueba el pago", "Monto pagado y metodo de pago"],
              ["Inscripcion de curso", "Cuando se confirma la inscripcion", "Monto pagado y metodo de pago"],
              ["Pedido de libro", "Cuando se aprueba el pedido", "Monto pagado y metodo de pago"],
              ["Cita manual cobrada", "Cuando el equipo la crea marcando que ya se cobro", "Monto y metodo al registrar la cita"],
            ]
          ),
          baseText("Si algo aprobado luego se cancela o se retira del estado correcto, el sistema deja trazabilidad y el movimiento no desaparece sin control."),
          title("3. Flujo recomendado de cada dia", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Momento", "Accion", "Donde", "Resultado esperado"],
            [
              ["Al iniciar", "Abrir caja", "Pestana Aperturas y cierres", "Sesion nueva con monto inicial"],
              ["Durante el dia", "Revisar pagos aprobados", "Movimientos", "Ver ingresos manuales y automaticos"],
              ["Si hay gasto o retiro", "Registrar egreso manual", "Movimientos", "Salida con concepto y metodo"],
              ["Mitad del dia", "Hacer arqueo parcial", "Arqueos", "Comparar esperado vs contado"],
              ["Fin de jornada", "Cerrar caja con conteo", "Arqueos o Sesiones", "Se guarda diferencia final"],
              ["Cuando piden respaldo", "Exportar CSV", "Cabecera del modulo", "Reportes listos para administracion o auditoria"],
            ]
          ),
          title("4. Abrir una caja", HeadingLevel.HEADING_1, true),
          bullet("Entrar a Caja y abrir la pestana 'Aperturas y cierres'."),
          bullet("Presionar 'Nueva apertura'."),
          bullet("Elegir la caja o sucursal si ya esta creada."),
          bullet("Revisar ciudad, lugar y monto inicial."),
          bullet("Guardar la apertura antes de empezar a registrar cobros."),
          noteBox(
            "Buena practica",
            "Cada jornada debe tener una apertura real. Evita registrar movimientos sueltos sin sesion, salvo casos muy excepcionales."
          ),
          title("5. Registrar movimientos manuales", HeadingLevel.HEADING_1, true),
          baseText("Los movimientos manuales son para situaciones que no vienen desde otro modulo o que requieren una salida directa de caja."),
          workflowTable(
            ["Campo", "Como usarlo", "Ejemplos"],
            [
              ["Tipo", "Ingreso o egreso", "Ingreso por efectivo directo; egreso por compra menor"],
              ["Monto", "Valor real cobrado o pagado", "Bs. 150"],
              ["Metodo de pago", "Como se movio el dinero", "Efectivo, QR, transferencia"],
              ["Categoria", "Clasifica el movimiento", "Venta, gasto, retiro, ajuste"],
              ["Origen", "Modulo o motivo", "Cita, curso, libro, gasto interno"],
              ["Concepto", "Descripcion corta y clara", "Pago de control"],
            ]
          ),
          bullet("Si el movimiento tiene una apertura abierta, asociarlo a esa sesion."),
          bullet("Si es un gasto, explicar claramente en notas o concepto."),
          bullet("No modificar ingresos automaticos salvo que se este corrigiendo una incidencia validada."),
          title("6. Arqueos parciales", HeadingLevel.HEADING_1, true),
          baseText("El arqueo parcial sirve para revisar caja antes del cierre. Es muy util cuando hubo mucho movimiento o cuando cambia la persona responsable."),
          bullet("Elegir la sesion abierta."),
          bullet("Presionar 'Arqueo'."),
          bullet("Contar por denominaciones: billetes y monedas."),
          bullet("Guardar el arqueo y revisar la diferencia."),
          noteBox(
            "Que hacer si hay diferencia",
            "No se debe ocultar la diferencia. Primero revisar movimientos recientes; si sigue existiendo, dejar nota clara en el arqueo o en el cierre."
          ),
          title("7. Cierre de caja", HeadingLevel.HEADING_1, true),
          bullet("Entrar a la sesion abierta y elegir 'Cerrar caja'."),
          bullet("Contar efectivo por denominaciones."),
          bullet("El sistema compara monto esperado con monto contado."),
          bullet("Guardar notas si existe diferencia, retiro previo o particularidad del dia."),
          bullet("Una vez cerrada la caja, la sesion queda lista para consulta y reporte."),
          workflowTable(
            ["Dato del cierre", "Para que sirve"],
            [
              ["Esperado", "Monto que deberia existir segun apertura y movimientos"],
              ["Contado", "Monto real contado por el equipo"],
              ["Diferencia", "Variacion entre esperado y contado"],
              ["Notas de cierre", "Justificacion o contexto"],
            ]
          ),
          title("8. Cajas, metodos y configuracion", HeadingLevel.HEADING_1, true),
          baseText("La pestana 'Cajas y metodos' define la estructura operativa del modulo."),
          bullet("Cajas y sucursales: nombre, ciudad, ubicacion, monto base sugerido y metodos que acepta."),
          bullet("Metodos de pago: lista oficial de formas de cobro."),
          bullet("Denominaciones: billetes y monedas para arqueo."),
          baseText("Lo ideal es no crear cajas duplicadas con nombres parecidos. Mantener una sola por punto real de trabajo."),
          title("9. Reportes y auditoria", HeadingLevel.HEADING_1, true),
          bullet("CSV movimientos: sirve para revisar ingresos, egresos, origen, metodo y estado."),
          bullet("CSV sesiones: resume apertura, esperado, contado y diferencia."),
          bullet("CSV arqueos: muestra controles parciales y cierres."),
          bullet("Superadmin conserva visibilidad de registros archivados o anulados para auditoria."),
          title("10. Buenas practicas para doctoras y administracion", HeadingLevel.HEADING_1, true),
          bullet("Abrir caja antes de empezar el dia."),
          bullet("No dejar pagos aprobados sin monto o sin metodo."),
          bullet("Si una cita ya se cobro manualmente, marcarlo al momento de crearla."),
          bullet("No registrar el mismo cobro dos veces: si ya entro automatico desde otro modulo, no volver a crearlo manualmente."),
          bullet("Hacer arqueo si hubo mucho efectivo o si cambia la persona que atiende caja."),
          bullet("Cerrar caja el mismo dia, no varios dias despues."),
          title("11. Errores comunes y como resolverlos", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Problema", "Que revisar", "Solucion"],
            [
              ["No aparece el ingreso", "Estado del modulo origen", "Confirmar que el pago haya sido aprobado y con monto"],
              ["El cierre no cuadra", "Movimientos del dia y arqueo", "Revisar duplicados o faltantes y dejar nota"],
              ["No se ve la caja correcta", "Sesion o drawer asignado", "Editar apertura o movimiento si fue manual"],
              ["Hay ingresos sin metodo", "Aprobacion incompleta", "Completar metodo al aprobar"],
              ["Se registro doble", "Movimiento manual y automatico", "Anular el que no corresponde con trazabilidad"],
            ]
          ),
          title("12. Checklist rapido del dia", HeadingLevel.HEADING_1, true),
          bullet("Abrir caja."),
          bullet("Revisar que pagos aprobados entren con monto y metodo."),
          bullet("Registrar egresos manuales al momento de ocurrir."),
          bullet("Hacer arqueo si hace falta control intermedio."),
          bullet("Cerrar caja con conteo al final de la jornada."),
          bullet("Exportar CSV cuando administracion o auditoria lo soliciten."),
        ],
      },
    ],
  });
}

async function writeDoc(filename, doc) {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outputDir, filename), buffer);
}

await writeDoc("Manual_Operativo_Inventario.docx", buildInventoryDoc());
await writeDoc("Manual_Operativo_Caja.docx", buildCashDoc());

console.log("Manuales generados en", outputDir);
