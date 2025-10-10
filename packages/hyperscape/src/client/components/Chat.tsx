import { MessageSquareIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

import { ControlPriorities } from '../../extras/ControlPriorities'
import { World } from '../../World'
import type { ChatMessage, ControlBinding } from '../../types'
import { EventType } from '../../types/events'
import { cls, isTouch } from '../utils'

export function Chat({ world }: { world: World }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [msg, setMsg] = useState('')
  const [active, setActive] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [chatVisible, setChatVisible] = useState(() => world.prefs?.chatVisible ?? true)
  
  useEffect(() => {
    console.log('[Chat UI] Chat component mounted');
    console.log('[Chat UI] world.chat exists:', !!world.chat);
    console.log('[Chat UI] world.network exists:', !!world.network);
    console.log('[Chat UI] world.network.id:', world.network?.id);
    console.log('[Chat UI] chatVisible:', chatVisible);
  }, []);
  
  useEffect(() => {
    const onToggle = () => {
      setActive(!active)
      if (!active) {
        setCollapsed(false)
      }
    }
    world.on(EventType.UI_SIDEBAR_CHAT_TOGGLE, onToggle)
    return () => {
      world.off(EventType.UI_SIDEBAR_CHAT_TOGGLE, onToggle)
    }
  }, [active])
  
  useEffect(() => {
    const onPrefsChange = (changes: { chatVisible?: { value: boolean } }) => {
      if (changes.chatVisible !== undefined) {
        setChatVisible(changes.chatVisible.value)
      }
    }
    world.prefs?.on('change', onPrefsChange)
    return () => {
      world.prefs?.off('change', onPrefsChange)
    }
  }, [])
  useEffect(() => {
    const control = world.controls?.bind({ priority: ControlPriorities.CORE_UI }) as ControlBinding | undefined
    if (!control) return
    if (control.slash) {
      control.slash.onPress = () => {
        if (!active) {
          setActive(true)
          setCollapsed(false)
        }
      }
    }
    if (control.enter) {
      control.enter.onPress = () => {
        if (!active) {
          setActive(true)
          setCollapsed(false)
        }
      }
    }
    if (control.mouseLeft) {
      control.mouseLeft.onPress = () => {
        if (control.pointer?.locked && active) {
          setActive(false)
        }
      }
    }
    return () => {
      if (control?.release) {
        control.release()
      }
    }
  }, [active])
  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus()
    } else if (inputRef.current) {
      inputRef.current.blur()
    }
  }, [active])
  const send = async (e: React.KeyboardEvent | React.MouseEvent | KeyboardEvent | MouseEvent) => {
    if (world.controls?.pointer?.locked) {
      setTimeout(() => setActive(false), 10)
    }
    if (!msg) {
      e.preventDefault()
      return setActive(false)
    }
    setMsg('')
    // check for commands
    if (msg.startsWith('/')) {
      world.chat.command(msg)
      return
    }
    // otherwise post it
    world.chat.send(msg)
    if (isTouch) {
      // setActive(false)
      if (e.target && e.target instanceof HTMLElement) {
        e.target.blur()
      }
      setTimeout(() => setActive(false), 10)
    }
  }
  
  return (
    <div
      className={cls('mainchat fixed text-base pointer-events-auto', { active, collapsed, hidden: !chatVisible })}
      style={{
        left: 'env(safe-area-inset-left)',
        bottom: 'env(safe-area-inset-bottom)',
        right: 'env(safe-area-inset-right)',
      }}
    >
      <style>{`
        @media all and (max-width: 768px) {
          .mainchat-header {
            height: 2.25rem !important;
            font-size: 0.9rem !important;
          }
          .mainchat-entry {
            height: 2.75rem !important;
          }
          .mainchat-entry input {
            font-size: 0.95rem !important;
          }
        }
        .mainchat.hidden {
          display: none;
        }
        .mainchat-header {
          pointer-events: auto;
          height: 2.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          background: rgba(11, 10, 21, 0.9);
          backdrop-filter: blur(5px);
          cursor: pointer;
          user-select: none;
          color: white;
        }
        .mainchat-msgs {
          padding: 1rem;
          background: rgba(11, 10, 21, 0.85);
          color: white;
        }
        .mainchat-entry {
          height: 3.25rem;
          padding: 0 1rem;
          background: rgba(11, 10, 21, 0.85);
          backdrop-filter: blur(5px);
          display: ${active && !collapsed ? 'flex' : 'none'};
          align-items: center;
          cursor: text;
        }
        .mainchat-entry input {
          width: 100%;
          font-size: 1.05rem;
          line-height: 1;
          color: white;
          outline: none;
        }
        .mainchat-entry input:focus {
          outline: none;
        }
        .mainchat.collapsed .mainchat-msgs { display: none; }
        .mainchat.collapsed .mainchat-entry { display: none; }
      `}</style>
      <div
        className='mainchat-header'
        onClick={() => setCollapsed(prev => !prev)}
        title={collapsed ? 'Open chat' : 'Collapse chat'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquareIcon size={16} />
          <span>Chat</span>
        </div>
        <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>{collapsed ? '▾' : '▴'}</div>
      </div>
      <div className='mainchat-msgs'>
        {isTouch && (!active || collapsed) && <MiniMessages world={world} />}
        {(isTouch && active && !collapsed) && <Messages world={world} active={active} />}
        {(!isTouch && !collapsed) && <Messages world={world} active={active} />}
      </div>
      {!active && !collapsed && (
        <div
          className='mainchat-entry'
          style={{ display: 'flex', borderTop: 'none' }}
          onClick={() => {
            setActive(true)
            setCollapsed(false)
          }}
        >
          <input
            readOnly
            value={''}
            placeholder={'Press Enter to chat'}
            onFocus={() => {
              setActive(true)
              setCollapsed(false)
            }}
          />
        </div>
      )}
      <label 
        className='mainchat-entry'
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className='side-chatbox-input'
          type='text'
          placeholder='Say something...'
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => {
            if (e.code === 'Escape') {
              setActive(false)
            }
            // meta quest 3 isn't spec complaint and instead has e.code = '' and e.key = 'Enter'
            // spec says e.code should be a key code and e.key should be the text output of the key eg 'b', 'B', and '\n'
            if (e.code === 'Enter' || e.key === 'Enter') {
              send(e)
            }
          }}
          onBlur={_e => {
            if (!isTouch) {
              setActive(false)
            }
          }}
        />
      </label>
    </div>
  )
}


