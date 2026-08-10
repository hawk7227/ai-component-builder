import { useState } from 'react'
import {
  LiveProvider,
  LiveEditor,
  LiveError,
  LivePreview,
} from 'react-live'
import { Upload, Code, Eye, Sparkles, ShieldCheck } from 'lucide-react'
import { validateGeneratedSource } from './source-validator'
import './App.css'

const initialCode = `
function GeneratedComponent() {
  const [clicked, setClicked] = useState(false)

  return (
    <div style={{
      padding: 32,
      maxWidth: 420,
      margin: '40px auto',
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
    }}>
      <h2 style={{ marginBottom: 8 }}>AI Visual Preview</h2>
      <p style={{ color: '#64748b' }}>
        Upload a PNG, then generate and validate the component.
      </p>
      <button
        type="button"
        onClick={() => setClicked(true)}
        style={{
          marginTop: 16,
          minHeight: 44,
          padding: '10px 16px',
          borderRadius: 8,
          border: 0,
          background: '#7c3aed',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        {clicked ? 'Validated' : 'Test Action'}
      </button>
    </div>
  )
}

render(<GeneratedComponent />)
`

const liveScope = { useState }

function App() {
  const [code, setCode] = useState(initialCode)
  const [approvedCode, setApprovedCode] = useState(initialCode)
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState('')

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (file.type !== 'image/png') {
      setImage(null)
      setError('Only PNG images are accepted.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setImage(reader.result)
      setError('')
      setStatus('Image loaded — ready to generate')
    }

    reader.onerror = () => {
      setImage(null)
      setError('The PNG could not be read.')
      setStatus('Image load failed')
    }

    reader.readAsDataURL(file)
  }

  const validateAndApprove = (candidate) => {
    const result = validateGeneratedSource(candidate)

    if (!result.ok) {
      throw new Error(result.errors.join(' | '))
    }

    setCode(candidate)
    setApprovedCode(candidate)
    setStatus('Validation passed — preview approved')
  }

  const handleManualValidation = () => {
    setError('')

    try {
      validateAndApprove(code)
    } catch (validationError) {
      setStatus('Validation blocked preview')
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Source validation failed.',
      )
    }
  }

  const generateFromImage = async () => {
    if (!image) {
      setError('Choose a PNG image first.')
      return
    }

    setLoading(true)
    setError('')
    setStatus('Generating private candidate…')

    try {
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed.')
      }

      if (typeof data.code !== 'string' || !data.code.trim()) {
        throw new Error('The generation service returned no component source.')
      }

      setStatus('Candidate received — running source gates')
      validateAndApprove(data.code.trim())
    } catch (generationError) {
      console.error(generationError)
      setStatus('Generation or validation failed')
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Generation failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Sparkles size={20} aria-hidden="true" />
          <strong>AI Component Builder</strong>
        </div>

        <div className="topbar-actions">
          <button
            className="validate-button"
            type="button"
            onClick={handleManualValidation}
            disabled={loading}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            Validate & Preview
          </button>

          <button
            className="generate-button"
            type="button"
            onClick={generateFromImage}
            disabled={!image || loading}
          >
            <Sparkles size={16} aria-hidden="true" />
            {loading ? 'Generating…' : 'Generate from Image'}
          </button>
        </div>
      </header>

      <div className="status-bar" role="status" aria-live="polite">
        {status}
      </div>

      {error && (
        <div className="generation-error" role="alert">
          {error}
        </div>
      )}

      <main className="workspace">
        <section className="left-panel" aria-label="Image and source editor">
          <div className="upload-area">
            <label className="upload-box">
              <Upload size={30} aria-hidden="true" />
              <span>Choose PNG image</span>
              <input
                type="file"
                accept="image/png"
                onChange={handleImageUpload}
                aria-label="Choose PNG image"
              />
            </label>

            {image && (
              <div className="image-preview">
                <img src={image} alt="Uploaded design target" />
              </div>
            )}
          </div>

          <div className="panel-heading">
            <Code size={16} aria-hidden="true" />
            Live Code Editor — candidate source
          </div>

          <div className="editor-area">
            <LiveProvider code={code} noInline scope={liveScope}>
              <LiveEditor onChange={setCode} className="live-editor" />
            </LiveProvider>
          </div>
        </section>

        <section className="right-panel" aria-label="Validated preview">
          <div className="panel-heading">
            <Eye size={16} aria-hidden="true" />
            Validated Live Preview
          </div>

          <div className="preview-area">
            <LiveProvider code={approvedCode} noInline scope={liveScope}>
              <LivePreview />
              <LiveError className="live-error" />
            </LiveProvider>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
