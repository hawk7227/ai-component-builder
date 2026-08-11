import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DEFAULTS = Object.freeze({
  maxFiles: 100,
  maxFileBytes: 500_000,
  maxContextChars: 60_000,
  blockedNames: new Set([
    '.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.cache',
    '.env', '.env.local', '.env.production', '.env.development',
  ]),
  blockedExtensions: new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
    '.mp3', '.mp4', '.mov', '.avi', '.woff', '.woff2', '.ttf', '.eot',
  ]),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizeRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function isBlocked(root, file, options) {
  const relative = normalizeRelative(root, file)
  const parts = relative.split('/')
  if (parts.some((part) => options.blockedNames.has(part))) return true
  return options.blockedExtensions.has(path.extname(file).toLowerCase())
}

function redactSecrets(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/(OPENAI_API_KEY\s*=\s*)[^\s'\"]+/gi, '$1[REDACTED]')
    .replace(/(API_KEY\s*=\s*)[^\s'\"]+/gi, '$1[REDACTED]')
    .replace(/(SECRET\s*=\s*)[^\s'\"]+/gi, '$1[REDACTED]')
    .replace(/(PASSWORD\s*=\s*)[^\s'\"]+/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
}

function walk(root, current, options, out) {
  if (out.length > options.maxFiles * 10) return
  const entries = fs.readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(current, entry.name)
    if (isBlocked(root, full, options)) continue
    if (entry.isDirectory()) walk(root, full, options, out)
    else if (entry.isFile()) out.push(full)
  }
}

export function buildContext(rootDir, previousManifest = {}, overrides = {}) {
  const root = path.resolve(rootDir)
  const options = {
    ...DEFAULTS,
    ...overrides,
    blockedNames: overrides.blockedNames
      ? new Set(overrides.blockedNames)
      : DEFAULTS.blockedNames,
    blockedExtensions: overrides.blockedExtensions
      ? new Set(overrides.blockedExtensions)
      : DEFAULTS.blockedExtensions,
  }

  const files = []
  walk(root, root, options, files)

  const manifest = {}
  const approved = []
  const seenHashes = new Set()
  let totalChars = 0

  for (const file of files) {
    const stat = fs.statSync(file)
    if (stat.size > options.maxFileBytes) continue

    let raw
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }

    const relative = normalizeRelative(root, file)
    const hash = sha256(raw)
    manifest[relative] = hash

    if (previousManifest[relative] === hash) continue
    if (seenHashes.has(hash)) continue
    seenHashes.add(hash)

    const content = redactSecrets(raw)
    totalChars += content.length

    if (approved.length >= options.maxFiles) {
      throw new Error(`CONTEXT_FIREWALL_MAX_FILES: limit ${options.maxFiles}`)
    }

    if (totalChars > options.maxContextChars) {
      throw new Error(`CONTEXT_FIREWALL_MAX_CONTEXT: limit ${options.maxContextChars} characters`)
    }

    approved.push({ path: relative, hash, content })
  }

  return {
    approved,
    manifest,
    stats: {
      scannedFiles: files.length,
      approvedFiles: approved.length,
      contextChars: totalChars,
    },
  }
}

export function filterPrompt(prompt, maxChars = 12_000) {
  const clean = redactSecrets(String(prompt ?? ''))
  if (clean.length > maxChars) {
    throw new Error(`CONTEXT_FIREWALL_PROMPT_TOO_LARGE: limit ${maxChars} characters`)
  }
  return clean
}

export function assertModelAllowed(model, allowedModels) {
  if (!Array.isArray(allowedModels) || allowedModels.length === 0) return model
  if (!allowedModels.includes(model)) {
    throw new Error(`CONTEXT_FIREWALL_MODEL_BLOCKED: ${model}`)
  }
  return model
}
