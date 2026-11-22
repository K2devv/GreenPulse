import { describe, expect, it } from 'vitest'
import { canViewReportPhotos, knownPhotoPaths, photoPathList, photoSharing, toPhotoVisibility } from './report-photo-access'

describe('canViewReportPhotos', () => {
  const report = { reporterId: 'reporter-1' }

  it('never shows private photos to a signed-out visitor', () => {
    expect(canViewReportPhotos({}, report)).toBe(false)
    expect(canViewReportPhotos({ role: 'admin' }, report)).toBe(false)
    expect(canViewReportPhotos({}, { ...report, photoVisibility: 'private', status: 'Verified' })).toBe(false)
  })

  it('shows photos to staff', () => {
    expect(canViewReportPhotos({ userId: 'staff-1', role: 'admin' }, report)).toBe(true)
    expect(canViewReportPhotos({ userId: 'staff-2', role: 'responder' }, { reporterId: undefined })).toBe(true)
  })

  it('shows a resident only their own private photos', () => {
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, report)).toBe(true)
    expect(canViewReportPhotos({ userId: 'someone-else', role: 'resident' }, report)).toBe(false)
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, { reporterId: undefined })).toBe(false)
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, { reporterId: null })).toBe(false)
  })

  it('shows public photos to everyone once the report is verified', () => {
    const verified = { reporterId: undefined, photoVisibility: 'public' as const, status: 'Verified' }
    expect(canViewReportPhotos({}, verified)).toBe(true)
    expect(canViewReportPhotos({ userId: 'someone-else', role: 'resident' }, { ...verified, status: 'Resolved' })).toBe(true)
  })

  it('keeps public photos to the reporter and staff until the report is verified', () => {
    const pending = { reporterId: 'reporter-1', photoVisibility: 'public' as const, status: 'Submitted' }
    expect(canViewReportPhotos({}, pending)).toBe(false)
    expect(canViewReportPhotos({ userId: 'someone-else', role: 'resident' }, pending)).toBe(false)
    expect(canViewReportPhotos({ userId: 'reporter-1', role: 'resident' }, pending)).toBe(true)
    expect(canViewReportPhotos({}, { ...pending, status: 'Rejected' })).toBe(false)
    expect(canViewReportPhotos({}, { ...pending, status: 'Duplicate' })).toBe(false)
  })
})

describe('photoSharing', () => {
  it('is private unless the reporter chose public', () => {
    expect(photoSharing({})).toBe('private')
    expect(photoSharing({ photoVisibility: 'private', status: 'Verified' })).toBe('private')
  })

  it('waits for verification before a public photo is shown', () => {
    expect(photoSharing({ photoVisibility: 'public', status: 'Submitted' })).toBe('public-after-review')
    expect(photoSharing({ photoVisibility: 'public', status: 'Under review' })).toBe('public-after-review')
    expect(photoSharing({ photoVisibility: 'public', status: 'Additional information requested' })).toBe('public-after-review')
    expect(photoSharing({ photoVisibility: 'public', status: 'Verified' })).toBe('public')
    expect(photoSharing({ photoVisibility: 'public', status: 'Awaiting verification' })).toBe('public')
    expect(photoSharing({ photoVisibility: 'public', status: 'Closed' })).toBe('public')
  })
})

describe('toPhotoVisibility', () => {
  it('treats anything but public as private', () => {
    expect(toPhotoVisibility('public')).toBe('public')
    expect(toPhotoVisibility('private')).toBe('private')
    expect(toPhotoVisibility(undefined)).toBe('private')
    expect(toPhotoVisibility('PUBLIC')).toBe('private')
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
  it('is unknown for the public copy of a report whose photos are not public', () => {
    expect(knownPhotoPaths({ photoPaths: [] })).toBeUndefined()
    expect(knownPhotoPaths({ photoPaths: [], photoVisibility: 'public', status: 'Submitted' })).toBeUndefined()
  })

  it('trusts the public copy once its photos are public', () => {
    expect(knownPhotoPaths({ photoPaths: ['r/a.jpg'], photoVisibility: 'public', status: 'Verified' })).toEqual(['r/a.jpg'])
    expect(knownPhotoPaths({ photoPaths: [], photoVisibility: 'public', status: 'Verified' })).toEqual([])
  })

  it('trusts a full row, including one with no photos', () => {
    expect(knownPhotoPaths({ reporterId: 'r', photoPaths: ['r/a.jpg'] })).toEqual(['r/a.jpg'])
    expect(knownPhotoPaths({ reporterId: null, photoPaths: [] })).toEqual([])
  })
})
