// Vite's `?worker&url` import: bundles the file as a web worker and returns its URL.
declare module '*?worker&url' {
  const url: string
  export default url
}

// Vite's `?url` import: copies the file into the build and returns its URL.
declare module '*?url' {
  const url: string
  export default url
}
