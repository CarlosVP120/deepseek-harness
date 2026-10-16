/** FiscalCFDI AI occupants for sidebar and conversation brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ContabiliaiBrandMark, ContabiliaiBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/** Register FiscalCFDI AI artwork when its host surfaces declare their slots.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ContabiliaiBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, ContabiliaiBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ContabiliaiBrandMark)
      })))
}
