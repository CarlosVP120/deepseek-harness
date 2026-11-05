import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as HostPlugin from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import {
  Config, apply, LOCALE_DEFAULT_GLOBAL,
} from '@deepseek-ai/dsh-client-locale'


describe('locale host', () => {
  it('registers an open locale preference with the Host settings lifecycle', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    const { fiber } = configuration
    expect(plainConfig(configuration.fiber.config)).toEqual({})
    await configuration.update({ preference: 'en' })
    expect(plainConfig(configuration.fiber.config)).toEqual({ preference: 'en' })
    await configuration.update({ preference: 'pt-BR' })
    expect(plainConfig(configuration.fiber.config)).toEqual({ preference: 'pt-BR' })
    await expect(configuration.update({ preference: 'bad locale' })).rejects.toThrow()
    await expect(configuration.update({ preference: '123' })).rejects.toThrow()
    await fiber.dispose()
  })
})

it('publishes a configured default locale to the page', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin({ Config, apply }, { defaultLocale: 'es' })
  await fiber.await()
  const rows: unknown[] = []
  ctx.emit('webserver/index-inject', rows as never)
  expect(rows).toEqual([{ kind: 'global', name: LOCALE_DEFAULT_GLOBAL, value: 'es' }])
  await fiber.dispose()
  const none: unknown[] = []
  ctx.emit('webserver/index-inject', none as never)
  expect(none).toEqual([])
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin(HostPlugin)))
