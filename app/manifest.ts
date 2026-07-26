import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alice May Logbook',
    short_name: 'Alice May',
    description:
      'Trip log, conditions, and maintenance for Alice May — Monterey Harbor.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06131f',
    theme_color: '#0b2033',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
