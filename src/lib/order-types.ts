export const IPI_RATE = 0.065;

export type Product = {
  codigo: string;
  cx: number;
  descricao: string;
  ml: number;
  quantUnitaria: number;
  tabelaIPI: number;
  precoVendaIPI: number;
};

export type Order = {
  id: string;
  pedidoNumero: string;
  vendedor: string;
  cliente: string;
  cnpj: string;
  cidade: string;
  uf: string;
  condPagto: string;
  data: string;
  transportadora: string;
  frete: string;
  obs: string;
  descontoGeral: number; // percentage e.g. 4
  produtos: Product[];
  createdAt: string;
};

export function quantCx(p: Product) {
  return p.cx > 0 ? p.quantUnitaria / p.cx : 0;
}
export function descontoPct(p: Product) {
  return p.tabelaIPI > 0 ? (p.tabelaIPI - p.precoVendaIPI) / p.tabelaIPI : 0;
}
export function precoTotalIPI(p: Product) {
  return p.quantUnitaria * p.precoVendaIPI;
}
export function precoUnSIPI(p: Product) {
  return p.precoVendaIPI / (1 + IPI_RATE);
}
export function orderTotals(produtos: Product[]) {
  const totalUnidades = produtos.reduce((s, p) => s + (p.quantUnitaria || 0), 0);
  const totalCaixas = produtos.reduce((s, p) => s + quantCx(p), 0);
  const totalValor = produtos.reduce((s, p) => s + precoTotalIPI(p), 0);
  return { totalUnidades, totalCaixas, totalValor };
}

export const BRL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const PCT = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
