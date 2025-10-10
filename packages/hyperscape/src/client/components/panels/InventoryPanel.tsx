import React, { useEffect, useRef, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { InventoryItem } from '../../../types/core'

interface InventoryPanelProps {
  items: InventoryItem[]
  coins: number
  onItemMove?: (fromIndex: number, toIndex: number) => void
  onItemUse?: (item: InventoryItem, index: number) => void
  onItemEquip?: (item: InventoryItem) => void
}

interface DraggableItemProps {
  item: InventoryItem | null
  index: number
  size: number
}

function DraggableInventorySlot({ item, index, size }: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `inventory-${index}`, data: { item, index } })

  const style = {
    width: size,
    height: size,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  // Debug: log what we're trying to render
  if (item) {
    console.log(`[InventorySlot ${index}] Rendering item:`, item.itemId, 'qty:', item.quantity);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-black/35 border border-white/[0.08] rounded flex flex-col items-center justify-center text-[10px] text-white ${item ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      title={item ? `${item.itemId} (${item.quantity})` : 'Empty slot'}
    >
      {item ? (
        <>
          <div className="text-[10px]">{item.itemId.substring(0, 3)}</div>
          {item.quantity > 1 && <div className="text-[8px] text-yellow-400">{item.quantity}</div>}
        </>
      ) : ''}
    </div>
  )
}

export function InventoryPanel({ items, coins, onItemMove, onItemUse, onItemEquip }: InventoryPanelProps) {
  console.log('[InventoryPanel] Rendered with', items?.length || 0, 'items, coins:', coins);
  
  const slots = Array(28).fill(null)
  items.forEach((item, i) => { if (i < 28) slots[i] = item })
  
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<number>(40)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [slotItems, setSlotItems] = useState(slots)

  useEffect(() => {
    console.log('[InventoryPanel] items prop changed, updating slots. New item count:', items?.length || 0);
    const newSlots = Array(28).fill(null)
    items.forEach((item, i) => { 
      if (i < 28) {
        newSlots[i] = item;
        console.log(`[InventoryPanel] Slot ${i}:`, item?.itemId || 'empty');
      }
    })
    setSlotItems(newSlots)
  }, [items])

  useEffect(() => {
    const compute = () => {
      const grid = gridRef.current
      if (!grid) return
      const parent = grid.parentElement as HTMLElement | null
      const columns = 4
      const rows = 7
      const gap = 8
      const widthAvailable = (parent?.clientWidth || grid.clientWidth)
      const byWidth = Math.floor((widthAvailable - gap * (columns - 1)) / columns)
      const next = Math.max(20, byWidth)
      setSize(next)
    }
    compute()
    window.addEventListener('resize', compute)
    const id = window.setInterval(compute, 500)
    return () => { window.removeEventListener('resize', compute); window.clearInterval(id) }
  }, [])

  const rows = 7
  const columns = 4
  const gap = 8
  const gridHeight = size * rows + gap * (rows - 1)

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const fromIndex = parseInt((active.id as string).split('-')[1])
    const toIndex = parseInt((over.id as string).split('-')[1])

    const newSlots = [...slotItems]
    const [movedItem] = newSlots.splice(fromIndex, 1)
    newSlots.splice(toIndex, 0, movedItem)
    setSlotItems(newSlots)

    if (onItemMove) {
      onItemMove(fromIndex, toIndex)
    }
  }

  const activeItem = activeId ? slotItems[parseInt(activeId.split('-')[1])] : null

  return (
    <DndContext 
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="w-full flex flex-col box-border" style={{ height: gridHeight + 44 }}>
        <SortableContext items={slotItems.map((_, i) => `inventory-${i}`)} strategy={rectSortingStrategy}>
          <div 
            ref={gridRef} 
            className="mx-auto grid grid-flow-row"
            style={{ 
              gridTemplateColumns: `repeat(${columns}, ${size}px)`, 
              gridTemplateRows: `repeat(${rows}, ${size}px)`,
              gap: gap, 
              width: (size * columns + gap * (columns - 1)) 
            }}
          >
            {slotItems.map((item, i) => (
              <DraggableInventorySlot
                key={i}
                item={item}
                index={i}
                size={size}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem ? (
            <div 
              className="bg-black/35 border border-white/[0.08] rounded flex items-center justify-center text-[10px]"
              style={{ width: size, height: size }}
            >
              {activeItem.itemId.substring(0, 3)}
            </div>
          ) : null}
        </DragOverlay>

        <div className="mt-2.5 flex justify-between items-center bg-black/35 border border-white/[0.08] rounded-md py-2 px-2.5 text-gray-200 text-[13px]">
          <span>Coins</span>
          <span className="text-yellow-400 font-bold">{coins.toLocaleString()} gp</span>
        </div>
      </div>
    </DndContext>
  )
}


