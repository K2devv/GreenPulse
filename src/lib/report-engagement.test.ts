import { describe, expect, it } from 'vitest'
import { indexEngagement } from './report-engagement'

describe('indexEngagement', () => {
  it('indexes counts by report id', () => {
    const index = indexEngagement([
      { report_id: 'a', still_there: 7, comments: 4 },
      { report_id: 'b', still_there: '2', comments: 0 },
    ])
    expect(index.get('a')).toEqual({ stillThere: 7, comments: 4 })
    expect(index.get('b')).toEqual({ stillThere: 2, comments: 0 })
  })

  it('ignores malformed rows and bad counts', () => {
    const index = indexEngagement([null, 'x', { still_there: 3 }, { report_id: 'c', still_there: -1, comments: 'many' }])
    expect([...index.keys()]).toEqual(['c'])
    expect(index.get('c')).toEqual({ stillThere: 0, comments: 0 })
  })

  it('returns an empty index when the response is not a list', () => {
    expect(indexEngagement(null).size).toBe(0)
    expect(indexEngagement({ report_id: 'a' }).size).toBe(0)
  })
})
