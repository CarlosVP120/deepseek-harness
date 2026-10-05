import { describe, expect, it } from 'vitest'
import { es, en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, zh } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English and Chinese', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toEqual(zh)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('zh-CN')
  })

})

it('uses Spanish for regional OS languages and persisted choices, preserving every native message placeholder', () => {
  expect(resolveDesktopStartupLocale(null, ['es-MX', 'en-US'])).toEqual({ id: 'es', messages: es })
  expect(resolveDesktopStartupLocale('es', ['en-US']).messages.cancel).toBe('Cancelar')
  expect(Object.keys(es)).toEqual(Object.keys(en))
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    expect(es[key].match(/\{[^{}]+\}/g)?.sort() ?? []).toEqual(en[key].match(/\{[^{}]+\}/g)?.sort() ?? [])
  }
})
