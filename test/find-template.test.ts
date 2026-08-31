import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findTemplate } from '../src/utils/find-template'

vi.mock('@clack/prompts', () => ({ log: { info: vi.fn(), warning: vi.fn() } }))

const templates = [{ description: 'a known template', id: 'gh:solana-foundation/templates/known', name: 'known' }]
const isWindows = sep === '\\'

function find(name: string) {
  return findTemplate({ name, templates, verbose: false })
}

describe('findTemplate', () => {
  it('resolves a named template', () => {
    expect(find('known').id).toBe('gh:solana-foundation/templates/known')
  })

  it('treats an owner/repo name as an external template', () => {
    expect(find('solana-foundation/templates').id).toBe('gh:solana-foundation/templates')
  })

  it('treats an absolute path as local, on either platform', () => {
    // On Windows an absolute path is `C:\tpl`, which holds no `/` and used to
    // fall through to the named-template lookup. Spelled `C:/tpl` it does hold
    // a `/`, so it was treated as external and giget got `C:` as a provider.
    const dir = mkdtempSync(join(tmpdir(), 'csd-'))
    expect(find(dir).id).toBe(`local:${dir}`)
    if (isWindows) {
      expect(find(dir.replaceAll('\\', '/')).id.startsWith('local:')).toBe(true)
    }
  })

  it('treats a relative path as local with either separator', () => {
    const names = ['./nope', '../nope', ...(isWindows ? [String.raw`.\nope`, String.raw`..\nope`] : [])]
    for (const name of names) {
      expect(() => find(name)).toThrow(/Local template path does not exist/)
    }
  })

  it('does not mistake a dotted template name for a path', () => {
    expect(() => find('..nope')).toThrow(/not found/)
  })
})
