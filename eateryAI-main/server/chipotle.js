import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const chipotleBuilderDataPath = path.join(rootDir, 'src', 'data', 'chipotleBuilderData.json')

const firecrawlJsonFormat = {
  type: 'json',
  prompt:
    'Extract the visible Chipotle nutrition calculator meal-builder options from this page. Return only what is explicitly visible in the rendered page.',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pageTitle: { type: ['string', 'null'] },
      heroText: { type: ['string', 'null'] },
      mealTypes: {
        type: 'array',
        items: { type: 'string' },
      },
      proteins: {
        type: 'array',
        items: { type: 'string' },
      },
      premiumAddons: {
        type: 'array',
        items: { type: 'string' },
      },
      callouts: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['pageTitle', 'heroText', 'mealTypes', 'proteins', 'premiumAddons', 'callouts'],
  },
}

export async function loadChipotleBuilderData({ refresh = false } = {}) {
  const raw = await readFile(chipotleBuilderDataPath, 'utf8')
  const snapshot = JSON.parse(raw)

  return {
    snapshot,
    firecrawl: refresh ? await scrapeChipotleCalculator(snapshot.restaurant.menuUrl) : firecrawlStatus(),
  }
}

function firecrawlStatus() {
  return {
    configured: Boolean(process.env.FIRECRAWL_API_KEY?.trim()),
    refreshed: false,
    data: null,
    error: null,
  }
}

async function scrapeChipotleCalculator(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim()
  const baseUrl = (process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev').replace(/\/+$/u, '')

  if (!apiKey) {
    return firecrawlStatus()
  }

  const response = await fetch(`${baseUrl}/v2/scrape`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: [firecrawlJsonFormat],
      onlyMainContent: false,
      waitFor: 2500,
      timeout: 45000,
      mobile: false,
      location: {
        country: 'US',
        languages: ['en-US'],
      },
      actions: [
        {
          type: 'wait',
          milliseconds: 2500,
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      configured: true,
      refreshed: false,
      data: null,
      error: text || `Firecrawl scrape failed with status ${response.status}.`,
    }
  }

  const payload = await response.json()
  const extractedData = payload?.data?.json || payload?.data?.extract || null

  return {
    configured: true,
    refreshed: Boolean(extractedData),
    data: extractedData,
    error: null,
  }
}
