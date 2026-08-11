import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { installOpenAIFetchFirewall } from './context-firewall/context-firewall.js'

dotenv.config()
installOpenAIFetchFirewall()

const app = express()

app.use(cors())
app.use(express.json({ limit: '20mb' }))

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

app.post('/api/generate', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({
        error: 'Image is required',
      })
    }

    const response = await client.responses.create({
      model: 'gpt-4.1',
      instructions: `
You are an expert React UI developer.

Recreate the supplied interface image as a React component.

Rules:
- Return only executable JSX/JavaScript.
- Do not use Markdown fences.
- Do not include import statements.
- Use inline styles.
- Define a component named GeneratedComponent.
- End exactly with:
render(<GeneratedComponent />)
`,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Generate the React component represented by this image.',
            },
            {
              type: 'input_image',
              image_url: image,
            },
          ],
        },
      ],
    })

    res.json({
      code: response.output_text,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Generation failed',
    })
  }
})

app.listen(3001, () => {
  console.log('AI server running at http://localhost:3001')
})
