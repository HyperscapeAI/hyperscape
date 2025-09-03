// import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Curve } from '../../extras/Curve'
import { downloadFile } from '../../extras/downloadFile'
import type { LoadingFile } from '../../types/client-types'
import type {
  FieldBtnProps,
  FieldCurveProps,
  FieldFileProps,
  FieldNumberProps,
  FieldRangeProps,
  FieldSwitchProps,
  FieldTextProps,
  FieldTextareaProps,
  FieldToggleProps,
  FieldVec3Props,
  SwitchOption
} from '../../types/ui-types'
import { hashFile } from '../../utils-client'
import { CurvePane } from './CurvePane'
import { CurvePreview } from './CurvePreview'
import { HintContext } from './Hint'
import { Portal } from './Portal'
import { useUpdate } from './useUpdate'



export function FieldText({ label, hint, placeholder, value, onChange }: FieldTextProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  return (
    <label
      className='field field-text'
      style={{
        display: 'block',
        margin: '0 0 0.5rem',
        position: 'relative',
      }}
      onPointerEnter={() => hint && setHint(hint)}
      onPointerLeave={() => hint && setHint(null)}
    >
      <div className='field-label' style={{
        fontSize: '0.8125rem',
        margin: '0 0 0.375rem',
        opacity: 0.7,
        fontWeight: 500,
      }}>{label}</div>
      <input
        type='text'
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          fontSize: '0.875rem',
          padding: '0.375rem 0.5rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '0.25rem',
          color: 'white',
        }}
        onKeyDown={e => {
          if (e.code === 'Escape') {
            const target = e.target as HTMLInputElement
            target.blur()
          }
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLInputElement).style.background = 'rgba(255, 255, 255, 0.1)'
          ;(e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.2)'
        }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.target) {
            (e.target as HTMLInputElement).style.background = 'rgba(255, 255, 255, 0.05)'
            ;(e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          }
        }}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.background = 'rgba(255, 255, 255, 0.1)'
          ;(e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.3)'
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.background = 'rgba(255, 255, 255, 0.05)'
          ;(e.target as HTMLInputElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          // ...
        }}
      />
    </label>
  )
}



export function FieldTextarea({ label, hint, placeholder, value, onChange }: FieldTextareaProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    function update() {
      if (!textarea) return
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
    update()
    textarea.addEventListener('input', update)
    return () => {
      textarea.removeEventListener('input', update)
    }
  }, [])
  return (
    <label
      className='field field-textarea'
      style={{
        display: 'block',
        margin: '0 0 0.5rem',
        position: 'relative',
      }}
      onPointerEnter={() => hint && setHint(hint)}
      onPointerLeave={() => hint && setHint(null)}
    >
      <div className='field-label' style={{
        fontSize: '0.8125rem',
        margin: '0 0 0.375rem',
        opacity: 0.7,
        fontWeight: 500,
      }}>{label}</div>
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          fontSize: '0.875rem',
          padding: '0.375rem 0.5rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '0.25rem',
          resize: 'none',
          minHeight: '3rem',
          color: 'white',
        }}
        onKeyDown={e => {
          if (e.code === 'Escape') {
            const target = e.target as HTMLTextAreaElement
            target.blur()
          }
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLTextAreaElement).style.background = 'rgba(255, 255, 255, 0.1)'
          ;(e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255, 255, 255, 0.2)'
        }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.target) {
            (e.target as HTMLTextAreaElement).style.background = 'rgba(255, 255, 255, 0.05)'
            ;(e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          }
        }}
        onFocus={(e) => {
          (e.target as HTMLTextAreaElement).style.background = 'rgba(255, 255, 255, 0.1)'
          ;(e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255, 255, 255, 0.3)'
        }}
        onBlur={(e) => {
          (e.target as HTMLTextAreaElement).style.background = 'rgba(255, 255, 255, 0.05)'
          ;(e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          // ...
        }}
      />
    </label>
  )
}



