'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Sparkles, User, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { OptionsBar } from '@/components/options-bar'
import { useVault } from '@/lib/store'
import { buildAuthHeader } from '@/lib/client/auth'
import { cn } from '@/lib/utils'
import { AIChatShareAction } from '@/components/ai-share-action'
import { AIChatFundAction } from '@/components/ai-fund-action'
import { ComputeBadge } from '@/components/compute-badge'

type Message = { 
  role: 'user' | 'assistant'
  content: string
  toolCall?: { name: string; args: any }
}

export function Chat() {
  const { records, summaries, loadSummary, language, eli5, autoWalletSigner, autoWalletAddress } = useVault()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function ask() {
    const question = input.trim()
    if (!question) return
    if (records.length === 0) {
      toast.error('Add at least one record before chatting.')
      return
    }
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: question }])
    setLoading(true)
    try {
      // Ensure summaries are decrypted/hydrated for context.
      await Promise.all(records.map((r) => loadSummary(r)))
      const latest = useVault.getState().summaries
      const context = records.map((r) => {
        const s = latest[r.id]
        return {
          id: r.id,
          title: s?.title || r.title,
          date: s?.date ?? r.date,
          docType: r.docType,
          summary: s
            ? `${s.plainLanguageSummary}\nConditions: ${s.conditions
                .map((c) => c.name)
                .join(', ')}\nMeds: ${s.medications.map((m) => m.name).join(', ')}\nLabs: ${s.labResults
                .map((l) => `${l.test} ${l.value}${l.unit} (${l.flag})`)
                .join('; ')}\nRemedies: ${s.remedies ? s.remedies.join(', ') : 'none'}`
            : '(summary unavailable)',
        }
      })
      const auth = await buildAuthHeader(autoWalletSigner, autoWalletAddress)
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { 'x-medivault-auth': auth } : {}),
        },
        body: JSON.stringify({ question, records: context, language, eli5, history: messages }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Chat failed' }))
        throw new Error(error)
      }
      const data = await res.json()
      
      if (data.toolCalls && data.toolCalls.length > 0) {
        const call = data.toolCalls[0]
        const toolName = call.function.name
        const toolArgs = JSON.parse(call.function.arguments)
        
        let assistantMessage = ''
        if (toolName === 'share_record') {
          assistantMessage = 'I can help with that! Please confirm the details below to securely share the record using your Auto-Wallet:'
        } else if (toolName === 'fund_wallet') {
          assistantMessage = `Got it! I\'ll transfer ${toolArgs.amount === 'max' ? 'the maximum available' : toolArgs.amount + ' OG'} from your Main Wallet to your Auto-Wallet. Please confirm below:`
        }
        
        setMessages((m) => [...m, { 
          role: 'assistant', 
          content: assistantMessage, 
          toolCall: { name: toolName, args: toolArgs } 
        }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.answer }])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chat failed')
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Sorry — I could not answer that just now.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      
      {/* Scrollable Chat Area */}
      <div className="flex-1 overflow-y-auto pb-40 w-full scroll-smooth">
        <div className="max-w-3xl mx-auto px-4 md:px-0 pt-8 pb-12 flex flex-col gap-8">
          
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground mt-20 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-medium text-foreground tracking-tight">How can I help you today?</h2>
              <p className="max-w-md text-base leading-relaxed">
                I can summarize your medical records, explain lab results, or answer questions based on the documents in your decentralized vault.
              </p>
              <ComputeBadge />
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex w-full', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'user' ? (
                  <div className="max-w-[75%] whitespace-pre-wrap rounded-3xl bg-muted/60 px-5 py-3.5 text-base font-medium text-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-4 max-w-[90%]">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="flex-1 whitespace-pre-wrap pt-1.5 text-base leading-relaxed text-foreground/90">
                        {m.content}
                      </div>
                    </div>
                    {m.toolCall && m.toolCall.name === 'share_record' && (
                      <div className="pl-12 w-full">
                        <AIChatShareAction args={m.toolCall.args} />
                      </div>
                    )}
                    {m.toolCall && m.toolCall.name === 'fund_wallet' && (
                      <div className="pl-12 w-full">
                        <AIChatFundAction args={m.toolCall.args} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex w-full gap-4 max-w-[90%]">
              <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 pt-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Floating Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pb-6 pt-12 px-4 md:px-0">
        <div className="max-w-3xl mx-auto w-full relative flex flex-col gap-3">
          
          <div className="flex justify-end pr-2">
            <OptionsBar />
          </div>

          <div className="relative flex items-end w-full bg-muted/30 border border-border shadow-md backdrop-blur-md rounded-[2rem] p-2 transition-all focus-within:shadow-lg focus-within:border-primary/30 focus-within:bg-background">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void ask()
                }
              }}
              placeholder="Ask anything about your health records..."
              className="min-h-[52px] max-h-[200px] w-full resize-none border-0 bg-transparent px-4 py-3.5 text-base focus-visible:ring-0 shadow-none scrollbar-hide"
              rows={1}
            />
            <Button 
              onClick={() => void ask()} 
              disabled={loading || !input.trim()} 
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full mr-1 mb-1 transition-transform active:scale-95"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-1.5 mt-1">
            <ComputeBadge />
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3 w-3" />
              <span>AI can make mistakes. Always consult your doctor for medical advice.</span>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  )
}
