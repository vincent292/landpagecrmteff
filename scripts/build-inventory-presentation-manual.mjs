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

const BRAND = {
  ink: "2B211B",
  copy: "6F5A4C",
  accent: "B88A5A",
  mocha: "6E4A2F",
  beige: "EFE5DA",
  soft: "FFF9F4",
  border: "D8C2AE",
  green: "6F7A60",
  red: "8A493E",
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

function title(text, level = HeadingLevel.HEADING_1, pageBreakBefore = false) {
  return new Paragraph({
    heading: level,
    pageBreakBefore,
    spacing: { before: 120, after: 140 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: BRAND.mocha,
        size: level === HeadingLevel.HEADING_1 ? 34 : 28,
      }),
    ],
  });
}

function baseText(text) {
  return new Paragraph({
    spacing: { after: 140, line: 320 },
    children: [new TextRun({ text, color: BRAND.ink, size: 22 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, color: BRAND.ink, size: 22 })],
  });
}

function spacer(lines = 1) {
  return new Paragraph({ spacing: { after: 80 * lines } });
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
                spacing: { after: 120 },
                children: [new TextRun({ text: titleText, bold: true, color: "FFFFFF", size: 40 })],
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
    columnWidths: [2500, 6500],
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

function noteBox(titleText, bodyText, tone = "green") {
  const color = tone === "red" ? BRAND.red : BRAND.green;
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
                children: [new TextRun({ text: titleText, bold: true, color, size: 22 })],
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
        children: headers.map((header) =>
          new TableCell({
            shading: { fill: BRAND.mocha, color: BRAND.mocha },
            margins: { top: 140, bottom: 140, left: 140, right: 140 },
            borders: noBorders(),
            children: [
              new Paragraph({
                children: [new TextRun({ text: header, bold: true, color: "FFFFFF", size: 20 })],
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

function buildDoc() {
  return new Document({
    creator: "Codex",
    title: "Manual de registro de inventario por presentacion",
    description: "Guia operativa para registrar insumos comprados por frasco o caja y consumidos por unidades internas.",
    sections: [
      {
        properties: {},
        footers: { default: pageFooter("Registro por presentacion") },
        children: [
          coverBlock(
            "Manual de Registro de Inventario por Presentacion",
            "Como cargar frascos, cajas y lotes para descontar consumo real en unidades internas desde historia clinica y movimientos."
          ),
          spacer(2),
          infoTable([
            ["Dirigido a", "Doctoras, asistentes y administracion"],
            ["Modulo", "Panel / Inventario y Expediente clinico"],
            ["Objetivo", "Comprar por presentacion y descontar por unidades internas sin perder trazabilidad"],
            ["Fecha", today],
          ]),
          spacer(2),
          noteBox(
            "Idea clave",
            "El sistema no debe esperar a que se consuman 100 registros para bajar una caja. Lo correcto es guardar el stock real en unidades internas y usar la presentacion solo como ayuda de carga y lectura."
          ),
          title("1. Antes de empezar", HeadingLevel.HEADING_1, true),
          baseText("Este flujo funciona cuando un insumo se compra en una presentacion grande, pero se usa por partes en consulta."),
          workflowTable(
            ["Caso", "Como se compra", "Como se consume", "Como lo guarda el sistema"],
            [
              ["Toxina botulinica", "1 ampolla o frasco", "30 u, 20 u, 50 u", "Stock interno en unidades"],
              ["Jeringas", "1 caja x 50", "1 pieza, 2 piezas, 5 piezas", "Stock interno en piezas"],
              ["Agujas", "1 caja x 100", "1 pieza por uso", "Stock interno en piezas"],
            ]
          ),
          noteBox(
            "Traduccion operativa",
            "Si compras 8 ampollas y cada una trae 100 unidades, no debes pensar en 8 como stock final. El sistema debe guardar 800 unidades internas y mostrar que eso equivale a 8 ampollas.",
          ),
          title("2. Paso obligatorio si aparece un error de Supabase", HeadingLevel.HEADING_1, true),
          baseText("Si al guardar un item sale el error PGRST204 o el mensaje sobre la columna presentation_unit_id, la base remota todavia no tiene aplicada la migracion nueva."),
          workflowTable(
            ["Senal de error", "Que significa", "Que hacer"],
            [
              ["PGRST204", "Supabase no reconoce las columnas nuevas", "Aplicar la migracion antes de volver a guardar"],
              ["presentation_unit_id", "Falta la estructura de presentacion", "Ejecutar 20260529113000_inventory_presentations.sql"],
              ["units_per_presentation", "Falta la estructura de conversion", "Actualizar esquema y recargar la pagina"],
            ]
          ),
          noteBox(
            "Accion exacta",
            "Aplica la migracion supabase/migrations/20260529113000_inventory_presentations.sql. Si trabajas con CLI puedes usar npm run supabase:push. Si trabajas en Supabase web, pega y ejecuta el SQL en el editor.",
            "red"
          ),
          title("3. Crear las unidades antes de registrar items", HeadingLevel.HEADING_1, true),
          baseText("Primero revisa la pestana de Unidades. Deben existir tanto la unidad de consumo como la presentacion de compra."),
          workflowTable(
            ["Tipo de dato", "Ejemplo", "Para que se usa"],
            [
              ["Unidad de consumo", "u, UI, pieza, ml", "Lo que realmente se descuenta en consulta o movimiento"],
              ["Presentacion", "amp, frasco, caja", "Como llega la compra al inventario"],
              ["Conversion", "1 amp = 100 u", "Cuantas unidades reales trae cada presentacion"],
            ]
          ),
          bullet("No hace falta crear muchas unidades. Usa abreviaturas cortas y consistentes."),
          bullet("Si el insumo se usa exactamente igual a como se compra, puedes dejarlo sin presentacion especial."),
          bullet("Si se compra en caja o frasco pero se usa por partes, debes llenar la conversion."),
          title("4. Como registrar un item nuevo", HeadingLevel.HEADING_1, true),
          baseText("En la pantalla de Item veras tres campos clave para esta logica: unidad que se usa en consulta, se compra en y cuantas unidades trae cada presentacion."),
          workflowTable(
            ["Campo del formulario", "Que debes escribir", "Como pensarlo"],
            [
              ["Unidad que se usa en consulta", "u, UI, pieza", "La unidad real que descuentan las doctoras"],
              ["Se compra en", "amp, frasco, caja", "La presentacion fisica que llega"],
              ["Cuantas unidades de uso trae cada presentacion", "100, 50, 10", "La conversion exacta"],
              ["Stock actual", "Cantidad en presentaciones si configuraste compra por caja o frasco", "Ejemplo 8 amp"],
              ["Stock minimo", "Minimo deseado en presentaciones", "Ejemplo 3 amp"],
            ]
          ),
          noteBox(
            "Ejemplo 1: toxina botulinica",
            "Unidad que se usa en consulta: u. Se compra en: amp. Cada amp trae 100 u. Si escribes stock actual 8 y stock minimo 3, el sistema guardara 800 u de stock actual y 300 u de stock minimo."
          ),
          noteBox(
            "Ejemplo 2: jeringas",
            "Unidad que se usa en consulta: pieza. Se compra en: caja. Cada caja trae 50 piezas. Si registras 2 cajas, el sistema guardara 100 piezas."
          ),
          title("5. Como registrar lotes", HeadingLevel.HEADING_1, true),
          baseText("El lote sirve para trazabilidad, vencimiento y control mas fino. Si el item ya tiene una presentacion definida, el lote puede heredar esa configuracion."),
          workflowTable(
            ["Campo del lote", "Ejemplo toxina", "Resultado interno"],
            [
              ["El lote entra en", "amp", "Se mantiene la misma presentacion del item"],
              ["Cuantas unidades trae cada presentacion", "100", "Define la conversion"],
              ["Cantidad inicial", "5 amp", "Se guardan 500 u"],
              ["Cantidad actual", "5 amp o 4.7 amp", "Se guarda el equivalente interno disponible"],
            ]
          ),
          bullet("Si hay fecha de vencimiento o numero de lote del fabricante, conviene registrarlo como lote."),
          bullet("Si un lote entra hoy y otro entra manana con distinta caja o distinto proveedor, registralos por separado."),
          bullet("El stock general del item y el stock por lote deben permanecer coherentes."),
          title("6. Como descontar desde historia clinica", HeadingLevel.HEADING_1, true),
          baseText("En la seccion de Insumos usados dentro de historia clinica, las doctoras no deben registrar cajas ni ampollas completas si solo usaron una parte. Deben registrar lo realmente aplicado."),
          workflowTable(
            ["Escenario", "Lo que registra la doctora", "Lo que pasa en el sistema"],
            [
              ["Paciente usa 30 u de toxina", "30", "Se descuenta 30 u del stock global"],
              ["Luego otra doctora usa 20 u", "20", "Se descuenta 20 u mas del mismo stock"],
              ["Una asistente usa 2 jeringas", "2", "Se descuentan 2 piezas del total"],
            ]
          ),
          noteBox(
            "Lo importante aqui",
            "El inventario es compartido. No importa quien registre el uso: todas descuentan del mismo stock central. Por eso el sistema debe trabajar en unidades internas reales."
          ),
          title("7. Como registrar entradas, movimientos y conteos", HeadingLevel.HEADING_1, true),
          baseText("El formulario de movimientos sigue guardando cantidades en unidades internas. Si vas a registrar una compra directa desde movimientos, convierte antes de guardar."),
          workflowTable(
            ["Operacion", "Que escribir", "Ejemplo"],
            [
              ["Entrada por compra", "Cantidad en unidades internas", "1 amp de 100 u se registra como 100"],
              ["Salida o merma", "Cantidad real usada o perdida", "2 jeringas se registran como 2 piezas"],
              ["Conteo fisico", "Stock contado en unidades internas", "8 amp x 100 = 800 u"],
            ]
          ),
          noteBox(
            "Criterio de trabajo",
            "Si quieres que la carga de compra sea mas natural, prioriza crear o actualizar el item y el lote con su presentacion correcta. Luego usa movimientos para los cambios puntuales del dia."
          ),
          title("8. Como corregir un item mal cargado", HeadingLevel.HEADING_1, true),
          baseText("Si ves algo como stock 8 u cuando en realidad deberian ser 8 amp de 100, significa que el dato se guardo como si 8 fueran unidades internas."),
          workflowTable(
            ["Dato correcto", "Que debe quedar", "Resultado esperado"],
            [
              ["Presentacion de compra", "amp", "El sistema sabe que llega en ampolla"],
              ["Unidades por presentacion", "100", "Cada amp equivale a 100 u"],
              ["Stock actual", "8 amp", "El sistema guarda 800 u"],
              ["Stock minimo", "3 amp", "El sistema guarda 300 u"],
            ]
          ),
          bullet("Edita el item y corrige el stock en presentaciones si el formulario ya muestra el campo de compra por amp o caja."),
          bullet("Si usas lotes, revisa tambien el lote para que no quede una diferencia entre el item y sus existencias reales."),
          bullet("Despues de corregir, vuelve a probar el descuento desde historia clinica."),
          title("9. Checklist rapido para el equipo", HeadingLevel.HEADING_1, true),
          bullet("Crear o revisar las unidades antes de registrar el item."),
          bullet("Definir claramente la unidad que se usa en consulta."),
          bullet("Definir la presentacion de compra solo si realmente existe caja, frasco o ampolla."),
          bullet("Cargar stock en presentaciones cuando el formulario ya lo indique."),
          bullet("Registrar consumo clinico en unidades reales, no en cajas."),
          bullet("Si aparece PGRST204, aplicar la migracion antes de seguir."),
          title("10. Errores comunes y solucion", HeadingLevel.HEADING_1, true),
          workflowTable(
            ["Problema", "Causa mas probable", "Solucion recomendada"],
            [
              ["No deja guardar el item", "Falta la migracion nueva", "Aplicar 20260529113000_inventory_presentations.sql y recargar"],
              ["Sale stock 8 u en vez de 800 u", "Se guardo la cantidad como unidad interna", "Editar item y volver a cargar 8 en amp con conversion 100"],
              ["No deja descontar 30 u", "El stock interno real es insuficiente o el lote quedo mal", "Corregir stock del item o lote y reintentar"],
              ["El conteo no coincide", "Se conto en cajas pero se guardo sin convertir", "Convertir a unidades internas antes de guardar"],
            ]
          ),
        ],
      },
    ],
  });
}

async function writeDoc(filename, doc) {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outputDir, filename), buffer);
}

await writeDoc("Manual_Registro_Inventario_Presentaciones.docx", buildDoc());

console.log("Manual generado en", outputDir);
