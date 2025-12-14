/**
 * Chat Interface Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { validateQuery, sanitizeErrorMessage, truncateString } from '@/lib/security'

interface MarkdownComponentProps {
  children?: React.ReactNode;
  className?: string;
  href?: string;
  inline?: boolean;
  node?: unknown;
}

const CHAT_STORAGE_KEY = 'ai-threat-modeler-chat-messages'
const SESSION_STORAGE_KEY = 'ai-threat-modeler-chat-session'

export function ChatInterface() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Restore chat history from localStorage on mount
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY)
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY)
      
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
      if (savedSession === 'true') {
        setSessionActive(true)
      }
    } catch (err) {
      console.error('Failed to restore chat history:', err)
    }
  }, [])

  // Helper to save messages to localStorage (works even if component unmounts)
  const saveToStorage = (newMessages: Array<{ role: string; content: string }>, isSessionActive: boolean) => {
    try {
      if (newMessages.length > 0) {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(newMessages))
        localStorage.setItem(SESSION_STORAGE_KEY, String(isSessionActive))
      }
    } catch (err) {
      console.error('Failed to save chat history:', err)
    }
  }

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    saveToStorage(messages, sessionActive)
  }, [messages, sessionActive])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    // Validate and sanitize input
    const trimmedMessage = message.trim()
    const queryValidation = validateQuery(trimmedMessage, 10000) // Allow longer messages for chat
    if (!queryValidation.valid) {
      setError(queryValidation.error || 'Message is too long')
      return
    }

    setLoading(true)
    setError(null)

    // Truncate message to prevent DoS
    const sanitizedMessage = truncateString(trimmedMessage, 10000)

    // Add user message to chat and save immediately
    const userMessage = { role: 'user', content: sanitizedMessage }
    const updatedMessagesWithUser = [...messages, userMessage]
    setMessages(updatedMessagesWithUser)
    saveToStorage(updatedMessagesWithUser, sessionActive) // Save immediately
    setMessage('')

    try {
      // Check if message is /end command
      if (userMessage.content.trim().toLowerCase() === '/end') {
        const response = await api.chat(userMessage.content)
        const endMessage = { role: 'assistant', content: response.response || 'Chat session ended. Starting a new conversation.' }
        const messagesWithEnd = [...updatedMessagesWithUser, endMessage]
        saveToStorage(messagesWithEnd, false) // Save before state update
        setMessages(messagesWithEnd)
        setSessionActive(false)
        // Clear messages and localStorage after ending session
        setTimeout(() => {
          setMessages([])
          localStorage.removeItem(CHAT_STORAGE_KEY)
          localStorage.removeItem(SESSION_STORAGE_KEY)
        }, 2000)
        return
      }

      // Send message with current chat history (limit history to prevent DoS)
      const limitedHistory = messages.slice(-20) // Only send last 20 messages
      const response = await api.chat(userMessage.content, undefined, limitedHistory)
      
      // Add assistant response to chat
      if (response && response.response) {
        const assistantMessage = { role: 'assistant', content: response.response }
        const newSessionActive = response.sessionEnded ? false : (response.sessionActive !== false)
        
        // Save to localStorage FIRST (before state update, survives unmount)
        const messagesWithResponse = [...updatedMessagesWithUser, assistantMessage]
        saveToStorage(messagesWithResponse, newSessionActive)
        
        // Then update state
        setMessages(messagesWithResponse)
        setSessionActive(newSessionActive)
      } else {
        throw new Error('Invalid response format from server')
      }
    } catch (err: unknown) {
      const errorMessage = sanitizeErrorMessage(err, 'Failed to send message')
      console.error('Chat error:', err)
      setError(errorMessage)
      const errorMsg = { role: 'assistant', content: `Error: ${errorMessage}` }
      const messagesWithError = [...updatedMessagesWithUser, errorMsg]
      saveToStorage(messagesWithError, sessionActive) // Save error response too
      setMessages(messagesWithError)
    } finally {
      setLoading(false)
    }
  }

  const handleEndSession = async () => {
    try {
      setLoading(true)
      await api.endChat()
      setSessionActive(false)
      setMessages([])
      // Clear localStorage
      localStorage.removeItem(CHAT_STORAGE_KEY)
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to end chat session');
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2">Start a conversation</h2>
                <p className="text-muted-foreground">
                  Ask a question about security to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3'
                        : 'bg-muted rounded-2xl rounded-tl-sm px-4 py-3'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:my-2 prose-pre:bg-background/50 prose-code:text-foreground">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: ({ node, inline, className, children, ...props }: MarkdownComponentProps) => {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <pre className="bg-background/50 p-3 rounded-md overflow-x-auto text-foreground my-2">
                                  <code className={`${className} text-foreground font-mono text-sm`} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className="bg-background/50 px-1.5 py-0.5 rounded text-sm text-foreground font-mono" {...props}>
                                  {children}
                                </code>
                              )
                            },
                            h1: ({ children }: MarkdownComponentProps) => <h1 className="text-xl font-semibold mt-4 mb-2">{children}</h1>,
                            h2: ({ children }: MarkdownComponentProps) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                            h3: ({ children }: MarkdownComponentProps) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
                            ul: ({ children }: MarkdownComponentProps) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
                            ol: ({ children }: MarkdownComponentProps) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
                            li: ({ children }: MarkdownComponentProps) => <li className="ml-4">{children}</li>,
                            p: ({ children }: MarkdownComponentProps) => <p className="my-2 leading-relaxed">{children}</p>,
                            blockquote: ({ children }: MarkdownComponentProps) => (
                              <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-2">{children}</blockquote>
                            ),
                            a: ({ children, href }: MarkdownComponentProps) => (
                              <a href={href} className="text-primary underline hover:text-primary/80" target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            ),
                            table: ({ children }: MarkdownComponentProps) => (
                              <div className="overflow-x-auto my-2">
                                <table className="min-w-full border-collapse border border-border/50">
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children }: MarkdownComponentProps) => (
                              <th className="border border-border/50 px-4 py-2 bg-background/50 font-semibold">
                                {children}
                              </th>
                            ),
                            td: ({ children }: MarkdownComponentProps) => (
                              <td className="border border-border/50 px-4 py-2">
                                {children}
                              </td>
                            ),
                          } as Components}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Input - Fixed at bottom */}
      <div className="border-t bg-background">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          {error && (
            <div className="mb-2 text-sm text-destructive">{error}</div>
          )}
          {sessionActive && (
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>💬 Active chat session - conversation history is maintained</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEndSession}
                disabled={loading}
                className="h-6 px-2 text-xs"
              >
                End Session
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                placeholder={sessionActive ? "Message Claude... (type '/end' to end session)" : "Message Claude..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                className="min-h-[52px] max-h-[200px] resize-none pr-12"
                rows={1}
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading || !message.trim()}
              className="h-[52px] px-6"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Sending...
                </span>
              ) : (
                'Send'
              )}
            </Button>
          </form>
          <div className="mt-2 text-xs text-muted-foreground">
            <p>💡 Tip: Type <code className="bg-muted px-1 rounded">/end</code> to end the current chat session and start fresh</p>
          </div>
        </div>
      </div>
    </div>
  )
}

