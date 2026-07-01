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

const C = {
  ink: "2B211B",
  copy: "66564B",
  mocha: "6E4A2F",
  accent: "B88A5A",
  beige: "EFE5DA",
  soft: "FFF9F4",
  border: "D8C2AE",
  green: "6F7A60",
  red: "9B3B35",
  blue: "425466",
};

const today = new Date().toLocaleDateString("es-BO", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function r(text, opts = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italics ?? false,
    color: opts.color ?? C.ink,
    size: opts.size ?? 21,
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    bullet: opts.bullet ? { level: 0 } : undefined,
    alignment: opts.alignment,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 105, line: 292 },
    children: [r(text, opts)],
  });
}

function h(text, level = HeadingLevel.HEADING_1, pageBreakBefore = false) {
  return new Paragraph({
    heading: level,
    pageBreakBefore,
    spacing: { before: 160, after: 110 },
    children: [
      r(text, {
        bold: true,
        color: level === HeadingLevel.HEADING_1 ? C.mocha : C.green,
        size: level === HeadingLevel.HEADING_1 ? 31 : 25,
      }),
    ],
  });
}

function cover() {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: C.mocha, color: C.mocha },
              borders: noBorders(),
              margins: { top: 400, bottom: 400, left: 390, right: 390 },
              children: [
                new Paragraph({
                  spacing: { after: 90 },
                  children: [r("MANUAL OPERATIVO INTERNO", { color: C.beige, bold: true, size: 18 })],
                }),
                new Paragraph({
                  spacing: { after: 120 },
                  children: [r("Caja e Inventario", { color: "FFFFFF", bold: true, size: 46 })],
                }),
                new Paragraph({
                  spacing: { after: 0, line: 320 },
                  children: [
                    r("Que puede hacer cada modulo, que no debe hacerse, como usarlo en el dia a dia y como evitar errores que afecten dinero, stock o auditoria.", {
                      color: "F7F2EC",
                      size: 24,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    p(`Actualizado al ${today}. Uso interno para administracion, caja, inventario y responsables operativas.`, {
      before: 220,
      color: C.copy,
    }),
  ];
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          r("Manual Caja e Inventario | pagina ", { color: C.copy, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: C.copy, size: 18 }),
        ],
      }),
    ],
  });
}

function box(title, body, tone = "green") {
  const toneColor = tone === "red" ? C.red : tone === "blue" ? C.blue : C.green;
  const fill = tone === "red" ? "FFF0EE" : tone === "blue" ? "F2F6FA" : C.soft;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill, color: fill },
            borders: borders(toneColor),
            margins: { top: 160, bottom: 160, left: 180, right: 180 },
            children: [
              new Paragraph({
                spacing: { after: 70 },
                children: [r(title, { bold: true, color: toneColor, size: 22 })],
              }),
              new Paragraph({
                spacing: { after: 0, line: 290 },
                children: [r(body, { size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function t(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header) =>
          new TableCell({
            shading: { fill: C.mocha, color: C.mocha },
            borders: noBorders(),
            margins: { top: 125, bottom: 125, left: 125, right: 125 },
            children: [new Paragraph({ children: [r(header, { bold: true, color: "FFFFFF", size: 19 })] })],
          })
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell, index) =>
              new TableCell({
                shading: index === 0 ? { fill: C.beige, color: C.beige } : undefined,
                borders: borders(),
                margins: { top: 105, bottom: 105, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    spacing: { after: 0, line: 270 },
                    children: [r(cell, { bold: index === 0, size: 19 })],
                  }),
                ],
              })
            ),
          })
      ),
    ],
  });
}

function borders(color = C.border) {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color },
    bottom: { style: BorderStyle.SINGLE, size: 1, color },
    left: { style: BorderStyle.SINGLE, size: 1, color },
    right: { style: BorderStyle.SINGLE, size: 1, color },
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

