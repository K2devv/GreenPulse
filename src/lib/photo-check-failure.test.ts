import { describe, expect, it } from 'vitest'
import { PhotoCheckError, isPhotoCheckFailure, photoCheckFailureOf, supportsModuleWorkers, supportsWasmSimd } from './photo-check-failure'

describe('photoCheckFailureOf', () => {
  it('keeps the kind a photo check error was given', () => {
    for (const failure of ['download', 'app', 'device', 'photo'] as const) {
      const error = new PhotoCheckError(failure, 'detail')
      expect(photoCheckFailureOf(error)).toBe(failure)
      expect(error.message).toBe('detail')
      expect(error).toBeInstanceOf(Error)
    }
  })

  it('treats any other error as the device', () => {
    expect(photoCheckFailureOf(new Error('out of memory'))).toBe('device')
    expect(photoCheckFailureOf('text')).toBe('device')
    expect(photoCheckFailureOf(undefined)).toBe('device')
  })
})

describe('isPhotoCheckFailure', () => {
  it('accepts only the four kinds', () => {
    expect(isPhotoCheckFailure('download')).toBe(true)
    expect(isPhotoCheckFailure('app')).toBe(true)
    expect(isPhotoCheckFailure('network')).toBe(false)
    expect(isPhotoCheckFailure(undefined)).toBe(false)
  })
})

describe('supportsWasmSimd', () => {
  it('finds SIMD in a runtime that has it', () => {
    // Node's WebAssembly has had SIMD for years, so the real test module must validate.
    expect(supportsWasmSimd()).toBe(true)
  })

  it('says no for a browser without SIMD or without WebAssembly', () => {
    expect(supportsWasmSimd({ validate: () => false })).toBe(false)
    expect(supportsWasmSimd({ validate: () => { throw new Error('unsupported') } })).toBe(false)
    expect(supportsWasmSimd(null)).toBe(false)
  })
})

describe('supportsModuleWorkers', () => {
  it('says yes when the browser reads the worker type, without starting a worker', () => {
    let started = 0
    class ModernWorker {
      constructor(url: string, options?: WorkerOptions) {
        void options?.type
        if (url === 'blob://') throw new SyntaxError('Invalid URL')
        started += 1
      }
      terminate() {}
    }
    expect(supportsModuleWorkers(ModernWorker as unknown as typeof Worker)).toBe(true)
    expect(started).toBe(0)
  })

  it('says no when the browser ignores the worker type or has no workers', () => {
    class OldWorker {
      constructor(url: string) {
        if (url === 'blob://') throw new SyntaxError('Invalid URL')
      }
      terminate() {}
    }
    expect(supportsModuleWorkers(OldWorker as unknown as typeof Worker)).toBe(false)
    expect(supportsModuleWorkers(null)).toBe(false)
  })
})
