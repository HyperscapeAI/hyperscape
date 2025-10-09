import { RefreshCwIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

import { buttons, propToLabel } from '../../extras/buttons'
import { World } from '../../World'
import { Interface } from '../../components/Interface'
import type { ControlAction } from '../../types'
import { EventType } from '../../types/events'
import { cls, isTouch } from '../utils'
import { AvatarPane } from './AvatarPane'
import { Chat } from './Chat'
import { ChevronDoubleUpIcon, HandIcon } from './Icons'
import { MouseLeftIcon } from './MouseLeftIcon'
import { MouseRightIcon } from './MouseRightIcon'
import { MouseWheelIcon } from './MouseWheelIcon'
import { Sidebar } from './Sidebar'
import { LoadingScreen } from './LoadingScreen'

// Type for icon components
type IconComponent = React.ComponentType<{ size?: number | string }>

export function CoreUI({ world }: { world: World }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [_player, setPlayer] = useState(() => world.entities.player)
  const [ui, setUI] = useState(world.ui?.state)
  const [_menu, setMenu] = useState(null)
  const [_settings, _setSettings] = useState(false)
  const [avatar, setAvatar] = useState<{ hash: string; file: File; url: string; onEquip: () => void; onPlace: () => void } | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [kicked, setKicked] = useState<string | null>(null)
    useEffect(() => {    
    // Create handlers with proper types
    const handleReady = () => setReady(true)
    const handlePlayerSpawned = () => {
      // Find and set the local player entity
      const player = world.entities?.player
      if (player) setPlayer(player)
    }
    const handleUIToggle = (data: { visible: boolean }) => {
      setUI(prev => prev ? { ...prev, visible: data.visible } : undefined)
    }
    const handleUIMenu = () => setMenu(null)
    const handleUIAvatar = (_data: { avatarData: unknown }) => {
      // Handle avatar data - for now just clear it
      setAvatar(null)
    }
    const handleUIKick = (data: { playerId: string; reason: string }) => {
      setKicked(data.reason || 'Kicked from server')
    }
    const handleDisconnected = () => setDisconnected(true)
    
    // Add listeners
    world.on(EventType.READY, handleReady)
    world.on(EventType.PLAYER_SPAWNED, handlePlayerSpawned)
    world.on(EventType.UI_TOGGLE, handleUIToggle)
    world.on(EventType.UI_MENU, handleUIMenu)
    world.on(EventType.UI_AVATAR, handleUIAvatar)
    world.on(EventType.UI_KICK, handleUIKick)
    world.on(EventType.NETWORK_DISCONNECTED, handleDisconnected)
    
    return () => {
      world.off(EventType.READY, handleReady)
      world.off(EventType.PLAYER_SPAWNED, handlePlayerSpawned)
      world.off(EventType.UI_TOGGLE, handleUIToggle)
      world.off(EventType.UI_MENU, handleUIMenu)
      world.off(EventType.UI_AVATAR, handleUIAvatar)
      world.off(EventType.UI_KICK, handleUIKick)
      world.off(EventType.NETWORK_DISCONNECTED, handleDisconnected)
    }
  }, [])

  // Event capture removed - was blocking UI interactions
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (world.prefs?.ui || 1)}px`
    function onChange(changes: { ui?: number }) {
      if (changes.ui) {
        document.documentElement.style.fontSize = `${16 * (world.prefs?.ui || 1)}px`
      }
    }
    world.prefs?.on('change', onChange)
    return () => {
      world.prefs?.off('change', onChange)
    }
  }, [])
  return (
    <div
      ref={ref}
      className='coreui absolute inset-0 overflow-hidden pointer-events-none'
    >
      {disconnected && <Disconnected />}
      {<Toast world={world} />}
      {ready && <ActionsBlock world={world} />}
      {ready && <Sidebar world={world} ui={ui || { active: false, pane: null }} />}
      {ready && <Chat world={world} />}
      {ready && <Interface world={world} />}
      {avatar && <AvatarPane key={avatar?.hash} world={world} info={avatar} />}
      {!ready && <LoadingScreen world={world} />}
      {kicked && <KickedOverlay code={kicked} />}
      {ready && isTouch && <TouchBtns world={world} />}
      <div id='core-ui-portal' />
    </div>
  )
}

// function Side({ world, menu }) {
//   const inputRef = useRef()
//   const [msg, setMsg] = useState('')
//   const [chat, setChat] = useState(false)
//   const [livekit, setLiveKit] = useState(() => world.livekit.status)
//   const [actions, setActions] = useState(() => world.prefs.actions)
//   useEffect(() => {
//     const onPrefsChange = changes => {
//       if (changes.actions) setActions(changes.actions.value)
//     }
//     const onLiveKitStatus = status => {
//       setLiveKit({ ...status })
//     }
//     world.livekit.on('status', onLiveKitStatus)
//     world.prefs?.on('change', onPrefsChange)
//     return () => {
//       world.prefs?.off('change', onPrefsChange)
//       world.livekit.off('status', onLiveKitStatus)
//     }
//   }, [])
//   useEffect(() => {
//     const control = world.controls.bind({ priority: ControlPriorities.CORE_UI })
//     control.slash.onPress = () => {
//       if (!chat) setChat(true)
//     }
//     control.enter.onPress = () => {
//       if (!chat) setChat(true)
//     }
//     control.mouseLeft.onPress = () => {
//       if (control.pointer.locked && chat) {
//         setChat(false)
//       }
//     }
//     return () => control?.release()
//   }
//   }, [chat])
//   useEffect(() => {
//     if (chat) {
//       inputRef.current.focus()
//     } else {
//       inputRef.current.blur()
//     }
//   }, [chat])
//   const send = async e => {
//     if (world.controls.pointer.locked) {
//       setTimeout(() => setChat(false), 10)
//     }
//     if (!msg) {
//       e.preventDefault()
//       return setChat(false)
//     }
//     setMsg('')
//     // check for commands
//     if (msg.startsWith('/')) {
//       world.chat.command(msg)
//       return
//     }
//     // otherwise post it
//     const player = world.entities.player
//     const data = {
//       id: uuid(),
//       from: player.data.name,
//       fromId: player.data.id,
//       body: msg,
//       createdAt: moment().toISOString(),
//     }
//     world.chat.add(data, true)
//     if (isTouch) {
//       e.target.blur()
//       // setTimeout(() => setChat(false), 10)
//     }
//   }
//   return (
//     <div
//       className='side'
//       css={css`
//         position: absolute;
//         top: calc(4rem + env(safe-area-inset-top));
//         left: calc(4rem + env(safe-area-inset-left));
//         bottom: calc(4rem + env(safe-area-inset-bottom));
//         right: calc(4rem + env(safe-area-inset-right));
//         display: flex;
//         align-items: stretch;
//         font-size: 1rem;
//         .side-content {
//           max-width: 21rem;
//           width: 100%;
//           display: flex;
//           flex-direction: column;
//           align-items: stretch;
//         }
//         .side-btns {
//           display: flex;
//           align-items: center;
//           margin-left: -0.5rem;
//         }
//         .side-btn {
//           pointer-events: auto;
//           /* margin-bottom: 1rem; */
//           width: 2.5rem;
//           height: 2.5rem;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           cursor: pointer;
//           svg {
//             filter: drop-shadow(0 0.0625rem 0.125rem rgba(0, 0, 0, 0.2));
//           }
//         }
//         .side-mid {
//           flex: 1;
//           display: flex;
//           flex-direction: column;
//           justify-content: center;
//         }
//         .side-chatbox {
//           margin-top: 0.5rem;
//           background: rgba(0, 0, 0, 0.3);
//           padding: 0.625rem;
//           display: flex;
//           align-items: center;
//           opacity: 0;
//           &.active {
//             opacity: 1;
//             pointer-events: auto;
//           }
//           &-input {
//             flex: 1;
//             /* paint-order: stroke fill; */
//             /* -webkit-text-stroke: 0.25rem rgba(0, 0, 0, 0.2); */
//             &::placeholder {
//               color: rgba(255, 255, 255, 0.5);
//             }
//           }
//         }
//         @media all and (max-width: 700px), (max-height: 700px) {
//           top: calc(1.5rem + env(safe-area-inset-top));
//           left: calc(1.5rem + env(safe-area-inset-left));
//           bottom: calc(1.5rem + env(safe-area-inset-bottom));
//           right: calc(1.5rem + env(safe-area-inset-right));
//         }
//       `}
//     >
//       <div className='side-content'>
//         <div className='side-btns'>
//           <div className='side-btn' onClick={() => world.ui.toggleMain()}>
//             <MenuIcon size='1.5rem' />
//           </div>
//           {isTouch && (
//             <div
//               className='side-btn'
//               onClick={() => {
//                 console.log('setChat', !chat)
//                 setChat(!chat)
//               }}
//             >
//               <ChatIcon size='1.5rem' />
//             </div>
//           )}
//           {livekit.connected && (
//             <div
//               className='side-btn'
//               onClick={() => {
//                 world.livekit.setMicrophoneEnabled()
//               }}
//             >
//               {livekit.mic ? <MicIcon size='1.5rem' /> : <MicOffIcon size='1.5rem' />}
//             </div>
//           )}
//           {world.xr?.supportsVR && (
//             <div
//               className='side-btn'
//               onClick={() => {
//                 world.xr?.enter()
//               }}
//             >
//               <VRIcon size='1.5rem' />
//             </div>
//           )}
//         </div>
//         {menu?.type === 'main' && <MenuMain world={world} />}
//         {menu?.type === 'app' && <MenuApp key={menu.app.data.id} world={world} app={menu.app} blur={menu.blur} />}
//         <div className='side-mid'>{!menu && !isTouch && actions && <Actions world={world} />}</div>
//         {isTouch && !chat && <MiniMessages world={world} />}
//         {(isTouch ? chat : true) && <Messages world={world} active={chat || menu} />}
//         <label className={cls('side-chatbox', { active: chat })}>
//           <input
//             ref={inputRef}
//             className='side-chatbox-input'
//             type='text'
//             placeholder='Say something...'
//             value={msg}
//             onChange={e => setMsg(e.target.value)}
//             onKeyDown={e => {
//               if (e.code === 'Escape') {
//                 setChat(false)
//               }
//               // meta quest 3 isn't spec complaint and instead has e.code = '' and e.key = 'Enter'
//               // spec says e.code should be a key code and e.key should be the text output of the key eg 'b', 'B', and '\n'
//               if (e.code === 'Enter' || e.key === 'Enter') {
//                 send(e)
//               }
//             }}
//             onBlur={e => {
//               if (!isTouch) {
//                 setChat(false)
//               }
//             }}
//           />
//         </label>
//       </div>
//     </div>
//   )
// }

function Disconnected() {
  // useEffect(() => {
  //   document.body.style.filter = 'grayscale(100%)'
  //   return () => {
  //     document.body.style.filter = null
  //   }
  // }, [])
  return (
    <>
      <div
        className="fixed top-0 left-0 w-full h-full backdrop-grayscale pointer-events-none z-[9999] animate-[fadeIn_3s_forwards]"
      />
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
      <div
        className="disconnected-btn pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-dark-bg border border-dark-border backdrop-blur-md rounded-2xl h-11 px-4 flex items-center cursor-pointer"
        onClick={() => window.location.reload()}
      >
        <RefreshCwIcon size={18} />
        <span className="ml-2">Reconnect</span>
      </div>
    </>
  )
}


const kickMessages: Record<string, string> = {
  duplicate_user: 'Player already active on another device or window.',
  player_limit: 'Player limit reached.',
  unknown: 'You were kicked.',
}
function KickedOverlay({ code }: { code: string }) {
  return (
    <div
      className="absolute inset-0 bg-black flex items-center justify-center pointer-events-auto"
    >
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .kicked-overlay svg {
          animation: spin 1s linear infinite;
        }
      `}</style>
      <div className="kicked-overlay">{kickMessages[code] || kickMessages.unknown}</div>
    </div>
  )
}

function ActionsBlock({ world }: { world: World }) {
  const [showActions, setShowActions] = useState(() => world.prefs?.actions)
  useEffect(() => {
    const onPrefsChange = (changes: Record<string, { value: unknown }>) => {
      if (changes.actions) setShowActions(changes.actions.value as boolean)
    }
    world.prefs?.on('change', onPrefsChange)
    return () => {
      world.prefs?.off('change', onPrefsChange)
    }
  }, [])
  if (isTouch) return null
  if (!showActions) return null
  return (
    <div
      className="actions-block absolute flex flex-col items-center"
      style={{
        top: 'calc(2rem + env(safe-area-inset-top))',
        left: 'calc(2rem + env(safe-area-inset-left))',
        bottom: 'calc(2rem + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        @media all and (max-width: 1200px) {
          .actions-block {
            top: calc(1rem + env(safe-area-inset-top)) !important;
            left: calc(1rem + env(safe-area-inset-left)) !important;
            bottom: calc(1rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
      <Actions world={world} />
    </div>
  )
}

function Actions({ world }: { world: World }) {
  const [actions, setActions] = useState(() => world.controls?.actions || [])
  useEffect(() => {
    const handleActions = (data: unknown) => {
      if (Array.isArray(data)) {
        setActions(data)
      }
    }
    world.on(EventType.UI_ACTIONS_UPDATE, handleActions)
    return () => {
      world.off(EventType.UI_ACTIONS_UPDATE, handleActions)
    }
  }, [])
  return (
    <div
      className='actions flex-1 flex flex-col justify-center'
    >
      {actions.map((action) => (
        <div className='actions-item flex items-center mb-2' key={action.id}>
          <div className='actions-item-icon'>{getActionIcon(action)}</div>
          <div 
            className='actions-item-label ml-2.5'
            style={{
              paintOrder: 'stroke fill',
              WebkitTextStroke: '0.25rem rgba(0, 0, 0, 0.2)',
            }}
          >{(action as ControlAction & { label?: string }).label}</div>
        </div>
      ))}
    </div>
  )
}

function getActionIcon(action: ControlAction & { btn?: string; label?: string }) {
  if (action.type === 'custom') {
    return <ActionPill label={action.btn || ''} />
  }
  if (action.type === 'controlLeft') {
    return <ActionPill label='Ctrl' />
  }
  if (action.type === 'mouseLeft') {
    return <ActionIcon icon={MouseLeftIcon} />
  }
  if (action.type === 'mouseRight') {
    return <ActionIcon icon={MouseRightIcon} />
  }
  if (action.type === 'mouseWheel') {
    return <ActionIcon icon={MouseWheelIcon} />
  }
  if (buttons.has(action.type)) {
    return <ActionPill label={propToLabel[action.type]} />
  }
  return <ActionPill label='?' />
}

function ActionPill({ label }: { label: string }) {
  return (
    <div
      className='actionpill border border-white rounded bg-black/10 px-1.5 py-1 text-[0.875em] shadow-md'
      style={{
        paintOrder: 'stroke fill',
        WebkitTextStroke: '0.25rem rgba(0, 0, 0, 0.2)',
      }}
    >
      {label}
    </div>
  )
}

function ActionIcon({ icon }: { icon: IconComponent }) {
  const Icon = icon;
  return (
    <div className='actionicon leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'>
      <Icon size='1.5rem' />
    </div>
  )
}


function Toast({ world }: { world: World }) {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null)
  useEffect(() => {
    let ids = 0
    const onToast = (data: { message: string; type: 'info' | 'warning' | 'error' | 'success' }) => {
      const text = data.message || String(data)
      setMsg({ text, id: ++ids })
    }
    world.on(EventType.UI_TOAST, onToast)
    return () => {
      world.off(EventType.UI_TOAST, onToast)
    }
  }, [])
  if (!msg) return null
  return (
    <div
      className='toast absolute left-0 right-0 flex justify-center'
      style={{
        top: 'calc(50% - 4.375rem)',
      }}
    >
      <style>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .toast-msg {
          height: 2.875rem;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 1rem;
          background: rgba(11, 10, 21, 0.85);
          border: 0.0625rem solid #2a2b39;
          backdrop-filter: blur(5px);
          border-radius: 1.4375rem;
          opacity: 0;
          transform: translateY(0.625rem) scale(0.9);
          transition: all 0.1s ease-in-out;
        }
        .toast-msg.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          animation: toastIn 0.1s ease-in-out;
        }
      `}</style>
      {msg && <ToastMsg key={msg.id} text={msg.text} />}
    </div>
  )
}

