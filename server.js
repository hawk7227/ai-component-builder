/* global process */
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { filterPrompt, assertModelAllowed } from './context-firewall/context-firewall.js'

dotenv.config()

const PORT = 3001
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const DEEPSEEK_MODEL = 'deepseek-v4-pro'
const MAX_VISUAL_SPEC_CHARS = 60000

const claudeKey = process.env.CLAUDE_API_KEY
const deepseekKey = process.env.DEEPSEEK_API_KEY

if (!claudeKey) throw new Error('CLAUDE_API_KEY is missing')
if (!deepseekKey) throw new Error('DEEPSEEK_API_KEY is missing')

assertModelAllowed(CLAUDE_MODEL, ['claude-sonnet-4-20250514'])
assertModelAllowed(DEEPSEEK_MODEL, ['deepseek-v4-pro'])

const claude = new Anthropic({ apiKey: claudeKey })
const deepseek = new OpenAI({
  apiKey: deepseekKey,
  baseURL: 'https://api.deepseek.com',
})

const app = express()

app.use(cors())
app.use(express.json({ limit: '20mb' }))

function parseImageDataUrl(image) {
  if (typeof image !== 'string') {
    throw new Error('Image must be a base64 data URL')
  }

  const match = image.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s)

  if (!match) {
    throw new Error('Image must be PNG, JPEG, WebP, or GIF encoded as a base64 data URL')
  }

  return {
    mediaType: match[1],
    data: match[2],
  }
}

function textFromClaude(message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function stripCodeFences(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json|javascript|jsx|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function validateGeneratedCode(code) {
  const failures = []

  if (!code.includes('GeneratedComponent')) {
    failures.push('GeneratedComponent is missing')
  }

  if (!code.includes('render(<GeneratedComponent />)')) {
    failures.push('required render(<GeneratedComponent />) call is missing')
  }

  const blocked = [
    '<iframe',
    'srcDoc',
    'document.write',
    'eval(',
    'new Function',
    'sourceImage',
  ]

  for (const token of blocked) {
    if (code.includes(token)) failures.push(`blocked construct: ${token}`)
  }

  return failures
}

async function analyzeReference({ image, imageWidth, imageHeight }) {
  const { mediaType, data } = parseImageDataUrl(image)
  const width = Number(imageWidth) || null
  const height = Number(imageHeight) || null
  const aspectRatio = width && height ? width / height : null

  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: `
You are a forensic UI reconstruction analyzer.

Analyze only the supplied reference image. Do not generate React code.
Return only valid JSON with no Markdown fences.

Extract the design system from THIS image only. Do not assume any recurring theme, palette, layout, icon family, typography, border treatment, radius, shadow, or spacing system from previous jobs.

Return exactly this top-level JSON shape:
{
  "canvas": {},
  "colorSystem": {},
  "typographySystem": {},
  "spacingSystem": {},
  "regions": [],
  "components": [],
  "decorativeDetails": [],
  "assetSlots": [],
  "icons": [],
  "text": [],
  "borders": [],
  "shadows": [],
  "gradients": [],
  "alignmentRules": [],
  "responsiveIntent": [],
  "confidence": {},
  "notes": []
}

For every visible element, capture geometry, proportions, alignment, colors, gradient stops and direction, typography size/weight/line-height/letter-spacing, exact visible text, line breaks, padding, gaps, borders, radii, dividers, shadows, icon geometry/stroke treatment, image placement, overlays, trim, rings, arcs, fades, and other micro-details.

All x/y/width/height geometry must be expressed as percentages of the full reference canvas when measurable.
Keep visually distinct colors separate rather than collapsing them into a single palette value.
Keep visually distinct border widths, radii, type sizes, and spacing values separate.

For photographic, logo, or raster regions, describe them only as replaceable asset slots. Never instruct downstream code to crop, reuse, embed, trace, or expose pixels from the reference image.

If a detail is uncertain, record uncertainty instead of inventing it.
`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data,
            },
          },
          {
            type: 'text',
            text: `Reference width: ${width ?? 'unknown'} px\nReference height: ${height ?? 'unknown'} px\nReference aspect ratio: ${aspectRatio ?? 'unknown'}\n\nExtract every visible structural and decorative detail for an accurate React reconstruction.`,
          },
        ],
      },
    ],
  })

  const raw = filterPrompt(textFromClaude(message), MAX_VISUAL_SPEC_CHARS)
  const cleaned = stripCodeFences(raw)

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('Claude vision stage returned invalid JSON')
  }
}