function doc() {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 21, color: C.ink },
          paragraph: { spacing: { after: 105, line: 292 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 850, right: 760, bottom: 760, left: 760 } },
        },
        footers: { default: footer() },
        children: [
          ...cover(),
          box(
            "Regla principal",
            "Caja controla dinero. Inventario controla stock. Ninguno de los dos debe corregirse borrando datos sin dejar trazabilidad. Si algo salio mal, se anula, se revierte o se registra una correccion con motivo."
          ),
          h("1. Quienes usan estos modulos"),
          t(
            ["Rol", "Puede hacer", "No debe hacer"],
            [
              ["Superadmin", "Ver todo, restaurar, eliminar definitivamente cuando corresponda y revisar auditoria.", "Borrar movimientos operativos sin entender el impacto contable o de stock."],
              ["Admin", "Operar caja, aprobar pagos, registrar movimientos, manejar inventario y revisar reportes.", "Cerrar caja sin conteo fisico o aprobar pagos sin comprobante."],
              ["Asistente", "Apoyar inventario, pacientes, reservas y flujos operativos permitidos.", "Tocar caja si no tiene permiso operativo claro."],
              ["Doctora + inventario", "Registrar consumos, revisar stock y operar inventario segun permiso.", "Modificar caja o pagos administrativos."],
              ["Doctora", "Registrar atencion y consumos si el flujo lo permite.", "Administrar stock general si no tiene rol de inventario."],
            ]
          ),
          h("2. Manual de Caja", HeadingLevel.HEADING_1, true),
          p("Caja sirve para controlar ingresos, egresos, pagos aprobados, comprobantes, arqueos y cierres. Su objetivo no es solo guardar montos, sino dejar evidencia de que el dinero real coincide con lo registrado."),
          h("2.1 Que puede hacer Caja", HeadingLevel.HEADING_2),
          p("Abrir una sesion diaria de caja con fecha, punto de caja, ciudad y monto inicial.", { bullet: true }),
          p("Registrar ingresos manuales, por ejemplo cobros directos no originados en otro modulo.", { bullet: true }),
          p("Registrar egresos, como gastos, retiros o pagos a proveedores.", { bullet: true }),
          p("Recibir movimientos automaticos desde reservas, libros, promociones, planes de pago y tarjetas de ahorro.", { bullet: true }),
          p("Subir comprobantes de pagos no efectivos.", { bullet: true }),
          p("Hacer arqueos parciales durante el dia.", { bullet: true }),
          p("Cerrar caja con conteo fisico por denominaciones.", { bullet: true }),
          p("Exportar movimientos, sesiones y arqueos para respaldo administrativo.", { bullet: true }),
          h("2.2 Que no se debe hacer en Caja", HeadingLevel.HEADING_2),
          box(
            "Prohibido operativamente",
            "No registrar dos veces el mismo pago, no aprobar sin comprobante cuando corresponde, no cerrar sin contar fisicamente, no borrar movimientos para cuadrar caja y no usar un metodo de pago incorrecto solo para que el numero cuadre.",
            "red"
          ),
          p("No aprobar pagos si no hay caja abierta.", { bullet: true }),
          p("No registrar QR o transferencia como efectivo.", { bullet: true }),
          p("No usar 'cierre sin arqueo' como cierre normal.", { bullet: true }),
          p("No ocultar faltantes o sobrantes: se documentan con nota.", { bullet: true }),
          p("No borrar un movimiento automatico sin revisar su modulo origen.", { bullet: true }),
          h("2.3 Como abrir caja", HeadingLevel.HEADING_2),
          t(
            ["Paso", "Accion", "Resultado"],
            [
              ["1", "Entrar a Panel / Caja.", "Se abre el modulo de caja."],
              ["2", "Ir a sesiones o aperturas.", "Se revisa si ya existe caja abierta."],
              ["3", "Crear nueva apertura.", "Se registra fecha, ciudad, punto de caja y monto inicial."],
              ["4", "Guardar.", "La caja queda lista para recibir movimientos."],
            ]
          ),
          h("2.4 Como registrar ingreso manual", HeadingLevel.HEADING_2),
          p("Usar ingreso manual solo cuando el cobro no venga de otro modulo. Si el pago ya fue aprobado desde reservas, libros, promociones, planes o tarjetas, no repetirlo."),
          t(
            ["Campo", "Como llenarlo"],
            [
              ["Sesion", "Elegir la caja abierta correspondiente."],
              ["Tipo", "Ingreso."],
              ["Monto", "Monto real recibido."],
              ["Metodo", "Efectivo, QR, transferencia, tarjeta u otro metodo real."],
              ["Concepto", "Explicar que se cobro."],
              ["Referencia", "Paciente, factura, comprobante o detalle útil."],
              ["Comprobante", "Obligatorio si no es efectivo."],
            ]
          ),
          h("2.5 Como registrar egreso", HeadingLevel.HEADING_2),
          p("Un egreso baja caja. Debe registrarse cuando sale dinero: compras menores, retiros, pagos a proveedor o ajustes documentados."),
          p("Si el egreso es por proveedor desde inventario, lo ideal es registrarlo desde el pedido de proveedor para que quede conectado con caja.", { bullet: true }),
          p("Si es QR o transferencia, adjuntar comprobante.", { bullet: true }),
          p("Si es efectivo, afecta el efectivo esperado del cierre.", { bullet: true }),
          h("2.6 Arqueo parcial", HeadingLevel.HEADING_2),
          p("El arqueo parcial sirve para verificar caja antes del cierre. Se recomienda hacerlo si hubo muchos cobros, si cambia la responsable o si se sospecha diferencia."),
          p("Contar billetes y monedas, no escribir un monto inventado.", { bullet: true }),
          p("Guardar la diferencia aunque no sea cero.", { bullet: true }),
          p("Si hay diferencia, revisar movimientos recientes y dejar nota.", { bullet: true }),
          h("2.7 Cierre de caja", HeadingLevel.HEADING_2),
          t(
            ["Paso", "Accion"],
            [
              ["1", "Contar fisicamente el efectivo."],
              ["2", "Registrar cantidades por denominacion."],
              ["3", "Comparar esperado vs contado."],
              ["4", "Si hay diferencia, revisar y escribir nota."],
              ["5", "Cerrar caja con arqueo."],
            ]
          ),
          box(
            "Importante",
            "El efectivo esperado solo debe sumar movimientos en efectivo. QR, transferencia o tarjeta quedan como movimientos registrados, pero no son billetes en caja.",
            "blue"
          ),
          h("2.8 Problemas comunes en Caja", HeadingLevel.HEADING_2),
          t(
            ["Problema", "Causa probable", "Que hacer"],
            [
              ["Falta dinero", "Egreso no registrado, ingreso duplicado como no efectivo o conteo incorrecto.", "Revisar movimientos, corregir con nota y cerrar con diferencia si persiste."],
              ["Sobra dinero", "Ingreso no registrado o monto mal ingresado.", "Registrar ingreso faltante o dejar nota de sobrante."],
              ["Pago no aparece en caja", "Se aprobo sin caja abierta o fallo enlace automatico.", "Revisar modulo origen y movimiento asociado."],
              ["QR suma al efectivo", "Metodo configurado o elegido incorrectamente.", "Corregir metodo y revisar cierre."],
              ["Movimiento duplicado", "Se registro manualmente algo que ya entro automatico.", "Anular/revertir el movimiento incorrecto."],
            ]
          ),
          h("3. Manual de Inventario", HeadingLevel.HEADING_1, true),
          p("Inventario controla existencias, lotes, vencimientos, compras, proveedores, movimientos, turnos, conteos y consumos clinicos. Su objetivo es saber que hay, donde esta, cuanto se uso y por que cambio el stock."),
          h("3.1 Que puede hacer Inventario", HeadingLevel.HEADING_2),
          p("Crear items e insumos con unidad, minimo, costo, proveedor y ubicacion.", { bullet: true }),
          p("Manejar categorias, unidades, proveedores y ubicaciones.", { bullet: true }),
          p("Registrar entradas, salidas, mermas, transferencias y ajustes.", { bullet: true }),
          p("Crear lotes con vencimiento y proveedor.", { bullet: true }),
          p("Abrir turnos de inventario y cerrarlos con conteo fisico.", { bullet: true }),
          p("Crear pedidos a proveedores, recibir mercaderia y registrar pagos conectados a caja.", { bullet: true }),
          p("Descontar insumos usados desde historia clinica.", { bullet: true }),
          p("Exportar reportes de items, lotes, movimientos, conteos y proveedores.", { bullet: true }),
          h("3.2 Que no se debe hacer en Inventario", HeadingLevel.HEADING_2),
          box(
            "Prohibido operativamente",
            "No editar stock para corregir sin dejar movimiento, no recibir dos veces el mismo pedido, no borrar movimientos para arreglar numeros, no mezclar unidades sin convertir y no ignorar lotes vencidos.",
            "red"
          ),
          p("No crear items duplicados por diferencia de escritura.", { bullet: true }),
          p("No registrar consumo clinico como merma si corresponde a paciente.", { bullet: true }),
          p("No pagar a proveedor desde caja manual si ya existe pedido pendiente; mejor pagar desde el pedido.", { bullet: true }),
          p("No cerrar turno sin contar fisicamente.", { bullet: true }),
          p("No cambiar unidades sin revisar conversion de presentaciones.", { bullet: true }),
          h("3.3 Como crear un item", HeadingLevel.HEADING_2),
          t(
            ["Campo", "Uso correcto"],
            [
              ["Nombre", "Nombre claro del insumo o producto."],
              ["Categoria", "Familia: inyectables, descartables, cosmeticos, etc."],
              ["Unidad interna", "Unidad que se consume: unidad, ml, gr, ampolla, etc."],
              ["Presentacion", "Caja, paquete o frasco si se compra agrupado."],
              ["Stock actual", "Cantidad real disponible en unidad interna o convertida."],
              ["Stock minimo", "Nivel desde el cual se alerta compra."],
              ["Proveedor", "Proveedor principal para sugerir pedidos."],
              ["Vencimiento", "Usarlo si el item vence o requiere control sanitario."],
            ]
          ),
          h("3.4 Entradas, salidas, mermas y transferencias", HeadingLevel.HEADING_2),
          t(
            ["Movimiento", "Cuando usarlo", "Efecto"],
            [
              ["Entrada", "Compra o ingreso de stock.", "Sube stock."],
              ["Salida", "Uso no clinico o salida documentada.", "Baja stock."],
              ["Merma", "Perdida, daño, vencido o descarte.", "Baja stock con motivo."],
              ["Transferencia", "Cambio de ubicacion.", "No deberia cambiar cantidad total."],
              ["Ajuste", "Correccion administrativa justificada.", "Actualiza stock con trazabilidad."],
            ]
          ),
          h("3.5 Turnos de inventario", HeadingLevel.HEADING_2),
          p("Un turno es una foto de lo que se deja al abrir. Al cerrar, se cuenta lo que hay fisicamente. El sistema calcula diferencia y ajusta stock."),
          t(
            ["Paso", "Accion", "Cuidado"],
            [
              ["1", "Abrir turno por ubicacion.", "Confirmar que no haya otro conteo del mismo stock."],
              ["2", "Trabajar normalmente.", "Registrar consumos y movimientos durante el turno."],
              ["3", "Contar fisicamente al cierre.", "No copiar el esperado sin contar."],
              ["4", "Guardar conteo por item.", "Usar unidad correcta."],
              ["5", "Cerrar turno.", "El cierre actualiza stock y deja auditoria."],
            ]
          ),
          h("3.6 Pedidos a proveedores", HeadingLevel.HEADING_2),
          p("Este flujo conecta inventario con caja. Sirve para comprar, recibir y pagar de forma ordenada."),
          t(
            ["Etapa", "Accion"],
            [
              ["Pedido", "Seleccionar proveedor, items, cantidades, costo y fecha."],
              ["Envio", "Usar mensaje de WhatsApp si corresponde."],
              ["Recepcion", "Registrar cantidad recibida, lote y vencimiento."],
              ["Pago", "Registrar pago desde el pedido para que genere egreso en caja."],
              ["Archivo", "Adjuntar comprobante o documento del pedido si existe."],
            ]
          ),
          box(
            "Control critico",
            "Si un pedido ya fue recibido, no debe volver a sumar stock. Esta proteccion debe existir en base de datos, no solo en la pantalla.",
            "red"
          ),
          h("3.7 Consumo desde historia clinica", HeadingLevel.HEADING_2),
          p("Cuando se usa un insumo en una paciente, debe descontarse desde la historia clinica o el flujo clinico correspondiente. Asi queda relacionado con paciente, atencion y responsable."),
          p("Elegir item correcto y lote si aplica.", { bullet: true }),
          p("Registrar cantidad real usada en unidad interna.", { bullet: true }),
          p("Si no alcanza stock, no forzar el registro: primero corregir entrada, lote o inventario.", { bullet: true }),
          h("3.8 Problemas comunes en Inventario", HeadingLevel.HEADING_2),
          t(
            ["Problema", "Causa probable", "Que hacer"],
            [
              ["Stock negativo", "Salida mayor al stock o lote incorrecto.", "Revisar unidad, lote y movimientos previos."],
              ["Stock bajo frecuente", "Minimo mal definido o consumo no planificado.", "Ajustar minimo y proveedor."],
              ["Diferencia en turno", "Consumo no registrado, merma o conteo incorrecto.", "Revisar movimientos y dejar nota."],
              ["Pedido duplico stock", "Recepcion ejecutada mas de una vez.", "Anular/revertir entrada duplicada y bloquear el caso."],
              ["Lote vencido", "No se revisaron alertas.", "Separar, marcar merma si corresponde y registrar motivo."],
            ]
          ),
          h("4. Relacion entre Caja e Inventario", HeadingLevel.HEADING_1, true),
          p("Caja e Inventario se conectan principalmente por pagos a proveedores. Inventario define que se compro y recibio; Caja registra como salio el dinero."),
          t(
            ["Caso", "Modulo principal", "Modulo conectado"],
            [
              ["Compra a proveedor", "Inventario", "Caja registra egreso al pagar."],
              ["Pago no efectivo a proveedor", "Inventario", "Caja debe guardar comprobante."],
              ["Merma/vencido", "Inventario", "No afecta caja salvo reposicion pagada."],
              ["Pago de paciente", "Caja", "No afecta inventario salvo consumo clinico registrado aparte."],
            ]
          ),
          h("5. Checklist diario", HeadingLevel.HEADING_1, true),
          t(
            ["Momento", "Caja", "Inventario"],
            [
              ["Inicio", "Abrir caja y revisar si no quedo una sesion abierta anterior.", "Revisar alertas de stock bajo y vencimientos."],
              ["Durante el dia", "Aprobar pagos con comprobante y caja abierta.", "Registrar consumos, entradas, salidas o mermas en el momento."],
              ["Cambio de responsable", "Hacer arqueo parcial.", "Si corresponde, cerrar turno o dejar conteo claro."],
              ["Cierre", "Contar efectivo y cerrar con arqueo.", "Cerrar turno si se trabajo con conteo por responsable."],
              ["Fin de semana/mes", "Exportar reportes de caja.", "Exportar reportes de stock, movimientos y proveedores."],
            ]
          ),
          h("6. Cambios urgentes recomendados", HeadingLevel.HEADING_1, true),
          t(
            ["Prioridad", "Implementacion", "Motivo"],
            [
              ["Alta", "Quitar cierre normal sin arqueo o restringirlo con motivo obligatorio.", "Protege dinero real."],
              ["Alta", "Exigir caja abierta en planes de pago y tarjetas de ahorro.", "Evita pagos aprobados fuera de sesion."],
              ["Alta", "Bloquear doble recepcion de pedido recibido.", "Protege stock real."],
              ["Alta", "Cambiar borrado operativo por anulacion/reversa.", "Mantiene auditoria."],
              ["Media", "Exigir comprobante en pagos no efectivos a proveedores.", "Mejora respaldo administrativo."],
              ["Media", "Alinear permisos SQL con permisos visuales de inventario.", "Evita operaciones por API fuera del flujo."],
            ]
          ),
        ],
      },
    ],
  });
}

const out = path.join(outputDir, "Manual_Detallado_Caja_Inventario.docx");
fs.writeFileSync(out, await Packer.toBuffer(doc()));
console.log(out);
