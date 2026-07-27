#!/usr/bin/env node
/**
 * Backs up the logbook to a timestamped folder: every table as JSON, plus
 * every stored photo and document.
 *
 *   npm run backup
 *
 * Why a logical export rather than pg_dump: this needs no Postgres client
 * installed, no database password, and works the same on any machine. The
 * schema is already version-controlled in supabase/schema.sql, so schema plus
 * this data export is a complete restore path.
 *
 * Uses the service-role key, so it reads straight past RLS. That is correct
 * here — a backup that only captured what one signed-in user could see would
 * not be a backup — but it is also why this is a script you run, never
 * anything the app imports.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tables in dependency order, so a restore can replay them top to bottom.
const TABLES = [
  'boats',
  'allowed_emails',
  'boat_members',
  'crew',
  'trips',
  'trip_passengers',
  'maintenance_schedule',
  'maintenance_log',
  'documents',
  'points_of_interest',
  'trip_sites',
  'trip_photos',
  'float_plans',
  'float_plan_crew',
]

const BUCKETS = ['trip-photos', 'boat-documents']

function loadEnv() {
  // Read .env.local directly so the script needs no dotenv dependency.
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
      }
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Run this from the project root, where .env.local lives.',
    )
    process.exit(1)
  }
  return { url, key }
}

/** Storage listing is per-folder, so walk the tree. */
async function listAll(supabase, bucket, prefix = '') {
  const found = []
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })

  if (error) throw new Error(`listing ${bucket}/${prefix}: ${error.message}`)

  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // Folders come back with a null id.
    if (entry.id === null) {
      found.push(...(await listAll(supabase, bucket, path)))
    } else {
      found.push(path)
    }
  }
  return found
}

async function main() {
  const { url, key } = loadEnv()
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = new Date()
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const root = join('backups', stamp)
  await mkdir(join(root, 'data'), { recursive: true })

  console.log(`Backing up to ${root}\n`)

  const counts = {}
  let failed = 0

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      console.error(`  ${table.padEnd(22)} FAILED — ${error.message}`)
      failed += 1
      continue
    }
    await writeFile(
      join(root, 'data', `${table}.json`),
      JSON.stringify(data, null, 2),
      'utf8',
    )
    counts[table] = data.length
    console.log(`  ${table.padEnd(22)} ${String(data.length).padStart(5)} rows`)
  }

  console.log('')
  const files = {}

  for (const bucket of BUCKETS) {
    let paths = []
    try {
      paths = await listAll(supabase, bucket)
    } catch (error) {
      console.error(`  ${bucket.padEnd(22)} FAILED — ${error.message}`)
      failed += 1
      continue
    }

    let saved = 0
    for (const path of paths) {
      const { data, error } = await supabase.storage.from(bucket).download(path)
      if (error || !data) {
        console.error(`    ${bucket}/${path} — ${error?.message ?? 'no data'}`)
        failed += 1
        continue
      }
      const target = join(root, 'storage', bucket, path)
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, Buffer.from(await data.arrayBuffer()))
      saved += 1
    }
    files[bucket] = saved
    console.log(`  ${bucket.padEnd(22)} ${String(saved).padStart(5)} files`)
  }

  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify(
      {
        takenAt: startedAt.toISOString(),
        project: url,
        rows: counts,
        files,
        failures: failed,
        note:
          'auth.users is not included — it is managed by Supabase Auth. On a ' +
          'restore, people sign in again and the allowed_emails trigger ' +
          'regrants membership automatically.',
      },
      null,
      2,
    ),
    'utf8',
  )

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)
  const totalFiles = Object.values(files).reduce((a, b) => a + b, 0)

  console.log(`\n${totalRows} rows, ${totalFiles} files -> ${root}`)

  if (failed > 0) {
    console.error(`\n${failed} item(s) failed. This backup is INCOMPLETE.`)
    process.exit(1)
  }
  console.log('Backup complete.')
}

main().catch((error) => {
  console.error(`\nBackup failed: ${error.message}`)
  process.exit(1)
})
