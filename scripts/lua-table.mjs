/**
 * Minimal parser for the Lua table constructors used by the Soulframe wiki's
 * Module:Data/* pages. Handles what those files actually contain: string and
 * number literals, `["key"] =` and bare `key =` fields, nested tables, line and
 * block comments, trailing commas, and bare identifiers (`nil`, `null`, `true`).
 *
 * Not a general Lua parser; it only needs to read data modules.
 */

export function parseLuaTable(source) {
  const src = stripReturn(source)
  const p = new Parser(src)
  p.skipTrivia()
  const value = p.parseValue()
  p.skipTrivia()
  return value
}

function stripReturn(source) {
  const idx = source.search(/(^|\n)\s*return\s/)
  if (idx === -1) return source
  return source.slice(source.indexOf('return', idx) + 'return'.length)
}

class Parser {
  constructor(src) {
    this.src = src
    this.i = 0
  }

  error(msg) {
    const line = this.src.slice(0, this.i).split('\n').length
    return new Error(`Lua parse error at line ${line}: ${msg}`)
  }

  peek() {
    return this.src[this.i]
  }

  skipTrivia() {
    for (;;) {
      // whitespace
      while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++

      if (this.src.startsWith('--', this.i)) {
        // block comment --[[ ... ]]
        const block = /^--\[(=*)\[/.exec(this.src.slice(this.i))
        if (block) {
          const close = `]${block[1]}]`
          const end = this.src.indexOf(close, this.i + block[0].length)
          this.i = end === -1 ? this.src.length : end + close.length
          continue
        }
        // line comment
        const nl = this.src.indexOf('\n', this.i)
        this.i = nl === -1 ? this.src.length : nl + 1
        continue
      }
      return
    }
  }

  expect(ch) {
    if (this.src[this.i] !== ch) throw this.error(`expected '${ch}', found '${this.src[this.i] ?? 'EOF'}'`)
    this.i++
  }

  parseValue() {
    this.skipTrivia()
    const ch = this.peek()
    if (ch === undefined) throw this.error('unexpected end of input')
    if (ch === '{') return this.parseTable()
    if (ch === '"' || ch === "'") return this.parseString()
    if (this.src.startsWith('[[', this.i) || /^\[=+\[/.test(this.src.slice(this.i))) {
      return this.parseLongString()
    }
    if (/[-\d.]/.test(ch)) return this.parseNumber()
    return this.parseIdentifierValue()
  }

  parseTable() {
    this.expect('{')
    const entries = []
    let arrayIndex = 0

    for (;;) {
      this.skipTrivia()
      if (this.peek() === '}') {
        this.i++
        break
      }
      if (this.peek() === undefined) throw this.error('unterminated table')

      let key = null
      const save = this.i

      if (this.peek() === '[') {
        // ["key"] = / [1] =  but NOT a [[long string]] value
        if (!this.src.startsWith('[[', this.i) && !/^\[=+\[/.test(this.src.slice(this.i))) {
          this.i++
          key = this.parseValue()
          this.skipTrivia()
          this.expect(']')
          this.skipTrivia()
          this.expect('=')
        }
      } else {
        const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.i))
        if (ident) {
          const after = this.i + ident[0].length
          const rest = this.src.slice(after)
          // Only a key if followed by '=' that isn't '=='
          if (/^\s*=(?!=)/.test(rest)) {
            key = ident[0]
            this.i = after
            this.skipTrivia()
            this.expect('=')
          } else {
            this.i = save
          }
        }
      }

      const value = this.parseValue()
      entries.push([key === null ? arrayIndex++ : key, value])

      this.skipTrivia()
      if (this.peek() === ',' || this.peek() === ';') {
        this.i++
        continue
      }
      if (this.peek() === '}') {
        this.i++
        break
      }
      throw this.error(`expected ',' or '}', found '${this.peek() ?? 'EOF'}'`)
    }

    // Pure integer-keyed tables become arrays; anything else an object.
    const isArray = entries.length > 0 && entries.every(([k], n) => k === n)
    if (isArray) return entries.map(([, v]) => v)

    const obj = {}
    for (const [k, v] of entries) obj[k] = v
    return obj
  }

  parseString() {
    const quote = this.src[this.i++]
    let out = ''
    while (this.i < this.src.length) {
      const ch = this.src[this.i++]
      if (ch === '\\') {
        const esc = this.src[this.i++]
        const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", a: '\x07', b: '\b' }
        if (esc in map) out += map[esc]
        else if (esc === 'z') this.skipTrivia()
        else if (/\d/.test(esc)) {
          let digits = esc
          while (digits.length < 3 && /\d/.test(this.src[this.i])) digits += this.src[this.i++]
          out += String.fromCharCode(Number(digits))
        } else out += esc
        continue
      }
      if (ch === quote) return out
      out += ch
    }
    throw this.error('unterminated string')
  }

  parseLongString() {
    const m = /^\[(=*)\[/.exec(this.src.slice(this.i))
    if (!m) throw this.error('expected long string')
    this.i += m[0].length
    if (this.src[this.i] === '\n') this.i++
    const close = `]${m[1]}]`
    const end = this.src.indexOf(close, this.i)
    if (end === -1) throw this.error('unterminated long string')
    const out = this.src.slice(this.i, end)
    this.i = end + close.length
    return out
  }

  parseNumber() {
    const m = /^-?(0[xX][0-9a-fA-F]+|\d*\.?\d+([eE][+-]?\d+)?)/.exec(this.src.slice(this.i))
    if (!m) throw this.error('malformed number')
    this.i += m[0].length
    return Number(m[0])
  }

  parseIdentifierValue() {
    const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.src.slice(this.i))
    if (!m) throw this.error(`unexpected character '${this.peek()}'`)
    this.i += m[0].length
    if (m[0] === 'true') return true
    if (m[0] === 'false') return false
    // `nil` and the wiki's stray `null` both mean "absent".
    return null
  }
}
