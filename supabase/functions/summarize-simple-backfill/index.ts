import { createClient } from 'npm:@supabase/supabase-js@2'
import { ensureEnv, isPlaceholder, invokeFunction, runConcurrent } from '../_shared/utils.ts'

const supabaseUrl = ensureEnv('SUPABASE_URL')
const serviceKey  = ensureEnv('SUPABASE_SERVICE_ROLE_KEY')
const db = createClient(supabaseUrl, serviceKey)

const CONCURRENCY = Number(Deno.env.get('BACKFILL_CONCURRENCY') ?? '5')
const BATCH = 200

async function log(row: Record<string, unknown>) {
  await db.from('ai_job_log').insert(row).select().single().catch(() => {})
}

Deno.serve(async () => {
  let totalUpdated = 0

  for (;;) {
    // Exclude curated=true at the SQL level
    const { data: rows, error } = await db
      .from('bills')
      .select('id,summary_simple,is_curated')
      .or('summary_simple.is.null,summary_simple.ilike.Placeholder%')
      .eq('is_curated', false)
      .order('id', { ascending: true })
      .range(0, BATCH - 1)

    if (error) return new Response(`DB error: ${error.message}`, { status: 500 })
    if (!rows?.length) break

    const ids = rows
      .filter(r => !r.summary_simple || isPlaceholder(r.summary_simple))
      .map(r => r.id)

    if (ids.length === 0) break

    const successes: number[] = []
    await runConcurrent(ids, CONCURRENCY, async (id) => {
      try {
        const resp = await invokeFunction({
          url: `${supabaseUrl}/functions/v1/summarize-simple`,
          token: serviceKey,
          body: { bill_id: id },
        })
        if (resp.ok) {
          successes.push(id)
        } else {
          await log({
            job:'summarize-backfill', bill_id:id, status:'invoke_error',
            http_status: resp.status,
            error: (await resp.text()).slice(0, 1000),
          })
        }
      } catch (e) {
        await log({
          job:'summarize-backfill', bill_id:id, status:'exception',
          error: String(e).slice(0, 1000),
        })
      }
    })

    totalUpdated += successes.length
  }

  return new Response(`Backfill complete. totalUpdated=${totalUpdated}`, { status: 200 })
})
