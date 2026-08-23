// test/search-and-replace.test.ts
import mockFs from 'mock-fs'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchAndReplace } from '../src/utils/search-and-replace'

describe('searchAndReplace', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'search-replace-test-'))

    // Create a test file structure
    await mkdir(join(tempDir, 'subdir'))
    await writeFile(join(tempDir, 'file1.txt'), 'Hello world')
    await writeFile(join(tempDir, 'subdir', 'file2.txt'), 'Hello universe')
    await writeFile(join(tempDir, 'oldname.txt'), 'Old content')
  })

  afterEach(async () => {
    // Clean up the temporary directory after each test
    await rm(tempDir, { force: true, recursive: true })
  })

  it('should replace content and rename files in dry run mode without making changes', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log')

    await searchAndReplace(tempDir, ['Hello', 'oldname'], ['Hi', 'newname'], true, true)

    // Verify that no actual changes were made
    expect(await readFile(join(tempDir, 'file1.txt'), 'utf8')).toBe('Hello world')
    expect(await readFile(join(tempDir, 'subdir', 'file2.txt'), 'utf8')).toBe('Hello universe')
    expect(await readFile(join(tempDir, 'oldname.txt'), 'utf8')).toBe('Old content')

    // Check that the correct log messages were printed
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Dry Run] File modified: '))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Dry Run] Renamed:'))
    expect(consoleLogSpy).toHaveBeenCalledWith('Dry run completed')

    consoleLogSpy.mockRestore()
  })

  it('should replace content and rename files in actual run mode', async () => {
    await searchAndReplace(tempDir, ['Hello', 'oldname'], ['Hi', 'newname'], false, true)

    // Check that the content in the files has been modified
    expect(await readFile(join(tempDir, 'file1.txt'), 'utf8')).toBe('Hi world')
    expect(await readFile(join(tempDir, 'subdir', 'file2.txt'), 'utf8')).toBe('Hi universe')
    expect(await readFile(join(tempDir, 'newname.txt'), 'utf8')).toBe('Old content')

    // Verify that the old file was renamed
    await expect(access(join(tempDir, 'oldname.txt'))).rejects.toThrow()
  })

  it('should replace content when the target is an individual file', async () => {
    const filePath = join(tempDir, 'file1.txt')

    await searchAndReplace(filePath, ['Hello'], ['Hi'])

    expect(await readFile(filePath, 'utf8')).toBe('Hi world')
  })

  it('should treat search values as literal strings', async () => {
    await writeFile(join(tempDir, 'foo.bar.txt'), 'foo.bar fooXbar')
    await writeFile(join(tempDir, 'fooXbar.txt'), 'fooXbar')

    await searchAndReplace(tempDir, ['foo.bar'], ['baz'], false, false)

    expect(await readFile(join(tempDir, 'baz.txt'), 'utf8')).toBe('baz fooXbar')
    expect(await readFile(join(tempDir, 'fooXbar.txt'), 'utf8')).toBe('fooXbar')
    await expect(access(join(tempDir, 'foo.bar.txt'))).rejects.toThrow()
  })

  it('should exclude directories like node_modules and .git from processing', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log')

    // Create excluded directories
    await mkdir(join(tempDir, 'node_modules'))
    await mkdir(join(tempDir, '.git'))

    await searchAndReplace(tempDir, ['Hello'], ['Hi'], true, true)

    // Check that the excluded directories were logged and skipped
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping excluded directory:'))

    consoleLogSpy.mockRestore()
  })

  it('should handle symbolic links and skip them', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log')

    // Create a symbolic link to a file
    const symlinkPath = join(tempDir, 'symlink.txt')
    await symlink(join(tempDir, 'file1.txt'), symlinkPath)

    await searchAndReplace(tempDir, ['Hello'], ['Hi'], true, true)

    // Check that the symbolic link was skipped
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping symbolic link:'))

    consoleLogSpy.mockRestore()
  })

  it('should log replacement counts for each substitution', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log')

    await searchAndReplace(tempDir, ['Hello', 'Old'], ['Hi', 'New'], false, true)

    // Check that log shows correct counts for replacements
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Replaced "Hello" with "Hi" 1 time(s)'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Replaced "Old" with "New" 1 time(s)'))

    consoleLogSpy.mockRestore()
  })

  it('should not let one replacement rewrite the output of another (#192)', async () => {
    // Renaming the `counter` template to `my-counter` passes several name
    // variants, all searching for `counter`. Applied sequentially, the compact
    // variant matched the `counter` inside the freshly written `my-counter`.
    await writeFile(join(tempDir, 'lib.rs'), 'declare_id!("counter");')

    await searchAndReplace(tempDir, ['counter', 'counter'], ['my-counter', 'mycounter'])

    const content = await readFile(join(tempDir, 'lib.rs'), 'utf8')
    expect(content).toBe('declare_id!("my-counter");')
  })

  it('should not rescan replaced text with later pairs', async () => {
    await writeFile(join(tempDir, 'chain.txt'), 'foo')

    await searchAndReplace(tempDir, ['foo', 'bar'], ['bar', 'baz'])

    const content = await readFile(join(tempDir, 'chain.txt'), 'utf8')
    expect(content).toBe('bar')
  })

  it('should prefer the longest matching search string', async () => {
    await writeFile(join(tempDir, 'longest.txt'), 'my_counter')

    await searchAndReplace(tempDir, ['counter', 'my_counter'], ['Counter', 'acme_counter'])

    const content = await readFile(join(tempDir, 'longest.txt'), 'utf8')
    expect(content).toBe('acme_counter')
  })

  it('should apply single-pass replacement to renamed paths too', async () => {
    await writeFile(join(tempDir, 'counter.txt'), 'content')

    await searchAndReplace(tempDir, ['counter', 'counter'], ['my-counter', 'mycounter'])

    await expect(access(join(tempDir, 'my-counter.txt'))).resolves.toBeUndefined()
  })

  it('should handle errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Mock the file system and simulate an error for readFile
    mockFs({
      [tempDir]: {
        'file1.txt': mockFs.file({
          content: 'Hello world',
          mode: 0o000, // No read permissions, to trigger an error
        }),
      },
    })

    // Run searchAndReplace and expect it to handle the error without throwing
    await searchAndReplace(tempDir, ['Hello'], ['Hi'], false, true)

    // Verify that an error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing file'), expect.any(Error))

    // Restore the mocked file system and the console spy
    mockFs.restore()
    consoleErrorSpy.mockRestore()
  })
})
