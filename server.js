import http from 'node:http'

const PORT = 3001
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(JSON.stringify(payload))
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk

      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Request body exceeds 20 MB limit.'))
        req.destroy()
      }
    })

    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function extractOutputText(responseJson) {
  const parts = []

  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text)
      }
    }
  }

  return parts.join('\n').trim()
}

async function generateComponent(image) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5',
      instructions: `You are an expert React UI developer. Recreate the supplied interface image as a responsive React component.

Return only executable JSX/JavaScript with no Markdown fences and no import statements.
Define function GeneratedComponent(). End exactly with render(<GeneratedComponent />).
Do not emit iframe, srcDoc, dangerouslySetInnerHTML, eval, scripts, giant HTML documents, fixed page canvases, absolute page shells, MOCK_* data, mockData, fakeData, dummyData, or sampleData.
Every button must have a real onClick handler. Every input must have an accessible label via aria-label, aria-labelledby, or a matching id/label. Do not use href="#".
Prefer fluid maxWidth/minmax/grid/flex layouts and touch targets at least 44px tall.`,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Generate the React component represented by this PNG.',
            },
            {
              type: 'input_image',
              image_url: image,
              detail: 'high',
            },
          ],
        },
      ],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    const message = data?.error?.message || 'OpenAI generation request failed.'
    throw new Error(message)
  }

  const code = extractOutputText(data)

  if (!code) {
    throw new Error('The model returned no component source.')
  }

  return code
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      const rawBody = await collectBody(req)
      const body = JSON.parse(rawBody)

      if (typeof body.image !== 'string' || !body.image.startsWith('data:image/png;base64,')) {
        sendJson(res, 400, { error: 'A base64 PNG image is required.' })
        return
      }

      const code = await generateComponent(body.image)
      sendJson(res, 200, {
        code,
        preview: {
          visibility: 'private',
          qualityStatus: 'pending',
          publishable: false,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.'
      sendJson(res, 500, { error: message })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`AI server running at http://localhost:${PORT}`)
})
