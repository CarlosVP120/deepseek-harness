/** Accept the EQIDIS deployment defaults through the shipped browser and provider registry. */
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'

it('starts in Spanish with EQIDIS artwork and only the configured OpenRouter route', async () => {
  const scaffold = await launchWebScaffold({ deploymentProviders: true, deepSeekMissingCredential: true })
  const browser = await chromium.launch()
  try {
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
    expect(scaffold.ctx.llm.listProviders().map(provider => provider.id)).toEqual(['openrouter'])
    expect(scaffold.ctx.agentDefaultModel.currentSelection()).toEqual({
      provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', reasoningEffort: 'high',
    })
    expect(scaffold.ctx.subagentModelSelection.current()).toEqual({
      enabled: true,
      allowedModels: [
        { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
      ],
    })
    const models = await scaffold.ctx.llm.listModels('openrouter')
    expect(models.map(model => model.id)).toEqual([
      'deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4-pro',
    ])
    expect(models).toMatchObject([
      { id: 'deepseek/deepseek-v4.1-flash', name: 'Flash' },
      { id: 'deepseek/deepseek-v4-pro', name: 'Pro' },
    ])
    for (const model of models) {
      const info = await scaffold.ctx.llm.resolveModelInfo('openrouter', model.id)
      expect(info.reasoning?.defaultEffort).toBe('high')
      expect(info.reasoning?.efforts.map(effort => effort.id)).toEqual(['high'])
    }
    const page = await browser.newPage({ locale: 'es-MX', viewport: { width: 1280, height: 900 } })
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('button', { name: 'Nueva sesión', exact: true }).first().waitFor()
    expect(await page.title()).toBe('EQIDIS AI')
    expect(await page.getByRole('button', { name: 'Modo estándar', exact: true }).count()).toBe(0)
    expect(await page.locator('svg path[fill="#E86A6E"]').count()).toBeGreaterThan(0)
    expect(await page.locator('svg path[fill="#674899"]').count()).toBeGreaterThan(0)
    await page.reload()
    await page.getByRole('button', { name: 'Nueva sesión', exact: true }).first().waitFor()
    expect(await page.getByRole('button', { name: 'Complementos', exact: true }).isVisible()).toBe(true)
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
