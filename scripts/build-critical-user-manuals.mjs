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
  TextRun,
  WidthType,
} from "docx";

const outputDir = path.resolve("manuales");
fs.mkdirSync(outputDir, { recursive: true });

const BRAND = {
  ink: "2B211B",
  copy: "66564B",
  mocha: "6E4A2F",
  accent: "B88A5A",
  beige: "EFE5DA",
  soft: "FFF9F4",
  border: "D8C2AE",
  green: "6F7A60",
  red: "9B3B35",
};

const today = new Date().toLocaleDateString("es-BO", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function run(text, options = {}) {
  return new TextRun({
    text,
    color: options.color ?? BRAND.ink,
    bold: options.bold ?? false,
    italics: options.italics ?? false,
    size: options.size ?? 22,
  });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    alignment: options.alignment,
    spacing: { before: options.before ?? 0, after: options.after ?? 120, line: 300 },
    bullet: options.bullet ? { level: 0 } : undefined,
    children: [run(text, options)],
  });
}

function heading(text, level = HeadingLevel.HEADING_1, pageBreakBefore = false) {
  return new Paragraph({
    heading: level,
    pageBreakBefore,
    spacing: { before: 160, after: 120 },
    children: [
      run(text, {
        bold: true,
        color: level === HeadingLevel.HEADING_1 ? BRAND.mocha : BRAND.green,
        size: level === HeadingLevel.HEADING_1 ? 32 : 26,
      }),
    ],
  });
}

function cover(title, subtitle, label) {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: BRAND.mocha, color: BRAND.mocha },
              borders: noBorders(),
              margins: { top: 360, bottom: 360, left: 360, right: 360 },
              children: [
                new Paragraph({
                  spacing: { after: 80 },
                  children: [run(label.toUpperCase(), { color: "EFE5DA", bold: true, size: 18 })],
                }),
                new Paragraph({
                  spacing: { after: 150 },
                  children: [run(title, { color: "FFFFFF", bold: true, size: 42 })],
                }),
                new Paragraph({
                  spacing: { after: 0, line: 320 },
                  children: [run(subtitle, { color: "F7F2EC", size: 24 })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    paragraph("Documento operativo para uso interno del equipo. Actualizado al " + today + ".", {
      before: 220,
      color: BRAND.copy,
    }),
  ];
}

function footer(label) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run(`${label} | pagina `, { color: BRAND.copy, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: BRAND.copy, size: 18 }),
        ],
      }),
    ],
  });
}

function callout(title, body, tone = "green") {
  const fill = tone === "red" ? "FFF0EE" : BRAND.soft;
  const color = tone === "red" ? BRAND.red : BRAND.green;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill, color: fill },
            borders: softBorders(color),
            margins: { top: 170, bottom: 170, left: 190, right: 190 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [run(title, { bold: true, color, size: 22 })],
              }),
              new Paragraph({
                spacing: { after: 0, line: 300 },
                children: [run(body, { size: 21 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header) =>
          new TableCell({
            shading: { fill: BRAND.mocha, color: BRAND.mocha },
            borders: noBorders(),
            margins: { top: 140, bottom: 140, left: 140, right: 140 },
            children: [new Paragraph({ children: [run(header, { bold: true, color: "FFFFFF", size: 20 })] })],
          })
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell, index) =>
              new TableCell({
                shading: index === 0 ? { fill: BRAND.beige, color: BRAND.beige } : undefined,
                borders: softBorders(),
                margins: { top: 120, bottom: 120, left: 130, right: 130 },
                children: [
                  new Paragraph({
                    spacing: { after: 0, line: 280 },
                    children: [run(cell, { bold: index === 0, size: 20 })],
                  }),
                ],
              })
            ),
          })
      ),
    ],
  });
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
}

function softBorders(color = BRAND.border) {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color },
    bottom: { style: BorderStyle.SINGLE, size: 1, color },
    left: { style: BorderStyle.SINGLE, size: 1, color },
    right: { style: BorderStyle.SINGLE, size: 1, color },
  };
}

