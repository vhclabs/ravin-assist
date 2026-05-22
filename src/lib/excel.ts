import ExcelJS from "exceljs";
import {
  type Order,
  quantCx,
  descontoPct,
  precoTotalIPI,
  precoUnSIPI,
  orderTotals,
} from "./order-types";

const WINE = "FF7C1D2E";
const GOLD = "FFE9D9A6";
const GOLD_DEEP = "FFD4A574";
const RED = "FFB91C1C";

export async function buildOrderWorkbook(order: Order): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ravin — Vinho do seu jeito";
  wb.created = new Date();
  const ws = wb.addWorksheet("Pedido", {
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { width: 12 }, // A Código
    { width: 5 },  // B Cx
    { width: 42 }, // C Descrição
    { width: 8 },  // D Ml
    { width: 11 }, // E Quant. Unitária
    { width: 11 }, // F Quant. CX
    { width: 13 }, // G Tabela C/IPI
    { width: 12 }, // H Desconto %
    { width: 14 }, // I Preço venda C/IPI
    { width: 14 }, // J Preço Total C/IPI
    { width: 13 }, // K Preço UN S/IPI
  ];

  // ---------- HEADER ----------
  ws.mergeCells("A2:B3");
  const brand = ws.getCell("A2");
  brand.value = "Ravin";
  brand.font = { name: "Cormorant Garamond", size: 28, italic: true, color: { argb: "FF1A0A0E" } };
  brand.alignment = { vertical: "middle", horizontal: "center" };

  ws.mergeCells("C2:D2");
  ws.getCell("C2").value = "Pedido Nº";
  ws.getCell("C2").alignment = { horizontal: "center" };
  ws.mergeCells("E2:G2");
  ws.getCell("E2").value = order.pedidoNumero;
  ws.getCell("E2").alignment = { horizontal: "center" };

  ws.mergeCells("H2:H3");
  ws.getCell("H2").value = order.descontoGeral / 100;
  ws.getCell("H2").numFmt = "0%";
  ws.getCell("H2").font = { bold: true, size: 22, color: { argb: "FF1A0A0E" } };
  ws.getCell("H2").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };

  ws.mergeCells("I2:K3");
  ws.getCell("I2").value = "PEDIDO DE VENDA";
  ws.getCell("I2").font = { bold: true, size: 14, color: { argb: RED } };
  ws.getCell("I2").alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("C3:D3");
  ws.getCell("C3").value = "Vendedor/ Representante:";
  ws.mergeCells("E3:G3");
  ws.getCell("E3").value = order.vendedor.toUpperCase();
  ws.getCell("E3").alignment = { horizontal: "center" };
  ws.getCell("E3").font = { bold: true };

  // Client info rows
  const infoRows: Array<[string, string, string, string]> = [
    ["Nome Cliente:", order.cliente.toUpperCase(), "CNPJ:", order.cnpj],
    ["Cidade:", order.cidade.toUpperCase(), "UF:", order.uf.toUpperCase()],
    ["Cond. de Pagto.:", order.condPagto, "Data:", order.data],
    ["Transportadora:", order.transportadora.toUpperCase(), "Frete:", order.frete],
    ["Obs:", order.obs, "", ""],
  ];
  infoRows.forEach(([l, v, l2, v2], idx) => {
    const r = 5 + idx;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = l;
    ws.mergeCells(`C${r}:G${r}`);
    const cv = ws.getCell(`C${r}`);
    cv.value = v;
    cv.alignment = { horizontal: "center" };
    if (l === "Obs:") {
      cv.font = { bold: true, color: { argb: RED } };
    }
    ws.getCell(`H${r}`).value = l2;
    ws.mergeCells(`I${r}:K${r}`);
    ws.getCell(`I${r}`).value = v2;
    ws.getCell(`I${r}`).alignment = { horizontal: "center" };
  });

  // Header box border for rows 2..9
  for (let r = 2; r <= 9; r++) {
    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
      };
    }
  }

  // PRODUTOS title
  ws.mergeCells("A11:K11");
  const ptitle = ws.getCell("A11");
  ptitle.value = "PRODUTOS";
  ptitle.alignment = { horizontal: "center" };
  ptitle.font = { bold: true };

  // Table header
  const headers = [
    "Código", "Cx", "Descrição", "Ml", "Quant. Unitária", "Quant. CX",
    "Tabela C/ IPI", "Desconto %", "Preço de venda C/ IPI", "Preço Total C/ IPI", "Preço UN S/ IPI",
  ];
  const headerRow = ws.getRow(12);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF1A0A0E" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });
  headerRow.height = 30;

  // Body rows — fixed 37 rows like template (12 + 1 .. 48)
  const TOTAL_ROWS = 37;
  for (let i = 0; i < TOTAL_ROWS; i++) {
    const r = 13 + i;
    const p = order.produtos[i];
    const row = ws.getRow(r);
    if (p) {
      row.getCell(1).value = p.codigo;
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = p.cx;
      row.getCell(3).value = p.descricao;
      row.getCell(4).value = p.ml;
      row.getCell(5).value = p.quantUnitaria;
      row.getCell(5).font = { bold: true };
      row.getCell(6).value = quantCx(p);
      row.getCell(7).value = p.tabelaIPI;
      row.getCell(8).value = descontoPct(p);
      row.getCell(9).value = p.precoVendaIPI;
      row.getCell(10).value = precoTotalIPI(p);
      row.getCell(11).value = precoUnSIPI(p);
    } else {
      row.getCell(10).value = "-";
      row.getCell(11).value = "-";
      row.getCell(10).alignment = { horizontal: "center" };
      row.getCell(11).alignment = { horizontal: "center" };
    }
    // formatting
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(6).numFmt = "0.0";
    row.getCell(6).alignment = { horizontal: "center" };
    row.getCell(7).numFmt = "#,##0.00";
    row.getCell(8).numFmt = "0.00%";
    row.getCell(9).numFmt = "#,##0.00";
    row.getCell(10).numFmt = "#,##0.00";
    row.getCell(11).numFmt = "#,##0.00";

    // alternating light bg on cols A, E, F, H, I (the template highlights these)
    [1, 5, 6, 8, 9].forEach((c) => {
      row.getCell(c).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF1D5" },
      };
    });

    for (let c = 1; c <= 11; c++) {
      row.getCell(c).border = {
        top: { style: "hair", color: { argb: "FFCCCCCC" } },
        bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FF999999" } },
        right: { style: "thin", color: { argb: "FF999999" } },
      };
    }
  }

  // Totals row
  const totals = orderTotals(order.produtos);
  const tr = ws.getRow(13 + TOTAL_ROWS);
  tr.getCell(1).value = order.data;
  tr.getCell(5).value = totals.totalUnidades;
  tr.getCell(6).value = totals.totalCaixas;
  tr.getCell(6).numFmt = "0.0";
  tr.getCell(9).value = "Total";
  tr.getCell(9).alignment = { horizontal: "right" };
  tr.getCell(10).value = totals.totalValor;
  tr.getCell(10).numFmt = "#,##0.00";
  for (let c = 1; c <= 11; c++) {
    tr.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_DEEP } };
    tr.getCell(c).font = { bold: true, color: { argb: "FF1A0A0E" } };
    tr.getCell(c).border = { top: { style: "medium" }, bottom: { style: "medium" } };
  }
  tr.getCell(5).alignment = { horizontal: "center" };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
