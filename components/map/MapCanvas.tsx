'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapMarker = {
  id: string
  lat: number
  lng: number
  label: string
  category: string
  kind: 'site' | 'trip'
  href?: string
}

const CATEGORY_COLOR: Record<string, string> = {
  'dive site': '#1f5f72',
  anchorage: '#1b4666',
  'fishing spot': '#c22e6f',
  other: '#123048',
}

function siteIcon(category: string) {
  const color = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.other
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #faf7ef;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

/** Trip starts get a square so they read as a different class of thing. */
function tripIcon() {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:10px;height:10px;background:#d9578f;border:2px solid #faf7ef;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

export function MapCanvas({
  center,
  zoom = 12,
  markers,
  onMapClick,
  height = 460,
}: {
  center: [number, number]
  zoom?: number
  markers: MapMarker[]
  onMapClick?: (lat: number, lng: number) => void
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const clickRef = useRef(onMapClick)

  // Kept in a ref so the map is built once, not rebuilt whenever the parent
  // hands down a new closure.
  useEffect(() => {
    clickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: false,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    // Buoys, beacons, and harbour detail. Required attribution, and the reason
    // this map is worth having for a boat rather than any generic map.
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenSeaMap contributors',
    }).addTo(map)

    map.on('click', (event: L.LeafletMouseEvent) => {
      clickRef.current?.(event.latlng.lat, event.latlng.lng)
    })

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [center, zoom])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    layer.clearLayers()

    for (const marker of markers) {
      const pin = L.marker([marker.lat, marker.lng], {
        icon: marker.kind === 'trip' ? tripIcon() : siteIcon(marker.category),
        title: marker.label,
      })

      const safeLabel = marker.label.replace(/[<>&"]/g, '')
      pin.bindPopup(
        marker.href
          ? `<strong>${safeLabel}</strong><br/><a href="${marker.href}">Open</a>`
          : `<strong>${safeLabel}</strong>`,
      )
      pin.addTo(layer)
    }
  }, [markers])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-lg border border-chart-300 dark:border-hull-700"
    />
  )
}
