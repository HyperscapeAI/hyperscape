import React, { createContext, useContext, useState, ReactNode } from 'react'

interface ChatContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  active: boolean
  setActive: (active: boolean) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  const [active, setActive] = useState(false)

  return (
    <ChatContext.Provider value={{ collapsed, setCollapsed, active, setActive }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider')
  }
  return context
}
