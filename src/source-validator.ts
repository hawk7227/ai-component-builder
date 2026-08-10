const forbiddenPatterns = [
  { pattern: /<iframe\b/i, message: 'IFRAME_OUTPUT_REJECTED' },
  { pattern: /\bsrcDoc\b/i, message: 'SRCDOC_OUTPUT_REJECTED' },
  { pattern: /dangerouslySetInnerHTML/i, message: 'DANGEROUS_HTML_REJECTED' },
  { pattern: /\beval\s*\(/i, message: 'EVAL_REJECTED' },
  { pattern: /new\s+Function\s*\(/i, message: 'DYNAMIC_FUNCTION_REJECTED' },
  { pattern: /<script\b/i, message: 'SCRIPT_TAG_REJECTED' },
  { pattern: /<!doctype|<html\b|<body\b/i, message: 'FLAT_TEMPLATE_OUTPUT_REJECTED' },
  { pattern: /\bMOCK_[A-Z0-9_]*\b|\b(mockData|fakeData|dummyData|sampleData)\b/i, message: 'MOCK_DATA_REJECTED' },
]

function structuralAstCheck(source: string) {
  const errors: string[] = []

  if (/\bwidth\s*:\s*['"]?(1[0-9]{3}|[2-9][0-9]{3,})px/i.test(source)) {
    errors.push('FIXED_PAGE_CANVAS_REJECTED')
  }

  if (/\bposition\s*:\s*['"]absolute['"]/i.test(source)) {
    errors.push('ABSOLUTE_PAGE_SHELL_REJECTED')
  }

  if (/\bmarginLeft\s*:\s*['"]?(2[0-9]{2}|[3-9][0-9]{2,})/i.test(source)) {
    errors.push('LAYOUT_MARGIN_OFFSET_REJECTED')
  }

  const openBraces = (source.match(/\{/g) || []).length
  const closeBraces = (source.match(/\}/g) || []).length
  const openParens = (source.match(/\(/g) || []).length
  const closeParens = (source.match(/\)/g) || []).length

  if (openBraces !== closeBraces || openParens !== closeParens) {
    errors.push('SOURCE_DELIMITER_MISMATCH')
  }

  return errors
}

function cssCheck(source: string) {
  const errors: string[] = []

  if (/\boverflowX\s*:\s*['"]hidden['"]/i.test(source)) {
    errors.push('OVERFLOW_MASKING_REJECTED')
  }

  if (/\bminWidth\s*:\s*['"]?(1[0-9]{3}|[2-9][0-9]{3,})/i.test(source)) {
    errors.push('FIXED_MIN_WIDTH_REJECTED')
  }

  return errors
}

function dangerousCodeCheck(source: string) {
  return forbiddenPatterns
    .filter(({ pattern }) => pattern.test(source))
    .map(({ message }) => message)
}

function componentPolicyCheck(source: string) {
  const errors: string[] = []

  if (!/function\s+GeneratedComponent\s*\(/.test(source)) {
    errors.push('GENERATED_COMPONENT_REQUIRED')
  }

  if (!/render\s*\(\s*<GeneratedComponent\s*\/>\s*\)\s*;?\s*$/.test(source.trim())) {
    errors.push('RENDER_ENTRYPOINT_REQUIRED')
  }

  if (/\bimport\s+/.test(source) || /\brequire\s*\(/.test(source)) {
    errors.push('MODULE_IMPORT_REJECTED')
  }

  const buttonTags = source.match(/<button\b[\s\S]*?>/gi) || []
  for (const tag of buttonTags) {
    if (!/\bonClick\s*=/.test(tag)) {
      errors.push('UNWIRED_BUTTON_REJECTED')
      break
    }
  }

  const anchorTags = source.match(/<a\b[\s\S]*?>/gi) || []
  for (const tag of anchorTags) {
    if (/href\s*=\s*['"]#['"]/.test(tag)) {
      errors.push('HASH_ANCHOR_REJECTED')
      break
    }
  }

  const inputTags = source.match(/<input\b[\s\S]*?>/gi) || []
  for (const tag of inputTags) {
    if (!/aria-label|aria-labelledby|\bid\s*=/.test(tag)) {
      errors.push('UNLABELED_INPUT_REJECTED')
      break
    }
  }

  return errors
}

export function validateGeneratedSource(source: string) {
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, errors: ['EMPTY_SOURCE_REJECTED'] }
  }

  const errors = [
    ...structuralAstCheck(source),
    ...cssCheck(source),
    ...dangerousCodeCheck(source),
    ...componentPolicyCheck(source),
  ]

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
  }
}
