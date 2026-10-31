export type RecurrenceReport = {
  id: string
  title: string
  category: string
  barangay?: string
  location: string
  coordinates: [number, number]
  createdAt: string
  status: string
}

export type RecurringHotspot = {
  key: string
  category: string
  barangay?: string
  location: string
  coordinates: [number, number]
  reportIds: string[]
  count: number
  latestAt: string
}

function distanceInMeters(first: [number, number], second: [number, number]) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(second[0] - first[0])
  const longitudeDelta = radians(second[1] - first[1])
  const latitudeOne = radians(first[0])
  const latitudeTwo = radians(second[0])
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function findRecurringHotspots(reports: readonly RecurrenceReport[], now = new Date()): RecurringHotspot[] {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000
  const candidates = reports
    .filter((report) => !['Rejected', 'Duplicate'].includes(report.status) && new Date(report.createdAt).getTime() >= cutoff)
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
  const clusters: Array<RecurringHotspot & { coordinateTotals: [number, number] }> = []

  for (const report of candidates) {
    const cluster = clusters.find((candidate) => candidate.category === report.category
      && (candidate.barangay ?? '') === (report.barangay ?? '')
      && distanceInMeters(candidate.coordinates, report.coordinates) <= 350)
    if (cluster) {
      cluster.coordinateTotals[0] += report.coordinates[0]
      cluster.coordinateTotals[1] += report.coordinates[1]
      cluster.count += 1
      cluster.coordinates = [cluster.coordinateTotals[0] / cluster.count, cluster.coordinateTotals[1] / cluster.count]
      cluster.reportIds.push(report.id)
      if (!cluster.location || report.createdAt >= cluster.latestAt) cluster.location = report.location
      if (report.createdAt > cluster.latestAt) cluster.latestAt = report.createdAt
    } else {
      clusters.push({
        key: `${report.category}:${report.barangay ?? ''}:${report.id}`,
        category: report.category,
        barangay: report.barangay,
        location: report.location,
        coordinates: [...report.coordinates],
        coordinateTotals: [...report.coordinates],
        reportIds: [report.id],
        count: 1,
        latestAt: report.createdAt,
      })
    }
  }

  return clusters
    .filter((cluster) => cluster.count >= 3)
    .sort((first, second) => second.count - first.count || second.latestAt.localeCompare(first.latestAt))
    .slice(0, 8)
    .map((cluster) => {
      const { coordinateTotals, ...hotspot } = cluster
      void coordinateTotals
      return hotspot
    })
}