export function FieldSwitch({ label, hint, options, value, onChange }: FieldSwitchProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const idx = options.findIndex((o: SwitchOption) => o.value === value)
  const prev = () => {
    const newIdx = idx - 1
    if (newIdx < 0) {
      onChange(options[options.length - 1].value)
    } else {
      onChange(options[newIdx].value)
    }
  }
  const next = () => {
    const newIdx = idx + 1
    if (newIdx >= options.length) {
      onChange(options[0].value)
    } else {
      onChange(options[newIdx].value)
    }
  }
  return (
    <div
      className='field field-switch'
      style={{
        margin: '0 0 0.5rem',
      }}
      onPointerEnter={() => hint && setHint(hint)}
      onPointerLeave={() => hint && setHint(null)}
    >
      <div className='field-label' style={{
        fontSize: '0.8125rem',
        margin: '0 0 0.375rem',
        opacity: 0.7,
        fontWeight: 500,
      }}>{label}</div>
      <div className='field-switch-control' style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.875rem',
      }}>
        <div
          className='field-switch-btn'
          style={{
            width: '1.5rem',
            height: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
          onClick={prev}
          onMouseEnter={(e) => {
            (e.target as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.1)'
            ;(e.target as HTMLDivElement).style.borderColor = 'rgba(255, 255, 255, 0.2)'
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.05)'
            ;(e.target as HTMLDivElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          }}
        >
          ‹
        </div>
        <div className='field-switch-value' style={{
          flex: 1,
          textAlign: 'center',
        }}>{options[idx]?.label || ''}</div>
        <div
          className='field-switch-btn'
          style={{
            width: '1.5rem',
            height: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
          onClick={next}
          onMouseEnter={(e) => {
            (e.target as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.1)'
            ;(e.target as HTMLDivElement).style.borderColor = 'rgba(255, 255, 255, 0.2)'
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.05)'
            ;(e.target as HTMLDivElement).style.borderColor = 'rgba(255, 255, 255, 0.1)'
          }}
        >
          ›
        </div>
      </div>
    </div>
  )
}



export function FieldToggle({ label, hint, trueLabel = 'Yes', falseLabel = 'No', value, onChange }: FieldToggleProps) {
  return (
    <FieldSwitch
      label={label}
      hint={hint}
      options={[
        { label: falseLabel, value: false },
        { label: trueLabel, value: true },
      ]}
      value={value}
      onChange={(val: unknown) => onChange(val as boolean)}
    />
  )
}



export function FieldRange({ label, hint, min = 0, max = 1, step = 0.05, instant, value, onChange }: FieldRangeProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const trackRef = useRef<HTMLDivElement | null>(null)
  if (value === undefined || value === null) {
    value = 0
  }
  const [local, setLocal] = useState(value)
  const [sliding, setSliding] = useState(false)
  useEffect(() => {
    if (!sliding && local !== value) setLocal(value)
  }, [sliding, value, local])
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    function calculateValueFromPointer(e: PointerEvent, trackElement: HTMLElement) {
      const rect = trackElement.getBoundingClientRect()
      const position = (e.clientX - rect.left) / rect.width
      const rawValue = min + position * (max - min)
      // Round to nearest step
      const steppedValue = Math.round(rawValue / step) * step
      // Clamp between min and max
      return Math.max(min, Math.min(max, steppedValue))
    }
    let sliding = false
    function onPointerDown(e: PointerEvent) {
      sliding = true
      setSliding(true)
      const newValue = calculateValueFromPointer(e, e.currentTarget as HTMLElement)
      setLocal(newValue)
      if (instant) onChange(newValue)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    function onPointerMove(e: PointerEvent) {
      if (!sliding) return
      const newValue = calculateValueFromPointer(e, e.currentTarget as HTMLElement)
      setLocal(newValue)
      if (instant) onChange(newValue)
    }
    function onPointerUp(e: PointerEvent) {
      if (!sliding) return
      sliding = false
      setSliding(false)
      const finalValue = calculateValueFromPointer(e, e.currentTarget as HTMLElement)
      setLocal(finalValue)
      onChange(finalValue)
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    track.addEventListener('pointerdown', onPointerDown)
    track.addEventListener('pointermove', onPointerMove)
    track.addEventListener('pointerup', onPointerUp)
    return () => {
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
    }
  }, [min, max, step, instant, onChange])
  const barWidthPercentage = ((local - min) / (max - min)) * 100 + ''
  const text = useMemo(() => {
    const num = local
    const decimalDigits = (num.toString().split('.')[1] || '').length
    if (decimalDigits <= 2) {
      return num.toString()
    }
    return num.toFixed(2)
  }, [local])
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <div
      className='fieldrange'
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2.5rem',
        padding: '0 1rem',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
      onPointerEnter={() => {
        hint && setHint(hint)
        setIsHovered(true)
      }}
      onPointerLeave={() => {
        hint && setHint(null)
        setIsHovered(false)
      }}
    >
      <div className='fieldrange-label' style={{
        flex: 1,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.6)',
        paddingRight: '1rem',
      }}>{label}</div>
      <div className='fieldrange-text' style={{
        fontSize: '0.7rem',
        fontWeight: 500,
        color: 'rgba(255, 255, 255, 0.6)',
        marginRight: '0.5rem',
        opacity: isHovered ? 1 : 0,
      }}>{text}</div>
      <div className='fieldrange-track' ref={trackRef} style={{
        width: '7rem',
        flexShrink: 0,
        height: '0.5rem',
        borderRadius: '0.1rem',
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
      }}>
        <div className='fieldrange-bar' style={{
          backgroundColor: 'white',
          borderRadius: '0.1rem',
          width: `${barWidthPercentage}%`,
        }} />
      </div>
    </div>
  )
}