function buildCashManual() {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 22, color: BRAND.ink },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 960, right: 840, bottom: 820, left: 840 } },
        },
        footers: { default: footer("Manual de Usuario - Caja") },
        children: [
          ...cover(
            "Manual de Usuario - Caja",
            "Apertura, movimientos, comprobantes, arqueos, cierre y pagos que entran desde otros modulos.",
            "Modulo Caja"
          ),
          callout(
            "Cambio urgente recomendado",
            "Eliminar o restringir el cierre sin arqueo. Hoy permite cerrar usando el efectivo esperado como contado y puede ocultar faltantes o sobrantes. Debe quedar solo como cierre excepcional, con motivo obligatorio y permiso de superadmin/admin.",
            "red"
          ),
          heading("1. Objetivo del modulo"),
          paragraph(
            "Caja sirve para controlar el dinero real de la clinica: aperturas, ingresos, egresos, comprobantes, arqueos y cierres. Tambien recibe pagos aprobados desde reservas, libros, promociones, planes de pago, tarjetas de ahorro y pagos a proveedores."
          ),
          heading("2. Reglas de uso diario"),
          paragraph("Abrir caja antes de aprobar pagos o registrar movimientos del dia.", { bullet: true }),
          paragraph("Todo pago por QR, transferencia, tarjeta u otro metodo no efectivo debe tener comprobante.", { bullet: true }),
          paragraph("No duplicar ingresos: si un pago entra automatico desde otro modulo, no volver a registrarlo manualmente.", { bullet: true }),
          paragraph("Las diferencias de arqueo se documentan; no se esconden.", { bullet: true }),
          paragraph("Los egresos a proveedores deben quedar como salida de caja con referencia y comprobante cuando corresponda.", { bullet: true }),
          heading("3. Flujo operativo recomendado"),
          table(
            ["Momento", "Accion", "Resultado esperado"],
            [
              ["Inicio del dia", "Abrir caja con ciudad, punto de caja y monto inicial.", "La sesion queda lista para recibir movimientos."],
              ["Durante el dia", "Aprobar pagos solo con caja abierta.", "Cada pago queda ligado a una sesion de caja."],
              ["Ingreso manual", "Registrar concepto, monto, metodo, fecha y comprobante si no es efectivo.", "El movimiento entra al resumen y al arqueo."],
              ["Egreso", "Registrar gasto, retiro o pago a proveedor.", "El efectivo esperado baja si el metodo es efectivo."],
              ["Control parcial", "Hacer arqueo si cambia la responsable o hubo mucho efectivo.", "Queda evidencia de diferencia parcial."],
              ["Cierre", "Contar denominaciones y cerrar con arqueo.", "Se calcula diferencia real del dia."],
            ]
          ),
          heading("4. Comprobantes"),
          paragraph(
            "El comprobante no es decorativo: es la prueba operativa. Para QR, transferencia, tarjeta u otros metodos no efectivos, el sistema debe exigir imagen o documento antes de guardar."
          ),
          paragraph("Para efectivo puede ser opcional, salvo que se quiera adjuntar factura, recibo o respaldo interno.", { bullet: true }),
          paragraph("Para pagos a proveedores, se recomienda comprobante obligatorio si el metodo no es efectivo.", { bullet: true }),
          paragraph("Si un comprobante es incorrecto, no borrar el movimiento sin trazabilidad; se debe anular o corregir con nota.", { bullet: true }),
          heading("5. Arqueo y cierre"),
          paragraph(
            "El arqueo compara el efectivo esperado contra lo contado fisicamente. El esperado solo debe considerar movimientos de tipo efectivo; QR y transferencia quedan registrados, pero no deben sumarse al efectivo que hay en caja."
          ),
          table(
            ["Situacion", "Que hacer"],
            [
              ["Sobra dinero", "Revisar ingresos no registrados. Si no se identifica, cerrar con nota de sobrante."],
              ["Falta dinero", "Revisar egresos no registrados y pagos duplicados. Si persiste, cerrar con nota de faltante."],
              ["Caja cerrada por error", "No borrar datos. Reabrir/corregir solo con flujo administrativo definido."],
              ["Movimiento duplicado", "Anular el incorrecto o crear movimiento compensatorio, conservando la evidencia."],
            ]
          ),
          heading("6. Alertas para administracion"),
          paragraph("Movimientos aprobados sin sesion de caja.", { bullet: true }),
          paragraph("Pagos no efectivos sin comprobante.", { bullet: true }),
          paragraph("Cierres sin arqueo o con diferencia cero sospechosa.", { bullet: true }),
          paragraph("Borrados de movimientos, sesiones o arqueos.", { bullet: true }),
          paragraph("Pagos a proveedores superiores al pendiente.", { bullet: true }),
          heading("7. Prioridad de implementacion"),
          table(
            ["Prioridad", "Cambio", "Por que urge"],
            [
              ["Alta", "Bloquear cierre sin arqueo o convertirlo en cierre excepcional.", "Evita ocultar diferencias reales."],
              ["Alta", "Exigir caja abierta en planes de pago y tarjetas de ahorro.", "Evita ingresos fuera de sesion."],
              ["Alta", "Reemplazar borrado operativo por anulacion/reversa.", "Mantiene auditoria financiera."],
              ["Media", "Comprobante obligatorio para egresos no efectivos a proveedores.", "Mejora respaldo contable."],
            ]
          ),
        ],
      },
    ],
  });
}

