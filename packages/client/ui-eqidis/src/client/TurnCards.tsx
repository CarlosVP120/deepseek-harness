import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FollowUp } from './PendingList.tsx'
import { WorkpaperCard } from './WorkpaperCard.tsx'
import type { NS } from './locales.ts'

type Props = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<typeof NS> & InjectFace<{ follow: FollowUp }>

const noop = () => {}

/** Card props the Tool view reads, built from a Turn-recorded result. */
function viewProps(block: ToolResultNode, t: Props['t']): ToolCallViewProps & PropsLocale<typeof NS> {
  return {
    phase: 'result', block, callId: block.callId, toolName: block.name, t,
    useDisclosure: (() => [false, noop]) as never, openFile: noop, loadImage: (() => Promise.reject(new Error('no images'))) as never,
  } as unknown as ToolCallViewProps & PropsLocale<typeof NS>
}

/** Every workpaper the Turn closed, beneath its closing reply where the accountant reads the result. */
export function TurnCards({ turn, seq, t, follow }: Props) {
  const data = turn.data.get('eqidis-workpapers')
  if (data === undefined) return null
  const bound = turn.end?.seq ?? seq
  const results = data.results.filter(result => result.seq <= bound)
  if (results.length === 0) return null
  return <div data-eqidis-turn="">{results.map(result => <WorkpaperCard key={result.callId} {...viewProps(result, t)} follow={follow} />)}</div>
}