export const fileKinds = {
  avatar: {
    type: 'avatar',
    accept: '.vrm',
    exts: ['vrm'],
    placeholder: 'vrm',
  },
  emote: {
    type: 'emote',
    accept: '.glb',
    exts: ['glb'],
    placeholder: 'glb',
  },
  model: {
    type: 'model',
    accept: '.glb',
    exts: ['glb'],
    placeholder: 'glb',
  },
  texture: {
    type: 'texture',
    accept: '.jpg,.jpeg,.png,.webp',
    exts: ['jpg', 'jpeg', 'png', 'webp'],
    placeholder: 'jpg,png,webp',
  },
  image: {
    type: 'image',
    accept: '.jpg,.jpeg,.png,.webp',
    exts: ['jpg', 'jpeg', 'png', 'webp'],
    placeholder: 'jpg,png,webp',
  },
  video: {
    type: 'video',
    accept: '.mp4',
    exts: ['mp4'],
    placeholder: 'mp4',
  },
  hdr: {
    type: 'hdr',
    accept: '.hdr',
    exts: ['hdr'],
    placeholder: 'hdr',
  },
  audio: {
    type: 'audio',
    accept: '.mp3',
    exts: ['mp3'],
    placeholder: 'mp3',
  },
}



export function FieldFile({ world, label, hint, kind: kindName, value, onChange }: FieldFileProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const nRef = useRef(0)
  const update = useUpdate()
  const [loading, setLoading] = useState<LoadingFile | null>(null)
  const kind = fileKinds[kindName]
  if (!kind) return null // invalid?
  const set = async e => {
    // trigger input rebuild
    const n = ++nRef.current
    update()
    // get file
    const file = e.target.files[0]
    if (!file) return
    // check ext
    const ext = file.name.split('.').pop().toLowerCase()
    if (!kind.exts.includes(ext)) {
      return console.error(`attempted invalid file extension for ${String(kindName)}: ${ext}`)
    }
    // immutable hash the file
    const hash = await hashFile(file)
    // use hash as glb filename
    const filename = `${hash}.${ext}`
    // canonical url to this file
    const url = `asset://${filename}`
    // show loading
    const newValue: LoadingFile = {
      type: kind.type,
      name: file.name,
      url,
    }
    setLoading(newValue)
    // upload file
    if (!world.network || typeof (world.network as { upload?: (file: File) => Promise<unknown> }).upload !== 'function') {
      console.error('Upload functionality not available')
      setLoading(null)
      return
    }
    await (world.network as { upload: (file: File) => Promise<unknown> }).upload(file)
    // ignore if new value/upload
    if (nRef.current !== n) return
    // cache file locally so this client can insta-load it
    if (world.loader) {
      world.loader.insert(kind.type, url, file)
    }
    // apply!
    setLoading(null)
    onChange(newValue)
  }
  const remove = e => {
    e.preventDefault()
    e.stopPropagation()
    onChange(null)
  }
  const handleDownload = e => {
    const fileValue = value as { url?: string; name?: string } | null
    if (e.shiftKey && fileValue?.url && world.loader) {
      e.preventDefault()
      const file = world.loader.getFile(fileValue.url, fileValue.name)
      if (!file) return
      downloadFile(file)
    }
  }
  const n = nRef.current
  const fileValue = value as { name?: string } | null
  const name = loading?.name || fileValue?.name
  return (
    <label
      className='fieldfile'
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2.5rem',
        padding: '0 1rem',
        overflow: 'hidden',
      }}
      onPointerEnter={() => hint && setHint(hint)}
      onPointerLeave={() => hint && setHint(null)}
      onClick={handleDownload}
    >
      <div className='fieldfile-label' style={{
        flex: 1,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        paddingRight: '1rem',
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.6)',
      }}>{label}</div>
      {!value && !loading && <div className='fieldfile-placeholder' style={{
        color: 'rgba(255, 255, 255, 0.3)',
      }}>{kind.placeholder}</div>}
      {name && <div className='fieldfile-name' style={{
        fontSize: '0.9375rem',
        textAlign: 'right',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        maxWidth: '9rem',
      }}>{name}</div>}
      {!!value && !loading && (
                 <div 
           className='fieldfile-x' 
           style={{
             lineHeight: 0,
             margin: '0 -0.2rem 0 0.3rem',
             color: 'rgba(255, 255, 255, 0.3)',
           }} 
           onClick={remove}
           onMouseEnter={(e) => {
             (e.target as HTMLDivElement).style.color = 'white'
           }}
           onMouseLeave={(e) => {
             (e.target as HTMLDivElement).style.color = 'rgba(255, 255, 255, 0.3)'
           }}
         >
          ×
        </div>
      )}
      {loading && (
        <div className='fieldfile-loading' style={{
          margin: '0 -0.1rem 0 0.3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          ⟳
        </div>
      )}
      <input key={n} type='file' onChange={set} accept={kind.accept} />
    </label>
  )
}



