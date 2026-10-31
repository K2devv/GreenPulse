export type LocalReportDraft = {
  submissionId: string
  savedAt: string
  queued: boolean
  formValues: Record<string, string>
  coordinates: [number, number]
  locationConfirmed: boolean
  photos: File[]
}

const databaseName = 'greenpulse-report-drafts'
const storeName = 'drafts'
const draftKey = 'active'

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local draft storage is unavailable.'))
  })
}

export async function saveLocalReportDraft(draft: LocalReportDraft) {
  const database = await openDraftDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(draft, draftKey)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('The draft could not be saved.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('The draft could not be saved.'))
    })
  } finally {
    database.close()
  }
}

export async function getLocalReportDraft(): Promise<LocalReportDraft | undefined> {
  const database = await openDraftDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(draftKey)
      request.onsuccess = () => resolve(request.result as LocalReportDraft | undefined)
      request.onerror = () => reject(request.error ?? new Error('The saved draft could not be loaded.'))
    })
  } finally {
    database.close()
  }
}

export async function deleteLocalReportDraft() {
  const database = await openDraftDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(draftKey)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('The saved draft could not be deleted.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('The saved draft could not be deleted.'))
    })
  } finally {
    database.close()
  }
}
