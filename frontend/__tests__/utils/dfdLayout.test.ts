/**
 * @jest-environment node
 */
import type { DataFlowDiagram, ThreatModel } from '@/types/threatModel'
import { dfdToReactFlow } from '@/utils/dfdToReactFlow'
import { layoutDfd } from '@/utils/dfdLayout'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../e2e/fixtures/dfd-report.json') as {
  job: { dataFlowDiagram: DataFlowDiagram; threatModel: ThreatModel }
}

describe('layoutDfd (ELK)', () => {
  const dfd = fixture.job.dataFlowDiagram
  const tm = fixture.job.threatModel

  it('produces finite positions for LR and TB', async () => {
    const base = dfdToReactFlow(dfd, tm)
    const lr = await layoutDfd(base.nodes, base.edges, 'LR')
    const tb = await layoutDfd(base.nodes, base.edges, 'TB')

    for (const n of lr.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
    for (const n of tb.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
  })

  it('LR and TB differ for at least one node', async () => {
    const base = dfdToReactFlow(dfd, tm)
    const lr = await layoutDfd(base.nodes, base.edges, 'LR')
    const tb = await layoutDfd(base.nodes, base.edges, 'TB')
    const id = 'proc-1'
    const pl = lr.nodes.find((n) => n.id === id)!
    const pt = tb.nodes.find((n) => n.id === id)!
    const same = pl.position.x === pt.position.x && pl.position.y === pt.position.y
    expect(same).toBe(false)
  })
})
