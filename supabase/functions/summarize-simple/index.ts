import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'https://deno.land/x/openai@v4.24.0/mod.ts'
import { ensureEnv, isPlaceholder } from '../_shared/utils.ts'

type BillRow = {
  id: number
  bill_number: string
  title: string | null
  description: string | null
  original_text: string | null
  summary_simple: string | null
  is_curated: boolean | null
}

const supabaseUrl = ensureEnv('SUPABASE_URL')
const serviceKey  = ensureEnv('SUPABASE_SERVICE_ROLE_KEY')
const openaiKey   = ensureEnv('OPENAI_API_KEY')

const db = createClient(supabaseUrl, serviceKey)
const openai = new OpenAI({ apiKey: openaiKey })

async function log(row: Record<string, unknown>) {
  // best-effort logging; don't throw
  await db.from('ai_job_log').insert(row).select().single().catch(() => {})
}

const SYS_PROMPT = `You are a legislative explainer. Produce a 2–4 sentence, plain-English, neutral summary (≤120 words).`

Deno.serve(async (req) => {
  let bill_id: number | undefined
  try {
    const body = await req.json()
    bill_id = body?.bill_id
    if (!bill_id) return new Response('bill_id required', { status: 400 })

    const { data: bill, error } = await db
      .from('bills')
      .select('id,bill_number,title,description,original_text,summary_simple,is_curated')
      .eq('id', bill_id)
      .single<BillRow>()
    if (error || !bill) throw error ?? new Error('Bill not found')

    if (bill.is_curated) return new Response('Skipped: is_curated', { status: 200 })
    if (bill.summary_simple && !isPlaceholder(bill.summary_simple))
      return new Response('Skipped: already summarized', { status: 200 })

    const source =
      bill.original_text?.slice(0, 6000) ??
      `${bill.title ?? bill.bill_number}\n\n${bill.description ?? ''}`

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYS_PROMPT },
        { role: 'user',   content: source },
      ],
      temperature: 0.3,
      max_tokens: 180,
    })

    const choice = res.choices?.[0]
    const content = choice?.message?.content?.trim() ?? ''

    if (!content) {
      await log({
        job:'summarize-simple', bill_id, status:'empty', http_status:200,
        finish_reason: choice?.finish_reason ?? null,
        model: res.model ?? null, response_id: (res as any).id ?? null,
        token_usage: res.usage ?? null,
        prompt_chars: source.length, content_chars: 0, preview: null,
        error: 'OpenAI responded but content was empty',
      })
      return new Response('Empty', { status: 502 })
    }

    const { error: upErr } = await db
      .from('bills')
      .update({ summary_simple: content })
      .eq('id', bill.id)

    if (upErr) {
      await log({
        job:'summarize-simple', bill_id, status:'http_error', http_status:null,
        finish_reason: choice?.finish_reason ?? null,
        model: res.model ?? null, response_id: (res as any).id ?? null,
        token_usage: res.usage ?? null,
        prompt_chars: source.length, content_chars: content.length,
        preview: content.slice(0,200),
        error: `DB update failed: ${upErr.message}`,
      })
      return new Response('DB error', { status: 500 })
    }

    await log({
      job:'summarize-simple', bill_id, status:'ok', http_status:200,
      finish_reason: choice?.finish_reason ?? null,
      model: res.model ?? null, response_id: (res as any).id ?? null,
      token_usage: res.usage ?? null,
      prompt_chars: source.length, content_chars: content.length,
      preview: content.slice(0,200),
    })

    return new Response('OK', { status: 200 })
  } catch (e) {
    await log({
      job:'summarize-simple', bill_id, status:'exception',
      error: String(e).slice(0, 2000),
    })
    return new Response('Error', { status: 500 })
  }
})