export function FieldNumber({
  label,
  hint,
  dp = 0,
  min = -Infinity,
  max = Infinity,
  step = 1,
  bigStep = 2,
  value,
  onChange,
}: FieldNumberProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  if (value === undefined || value === null) {
    value = 0
  }
  const [local, setLocal] = useState(value.toFixed(dp))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused && local !== value.toFixed(dp)) setLocal(value.toFixed(dp))
  }, [focused, value, local, dp])
  const setTo = (str: string) => {
    // try parse math
    let num
    try {
      num = (0, eval)(str)
      if (typeof num !== 'number') {
        throw new Error('input number parse fail')
      }
    } catch (err) {
      console.error(err)
      num = value // revert back to original
    }
    if (num < min || num > max) {
      num = value
    }
    setLocal(num.toFixed(dp))
    onChange(+num.toFixed(dp))
  }
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <label
      className='fieldnumber'
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2.5rem',
        padding: '0 1rem',
        cursor: 'text',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
      onPointerEnter={() => {
        hint && setHint(hint)
        setIsHovered(true)
      }}
      onPointerLeave={() => {
        hint && setHint(null)
        setIsHovered(false)
      }}
    >
      <div className='fieldnumber-label' style={{
        width: '9.4rem',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.6)',
      }}>{label}</div>
      <div className='fieldnumber-field' style={{
        flex: 1,
      }}>
        <input
          type='text'
          value={local}
          onChange={e => setLocal(e.target.value)}
          style={{
            fontSize: '0.9375rem',
            height: '1rem',
            textAlign: 'right',
            overflow: 'hidden',
            cursor: 'inherit',
            background: 'transparent',
            border: 'none',
            color: 'white',
            width: '100%',
          }}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.code === 'ArrowUp') {
              const amount = e.shiftKey ? bigStep : step
              setTo((value + amount).toString())
            }
            if (e.code === 'ArrowDown') {
              const amount = e.shiftKey ? bigStep : step
              setTo((value - amount).toString())
            }
          }}
          onFocus={e => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={_e => {
            setFocused(false)
            // if blank, set back to original
            if (local === '') {
              setLocal(value.toFixed(dp))
              return
            }
            // otherwise run through pipeline
            setTo(local)
          }}
        />
      </div>
    </label>
  )
}



