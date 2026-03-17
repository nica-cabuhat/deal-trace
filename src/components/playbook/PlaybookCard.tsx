import type { PlaybookThread } from '@/lib/types/playbook'

// Hollow starter — implement after Playbook Generator output is defined
export default function PlaybookCard({ thread }: { thread: PlaybookThread }) {
  return <div>{thread.subject}</div>
}