function MiniMessages({ world }: { world: World }) {
  const [msg, setMsg] = useState<ChatMessage | null>(null)
  useEffect(() => {
    let init: boolean
    return world.chat.subscribe((msgs: unknown[]) => {
      if (!init) {
        init = true
        return // skip first
      }
      const msg = msgs[msgs.length - 1] as ChatMessage
      if (msg.fromId === world.network.id) return
      setMsg(msg)
    })
  }, [])
  if (!msg) return null
  return (
    <div className='minimessages'>
      <Message msg={msg} />
    </div>
  )
}

function Messages({ world, active }: { world: World; active: boolean }) {
  const initRef = useRef<boolean>(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const [msgs, setMsgs] = useState<unknown[]>([])
  useEffect(() => {
    console.log('[Messages] Subscribing to chat updates');
    const unsubscribe = world.chat.subscribe(setMsgs);
    console.log('[Messages] Subscribed, current messages:', world.chat.msgs.length);
    return () => {
      console.log('[Messages] Unsubscribing from chat');
      unsubscribe();
    };
  }, [])
  useEffect(() => {
    setTimeout(() => {
      const didInit = initRef.current
      initRef.current = true
      contentRef.current?.scroll({
        top: 9999999,
        behavior: (didInit ? 'instant' : 'smooth') as ScrollBehavior,
      })
    }, 10)
  }, [msgs])
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new MutationObserver(() => {
      if (spacerRef.current && contentRef.current) {
        spacerRef.current.style.height = contentRef.current.offsetHeight + 'px'
      }
      contentRef.current?.scroll({
        top: 9999999,
        behavior: 'instant' as ScrollBehavior,
      })
    })
    observer.observe(content, { childList: true })
    return () => {
      observer.disconnect()
    }
  }, [])
  return (
    <div
      ref={contentRef}
      className={cls('messages noscrollbar flex-1 max-h-64 transition-all duration-150 ease-out flex flex-col items-stretch overflow-y-auto', { active })}
      style={{
        WebkitMaskImage: 'linear-gradient(to top, black calc(100% - 10rem), black 10rem, transparent)',
        maskImage: 'linear-gradient(to top, black calc(100% - 10rem), black 10rem, transparent)',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div className='messages-spacer shrink-0' ref={spacerRef} />
      {msgs.map((msg) => (
        <Message key={(msg as ChatMessage & { id: string }).id} msg={msg as ChatMessage} />
      ))}
    </div>
  )
}

function Message({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className='message py-2 leading-relaxed text-base text-white'
      style={{
        paintOrder: 'stroke fill',
        WebkitTextStroke: '0.25rem rgba(0, 0, 0, 0.2)',
      }}
    >
      {msg.from && <span className='message-from mr-1'>[{msg.from}]</span>}
      <span className='message-body'>{msg.body}</span>
    </div>
  )
}

