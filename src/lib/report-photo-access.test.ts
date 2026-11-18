import { describe, expect, it } from 'vitest'
import { canViewReportPhotos, knownPhotoPaths, photoPathList } from './report-photo-access'

describe('canViewReportPhotos', () => {
  const report = { reporterId: 'reporter-1' }

  it('never shows photos to a signed-out visitor', () => {
    expect(canViewReportPhotos({}, report)).toBe(false)
    expect(canViewReportPhotos({ role: 'admin' }, report)).toBe(false)
  })

  it('shows photos to staff', () => {
    expect(canViewReportPhotos({ userId: 'staff-1', role: 'admin' }, report)).toBe(true)
    expect(canViewReportPhotos({ userId: 'staff-2', role: 'responder' }, { reporterId: undefined })).toBe(true)
  })

  it('shows a resident only their own photos', () => {
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, report)).toBe(true)
    expect(canViewReportPhotos({ userId: 'someone-else', role: 'resident' }, report)).toBe(false)
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, { reporterId: undefined })).toBe(false)
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, { reporterId: null })).toBe(false)
  })
})

describe('photoPathList', () => {
  it('merges the list and the older single path, each once', () => {
    expect(photoPathList(['u/a.jpg', 'u/b.jpg'], 'u/a.jpg')).toEqual(['u/a.jpg', 'u/b.jpg'])
    expect(photoPathList(null, 'u/old.jpg')).toEqual(['u/old.jpg'])
    expect(photoPathList(['', null, 'u/a.jpg'])).toEqual(['u/a.jpg'])
  })

  it('keeps at most five', () => {
    expect(photoPathList(['1', '2', '3', '4', '5', '6'])).toHaveLength(5)
  })
})

describe('knownPhotoPaths', () => {
  it('is unknown for the public copy, which never carries photos', () => {
    expect(knownPhotoPaths({ photoPaths: [] })).toBeUndefined()
  })

  it('trusts a full row, including one with no photos', () => {
    expect(knownPhotoPaths({ reporterId: 'r', photoPaths: ['r/a.jpg'] })).toEqual(['r/a.jpg'])
    expect(knownPhotoPaths({ reporterId: null, photoPaths: [] })).toEqual([])
  })
})