async function generateReact(visualSpec) {
  const serializedSpec = filterPrompt(
    JSON.stringify(visualSpec),
    MAX_VISUAL_SPEC_CHARS,
  )

  const response = await deepseek.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: 'system',
        content: `
You are a forensic screenshot-to-React reconstruction engineer.

Build the supplied visual specification exactly. Do not redesign it and do not reuse assumptions from previous jobs.

OUTPUT CONTRACT:
- Return only executable JSX/JavaScript.
- Do not use Markdown fences.
- Do not include import statements.
- Define exactly one component named GeneratedComponent.
- End exactly with: render(<GeneratedComponent />)
- Use inline styles only.
- Inline SVG is allowed for icons and geometric decoration.
- Use semantic <button type="button"> elements for buttons.
- Do not use iframe, srcDoc, eval, Function, document.write, or external scripts.
- Do not use the original reference image, sourceImage, base64 screenshot data, or screenshot crops.
- Do not invent remote image URLs or nonexistent local asset paths.

VISUAL FIDELITY:
- Derive every color from colorSystem and the element role recorded in the specification.
- Preserve distinct shades instead of normalizing them.
- Reproduce gradients, borders, dividers, trim, outlines, rings, arcs, shadows, fades, icon strokes, typography, line breaks, spacing, and region geometry recorded by the specification.
- Preserve the source canvas proportions and major section proportions.
- Do not turn wide or square references into tall mobile cards.
- Reproduce every decorativeDetails item rather than omitting details as cosmetic.
- Do not replace outline icons with emoji.

ASSET POLICY:
- Raster/photo/logo regions in assetSlots are replaceable build assets.
- If no actual asset is provided in the specification, preserve the measured asset-slot geometry without inventing a URL, person, logo, or fake file path.

Before output, internally compare the JSX against every regions, components, decorativeDetails, borders, gradients, typographySystem, spacingSystem, icons, and alignmentRules entry. Correct mismatches before returning code.
`,
      },
      {
        role: 'user',
        content: serializedSpec,
      },
    ],
    temperature: 0.1,
  })

  const code = stripCodeFences(response.choices?.[0]?.message?.content)

  if (!code) throw new Error('DeepSeek returned empty output')

  const failures = validateGeneratedCode(code)
  if (failures.length > 0) {
    throw new Error(`Generated component failed validation: ${failures.join('; ')}`)
  }

  return code
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-component-builder',
    visionProvider: 'anthropic',
    visionModel: CLAUDE_MODEL,
    codeProvider: 'deepseek',
    codeModel: DEEPSEEK_MODEL,
  })
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-component-builder',
    visionProvider: 'anthropic',
    visionModel: CLAUDE_MODEL,
    codeProvider: 'deepseek',
    codeModel: DEEPSEEK_MODEL,
  })
})

app.post('/api/generate', async (req, res) => {
  try {
    const { image, imageWidth, imageHeight } = req.body

    if (!image) {
      return res.status(400).json({ error: 'Image is required' })
    }

    const visualSpec = await analyzeReference({
      image,
      imageWidth,
      imageHeight,
    })

    const code = await generateReact(visualSpec)

    return res.json({
      code,
      visualSpec,
      visionProvider: 'anthropic',
      visionModel: CLAUDE_MODEL,
      codeProvider: 'deepseek',
      codeModel: DEEPSEEK_MODEL,
    })
  } catch (error) {
    console.error('Generation pipeline error:', error)

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Generation failed',
    })
  }
})

app.listen(PORT, () => {
  console.log(`AI server running at http://localhost:${PORT}`)
  console.log(`Vision: ${CLAUDE_MODEL}`)
  console.log(`Code: ${DEEPSEEK_MODEL}`)
})
