import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/card'
import type { CurvaPredicha } from '@/lib/api'

export function TablaCurva({ curva }: { curva: CurvaPredicha[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Curva de absorción acumulada predicha (%)
      </h3>
      <Table>
        <THead>
          <tr>
            <TH>Fase (BBCH)</TH>
            <TH className="text-right">N %</TH>
            <TH className="text-right">P₂O₅ %</TH>
            <TH className="text-right">K₂O %</TH>
          </tr>
        </THead>
        <TBody>
          {curva.map(f => (
            <TR key={f.orden}>
              <TD>{f.nombre} <span className="text-[11px] text-muted-foreground">({f.bbch})</span></TD>
              <TD className="text-right font-medium">{f.pct_acumulado.N}</TD>
              <TD className="text-right font-medium">{f.pct_acumulado.P}</TD>
              <TD className="text-right font-medium">{f.pct_acumulado.K}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
