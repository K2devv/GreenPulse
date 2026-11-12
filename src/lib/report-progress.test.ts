import { describe, expect, it } from 'vitest'
import { PROGRESS_STEPS, publicProgressEvents, reportProgressStep } from './report-progress'

describe('reportProgressStep', () => {
  it('places every public status on the five-step track', () => {
    expect(PROGRESS_STEPS).toHaveLength(5)
    expect(reportProgressStep('Submitted')).toBe(0)
    expect(reportProgressStep('Under review')).toBe(0)
    expect(reportProgressStep('Additional information requested')).toBe(0)
    expect(reportProgressStep('Verified')).toBe(1)
    expect(reportProgressStep('In progress')).toBe(2)
    expect(reportProgressStep('Awaiting verification')).toBe(3)
    expect(reportProgressStep('Resolved')).toBe(4)
    expect(reportProgressStep('Closed')).toBe(4)
  })

  it('keeps rejected, duplicate, and unknown statuses off the track', () => {
    expect(reportProgressStep('Rejected')).toBeNull()
    expect(reportProgressStep('Duplicate')).toBeNull()
    expect(reportProgressStep('toString')).toBeNull()
  })
})

describe('publicProgressEvents', () => {
  it('lists the milestones reached so far', () => {
    expect(publicProgressEvents('Submitted')).toEqual([])
    expect(publicProgressEvents('Verified').map((event) => event.title)).toEqual(['Verified'])
    expect(publicProgressEvents('In progress').map((event) => event.title)).toEqual(['Verified', 'Response started'])
    expect(publicProgressEvents('Resolved').map((event) => event.title)).toEqual(['Verified', 'Response started', 'Work done', 'Resolved'])
    const closed = publicProgressEvents('Closed')
    expect(closed[closed.length - 1].title).toBe('Closed')
  })

  it('describes review states before verification', () => {
    expect(publicProgressEvents('Under review')).toEqual([{ title: 'Under review', detail: 'by the District 5 desk' }])
    expect(publicProgressEvents('Additional information requested')[0].title).toBe('More information requested')
  })

  it('describes statuses that sit off the track', () => {
    expect(publicProgressEvents('Rejected')).toEqual([{ title: 'Rejected', detail: 'by the District 5 desk' }])
    expect(publicProgressEvents('Duplicate')[0].title).toBe('Marked as a duplicate')
  })
})