function buildInventoryManual() {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 22, color: BRAND.ink },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 960, right: 840, bottom: 820, left: 840 } },
        },
        footers: { default: footer("Manual de Usuario - Inventario") },
        children: [
          ...cover(
            "Manual de Usuario - Inventario",
            "Items, lotes, vencimientos, compras, movimientos, turnos, conteo fisico y consumo clinico.",
            "Modulo Inventario"
          ),
          callout(
            "Cambio urgente recomendado",
            "Blindar la recepcion de pedidos para que un pedido ya recibido no vuelva a sumar stock. La pantalla lo evita en uso normal, pero la base debe impedirlo tambien para proteger el inventario real.",
            "red"
          ),
          heading("1. Objetivo del modulo"),
          paragraph(
            "Inventario controla insumos, productos, lotes, ubicaciones, proveedores, movimientos, pedidos y conteos fisicos. Tambien descuenta stock cuando se registra consumo desde historia clinica."
          ),
          heading("2. Reglas principales"),
          paragraph("Registrar cada item con unidad interna clara. Si se compra por presentacion, configurar cuantas unidades internas contiene.", { bullet: true }),
          paragraph("Usar lotes cuando exista vencimiento, proveedor o trazabilidad sanitaria.", { bullet: true }),
          paragraph("No corregir stock editando el item sin dejar movimiento, conteo o ajuste.", { bullet: true }),
          paragraph("Todo consumo clinico debe descontar stock desde el flujo de historia clinica.", { bullet: true }),
          paragraph("Los turnos se abren con stock inicial y se cierran con conteo fisico.", { bullet: true }),
          heading("3. Flujo operativo recomendado"),
          table(
            ["Momento", "Accion", "Resultado esperado"],
            [
              ["Alta de item", "Crear item con categoria, unidad, minimo, costo y ubicacion.", "El insumo aparece en alertas y movimientos."],
              ["Compra", "Crear pedido a proveedor y registrar cantidades recibidas.", "Al recibir, sube el stock y queda movimiento de entrada."],
              ["Pago a proveedor", "Registrar pago desde pedidos.", "Se crea egreso conectado a caja."],
              ["Uso clinico", "Descontar insumo desde la historia clinica.", "Queda salida con paciente/referencia."],
              ["Merma o vencido", "Registrar salida o merma con motivo.", "Baja stock con trazabilidad."],
              ["Cierre de turno", "Contar fisicamente y cerrar turno.", "Diferencias actualizan stock con auditoria."],
            ]
          ),
          heading("4. Turnos de inventario"),
          paragraph(
            "El turno guarda lo que se deja al abrir. Al cerrar se compara lo esperado contra lo contado. Solo al cierre se ajusta el stock real."
          ),
          paragraph("La persona que abre el turno debe ser responsable del cierre.", { bullet: true }),
          paragraph("Si se permiten turnos paralelos en la misma ubicacion, se debe evitar que dos personas cuenten y cierren los mismos items.", { bullet: true }),
          paragraph("Las diferencias no son errores a ocultar; son evidencia para corregir habitos, consumos no registrados o mermas.", { bullet: true }),
          heading("5. Pedidos y proveedores"),
          paragraph(
            "Los pedidos ayudan a pasar de stock bajo a compra, recepcion y pago conectado con caja. El pedido debe tener proveedor, lineas, cantidades, costo y estado claro."
          ),
          table(
            ["Control", "Recomendacion"],
            [
              ["Recepcion", "No permitir recibir dos veces el mismo pedido."],
              ["Sobrepago", "No permitir pagar mas del monto pendiente sin confirmacion administrativa."],
              ["Comprobante", "Exigir respaldo si el pago al proveedor no es efectivo."],
              ["Lote", "Crear lote cuando haya numero de lote, vencimiento o proveedor relevante."],
            ]
          ),
          heading("6. Alertas que se deben revisar"),
          paragraph("Stock bajo o sin stock.", { bullet: true }),
          paragraph("Lotes vencidos o proximos a vencer.", { bullet: true }),
          paragraph("Items sin costo de referencia.", { bullet: true }),
          paragraph("Pedidos recibidos sin pago o pagos sin comprobante.", { bullet: true }),
          paragraph("Diferencias frecuentes en cierres de turno.", { bullet: true }),
          heading("7. Prioridad de implementacion"),
          table(
            ["Prioridad", "Cambio", "Por que urge"],
            [
              ["Alta", "Hacer idempotente la recepcion de pedidos.", "Evita duplicar stock por reintento o llamada repetida."],
              ["Alta", "Convertir borrados de movimientos/conteos en anulaciones o reversas.", "Evita reportes falsos sin corregir stock."],
              ["Alta", "Alinear permisos SQL con la UI para inventario.", "Evita que roles no previstos operen por API."],
              ["Media", "Definir si se permiten turnos paralelos por ubicacion.", "Evita cierres que pisen el conteo de otra persona."],
            ]
          ),
        ],
      },
    ],
  });
}

async function writeDoc(name, doc) {
  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(outputDir, name);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

const cashPath = await writeDoc("Manual_Usuario_Caja_Actualizado.docx", buildCashManual());
const inventoryPath = await writeDoc("Manual_Usuario_Inventario_Actualizado.docx", buildInventoryManual());

console.log(cashPath);
console.log(inventoryPath);
