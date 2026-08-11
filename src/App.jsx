import { useState } from 'react'
import {
  LiveProvider,
  LiveEditor,
  LiveError,
  LivePreview,
} from 'react-live'
import { Upload, Code, Eye, Sparkles } from 'lucide-react'
import './App.css'

const initialCode = `
function GeneratedComponent() {
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
        Your generated component will render here.
      </p>
      <button
        style={{
          marginTop: 16,
          padding: '10px 16px',
          borderRadius: 8,
          border: 0,
          background: '#7c3aed',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        Click Me
      </button>
    </div>
  )
}

render(<GeneratedComponent />)
`

function App() {
  const [code, setCode] = useState(initialCode)
  const [image, setImage] = useState(null)

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    const reader = new FileReader()

    reader.onloadend = () => {
      setImage(reader.result)
    }

    reader.readAsDataURL(file)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Sparkles size={20} />
          <strong>AI Component Builder</strong>
        </div>

        <button className="generate-button" type="button" disabled>
          <Sparkles size={16} />
          Generate from Image
        </button>
      </header>

      <main className="workspace">
        <section className="left-panel">
          <div className="upload-area">
            <label className="upload-box">
              <Upload size={30} />
              <span>Choose PNG image</span>

              <input
                type="file"
                accept="image/png"
                onChange={handleImageUpload}
                hidden
              />
            </label>

            {image && (
              <div className="image-preview">
                <img src={image} alt="Uploaded design" />
              </div>
            )}
          </div>

          <div className="panel-heading">
            <Code size={16} />
            Live Code Editor
          </div>

          <div className="editor-area">
            <LiveProvider code={code} noInline>
              <LiveEditor
                onChange={setCode}
                className="live-editor"
              />
            </LiveProvider>
          </div>
        </section>

        <section className="right-panel">
          <div className="panel-heading">
            <Eye size={16} />
            Live Preview
          </div>

          <div className="preview-area">
            <LiveProvider code={code} noInline>
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