export function FieldVec3({
  label,
  hint,
  dp = 0,
  min = -Infinity,
  max = Infinity,
  step = 1,
  bigStep = 2,
  value,
  onChange,
}: FieldVec3Props) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const valueX = value?.[0] || 0
  const valueY = value?.[1] || 0
  const valueZ = value?.[2] || 0
  const [localX, setLocalX] = useState(valueX.toFixed(dp))
  const [localY, setLocalY] = useState(valueY.toFixed(dp))
  const [localZ, setLocalZ] = useState(valueZ.toFixed(dp))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) {
      if (localX !== valueX.toFixed(dp)) setLocalX(valueX.toFixed(dp))
      if (localY !== valueY.toFixed(dp)) setLocalY(valueY.toFixed(dp))
      if (localZ !== valueZ.toFixed(dp)) setLocalZ(valueZ.toFixed(dp))
    }
  }, [focused, valueX, valueY, valueZ, localX, localY, localZ, dp])
  const parseStr = (str: string) => {
    // try parse math
    let num
    try {
      num = (0, eval)(str)
      if (typeof num !== 'number') {
        throw new Error('input number parse fail')
      }
    } catch (err) {
      console.error(err)
      num = 0 // default to 0
    }
    if (num < min || num > max) {
      num = 0
    }
    return num
  }
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <label
      className='fieldvec3'
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2.5rem',
        padding: '0 1rem',
        cursor: 'text',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
      onPointerEnter={() => {
        hint && setHint(hint)
        setIsHovered(true)
      }}
      onPointerLeave={() => {
        hint && setHint(null)
        setIsHovered(false)
      }}
    >
      <div className='fieldvec3-label' style={{
        width: '9.4rem',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.6)',
      }}>{label}</div>
      <div className='fieldvec3-field' style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <input
          type='text'
          value={localX}
          onChange={e => setLocalX(e.target.value)}
          style={{
            fontSize: '0.9375rem',
            height: '1rem',
            textAlign: 'right',
            overflow: 'hidden',
            cursor: 'inherit',
            background: 'transparent',
            border: 'none',
            color: 'white',
            flex: 1,
          }}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.code === 'ArrowUp') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueX + amount).toString())
              setLocalX(num.toFixed(dp))
              onChange([+num.toFixed(dp), valueY, valueZ])
            }
            if (e.code === 'ArrowDown') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueX - amount).toString())
              setLocalX(num.toFixed(dp))
              onChange([+num.toFixed(dp), valueY, valueZ])
            }
          }}
          onFocus={e => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={_e => {
            setFocused(false)
            // if blank, set back to original
            if (localX === '') {
              setLocalX(valueX.toFixed(dp))
              return
            }
            // otherwise run through pipeline
            const num = parseStr(localX)
            setLocalX(num.toFixed(dp))
            onChange([+num.toFixed(dp), valueY, valueZ])
          }}
        />
        <input
          type='text'
          value={localY}
          onChange={e => setLocalY(e.target.value)}
          style={{
            fontSize: '0.9375rem',
            height: '1rem',
            textAlign: 'right',
            overflow: 'hidden',
            cursor: 'inherit',
            background: 'transparent',
            border: 'none',
            color: 'white',
            flex: 1,
          }}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.code === 'ArrowUp') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueY + amount).toString())
              setLocalY(num.toFixed(dp))
              onChange([valueX, +num.toFixed(dp), valueZ])
            }
            if (e.code === 'ArrowDown') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueY - amount).toString())
              setLocalY(num.toFixed(dp))
              onChange([valueX, +num.toFixed(dp), valueZ])
            }
          }}
          onFocus={e => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={_e => {
            setFocused(false)
            // if blank, set back to original
            if (localY === '') {
              setLocalY(valueY.toFixed(dp))
              return
            }
            // otherwise run through pipeline
            const num = parseStr(localY)
            setLocalY(num.toFixed(dp))
            onChange([valueX, +num.toFixed(dp), valueZ])
          }}
        />
        <input
          type='text'
          value={localZ}
          onChange={e => setLocalZ(e.target.value)}
          style={{
            fontSize: '0.9375rem',
            height: '1rem',
            textAlign: 'right',
            overflow: 'hidden',
            cursor: 'inherit',
            background: 'transparent',
            border: 'none',
            color: 'white',
            flex: 1,
          }}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.code === 'ArrowUp') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueZ + amount).toString())
              setLocalZ(num.toFixed(dp))
              onChange([valueX, valueY, +num.toFixed(dp)])
            }
            if (e.code === 'ArrowDown') {
              const amount = e.shiftKey ? bigStep : step
              const num = parseStr((valueZ - amount).toString())
              setLocalZ(num.toFixed(dp))
              onChange([valueX, valueY, +num.toFixed(dp)])
            }
          }}
          onFocus={e => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={_e => {
            setFocused(false)
            // if blank, set back to original
            if (localZ === '') {
              setLocalZ(valueZ.toFixed(dp))
              return
            }
            // otherwise run through pipeline
            const num = parseStr(localZ)
            setLocalZ(num.toFixed(dp))
            onChange([valueX, valueY, +num.toFixed(dp)])
          }}
        />
      </div>
    </label>
  )
}



