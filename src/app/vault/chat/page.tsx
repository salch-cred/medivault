'use client'

import { ConnectGate } from '@/components/connect-gate'
import { Chat } from '@/components/chat'

export default function ChatPage() {
  return (
    <ConnectGate>
      <div className="h-[calc(100vh-64px-32px)]">
        <Chat />
      </div>
    </ConnectGate>
  )
}
