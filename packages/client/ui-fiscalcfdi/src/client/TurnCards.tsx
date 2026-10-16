import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CoverageCard } from './CoverageCard.tsx'
import { MonthCard } from './MonthCard.tsx'
import type { NS } from './locales.ts'

type Props = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<typeof NS>

const noop = () => {}

/** Card props the Tool views read, built from a Turn-recorded result. */
function viewProps(block: ToolResultNode, t: Props['t']): ToolCallViewProps & PropsLocale<typeof NS> {
  return {
    phase: 'result', block, callId: block.callId, toolName: block.name, t,
    useDisclosure: (() => [false, noop]) as never, openFile: noop, loadImage: (() => Promise.reject(new Error('no images'))) as never,
  } as unknown as ToolCallViewProps & PropsLocale<typeof NS>
}

/** The Turn's latest month card and bank-coverage card, beneath its closing reply. */
export function TurnCards({ turn, seq, t }: Props) {
  const data = turn.data.get('fiscalcfdi-cards')
  if (data === undefined) return null
  const bound = turn.end?.seq ?? seq
  const month = data.month !== undefined && data.month.seq <= bound ? data.month : undefined
  const coverage = data.coverage !== undefined && data.coverage.seq <= bound ? data.coverage : undefined
  if (month === undefined && coverage === undefined) return null
  return <div data-fiscalcfdi-turn="">
    {month !== undefined && <MonthCard {...viewProps(month, t)} />}
    {coverage !== undefined && <CoverageCard {...viewProps(coverage, t)} />}
  </div>
}
