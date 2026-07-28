#!/usr/bin/env node
/**
 * Build every app icon from design/app-icon.svg.
 *
 * Run after changing the artwork: `npm run icons`. Committing the outputs
 * matters — the build does not run this, and a stale PNG next to a fresh SVG
 * is the kind of thing nobody notices until it is on a home screen.
 */
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const GROUND = '#0b2033'

/** Android crops maskable icons to its own shape; keep clear of the edges. */
const MASKABLE_CONTENT = 0.78

async function render(svg, size) {
  return sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * An .ico is a small directory of images. Modern browsers read PNG payloads
 * inside one, which saves encoding BMP by hand.
 */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function main() {
  const svg = await readFile(join(root, 'design/app-icon.svg'))
  // 16 gets its own artwork. Shrinking the full drawing that far put every
  // stroke near one pixel and every gap under one, and it came out a smudge.
  const svg16 = await readFile(join(root, 'design/app-icon-16.svg'))
  await mkdir(join(root, 'public/icons'), { recursive: true })

  const write = async (path, data) => {
    await writeFile(join(root, path), data)
    console.log(`  ${path}  ${(data.length / 1024).toFixed(1)} kB`)
  }

  // Convention files. Next serves these from /favicon.ico, /icon and
  // /apple-icon, and writes the <link> tags itself.
  await write('app/icon.png', await render(svg, 512))
  await write('app/apple-icon.png', await render(svg, 180))
  await write(
    'app/favicon.ico',
    ico([
      { size: 16, data: await render(svg16, 16) },
      { size: 32, data: await render(svg, 32) },
      { size: 48, data: await render(svg, 48) },
    ]),
  )

  // Referenced by name from the manifest, so they live in public/.
  await write('public/icons/icon-192.png', await render(svg, 192))
  await write('public/icons/icon-512.png', await render(svg, 512))

  const inset = Math.round((512 * (1 - MASKABLE_CONTENT)) / 2)
  await write(
    'public/icons/icon-maskable-512.png',
    await sharp(await render(svg, 512 - inset * 2))
      .extend({
        top: inset,
        bottom: inset,
        left: inset,
        right: inset,
        background: GROUND,
      })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