function ToastMsg({ text }: { text: string }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setTimeout(() => setVisible(false), 1000)
  }, [])
  return <div className={cls('toast-msg', { visible })}>{text}</div>
}

function TouchBtns({ world }: { world: World }) {
  const [isAction, setIsAction] = useState(() => {
    const prefs = world.prefs as { touchAction?: boolean };
    return prefs?.touchAction;
  })
  useEffect(() => {
    function onChange(isAction: boolean) {
      setIsAction(isAction)
    }
    world.prefs?.on('touchAction', onChange)
    return () => {
      world.prefs?.off('touchAction', onChange)
    }
  }, [])
  return (
    <div
      className='touchbtns absolute flex flex-col items-center gap-2'
      style={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        right: 'calc(1rem + env(safe-area-inset-right))',
      }}
    >
      <style>{`
        .touchbtns-btn {
          pointer-events: auto;
          width: 3.5rem;
          height: 3.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(11, 10, 21, 0.85);
          border: 0.0625rem solid #2a2b39;
          backdrop-filter: blur(5px);
          border-radius: 1rem;
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.2);
          cursor: pointer;
        }
        .touchbtns-btn:active {
          transform: scale(0.95);
        }
        .touchbtns-btn.action {
          background: #ff4d4d;
          border-color: #ff6666;
        }
      `}</style>
      {isAction && (
        <div
          className='touchbtns-btn action'
          onClick={() => {
            (world.controls as { action?: { onPress: () => void } })?.action?.onPress()
          }}
        >
          <HandIcon size={24} />
        </div>
      )}
    </div>
  )
}