export function FieldCurve({ label, hint, x, xRange, y, yMin, yMax, value, onChange }: FieldCurveProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const curve = useMemo(() => new Curve().deserialize(value || '0,0.5,0,0|1,0.5,0,0'), [value])
  const [edit, setEdit] = useState<Curve | false>(false)
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <div
      className='fieldcurve'
      style={{
        cursor: 'pointer',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
    >
      <div
        className='fieldcurve-control'
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '2.5rem',
          padding: '0 1rem',
        }}
        onClick={() => {
          if (edit) {
            setEdit(false)
          } else {
            setEdit(curve.clone())
          }
        }}
        onPointerEnter={() => {
          hint && setHint(hint)
          setIsHovered(true)
        }}
        onPointerLeave={() => {
          hint && setHint(null)
          setIsHovered(false)
        }}
      >
        <div className='fieldcurve-label' style={{
          flex: 1,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          paddingRight: '1rem',
          fontSize: '0.9375rem',
          color: 'rgba(255, 255, 255, 0.6)',
        }}>{label}</div>
        <div className='fieldcurve-curve' style={{
          width: '6rem',
          height: '1.2rem',
          position: 'relative',
        }}>
          <CurvePreview curve={curve} yMin={yMin} yMax={yMax} />
        </div>
      </div>
      {edit && (
        <Portal>
          <CurvePane
            curve={edit as Curve}
            xLabel={x}
            xRange={[0, xRange || 1]}
            yLabel={y}
            yMin={yMin}
            yMax={yMax}
            onCommit={() => {
              onChange((edit as Curve).serialize())
              setEdit(false)
            }}
            onCancel={() => {
              setEdit(false)
            }}
          />
        </Portal>
      )}
    </div>
  )
}



export function FieldBtn({ label, note, hint, nav, onClick }: FieldBtnProps) {
  const hintContext = useContext(HintContext)
  if (!hintContext) {
    throw new Error('HintContext not found')
  }
  const setHint = hintContext.setHint
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <div
      className='fieldbtn'
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2.5rem',
        padding: '0 1rem',
        cursor: 'pointer',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
      }}
      onPointerEnter={() => {
        hint && setHint(hint)
        setIsHovered(true)
      }}
      onPointerLeave={() => {
        hint && setHint(null)
        setIsHovered(false)
      }}
      onClick={onClick}
    >
      <div className='fieldbtn-label' style={{
        flex: 1,
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.6)',
      }}>{label}</div>
      {note && <div className='fieldbtn-note' style={{
        fontSize: '0.9375rem',
        color: 'rgba(255, 255, 255, 0.4)',
      }}>{note}</div>}
      {nav && <span style={{ fontSize: '1.5rem' }}>›</span>}
    </div>
  )
}
