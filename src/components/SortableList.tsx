"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A vertical list the team reorders by dragging a row's handle, or with the
 * keyboard: focus the handle, Space to pick up, arrows to move, Space to drop.
 * `onReorder` gets the new order of ids; the caller saves it.
 */
export function SortableList<T extends { id: string }>({
  items,
  nameOf,
  onReorder,
  renderRow,
  disabled = false,
  className,
}: {
  items: T[];
  /** What a screen reader calls the row being moved. */
  nameOf: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderRow: (item: T, handle: ReactNode) => ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("collections.drag");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((item) => item.id);
  const name = (id: string | number) => {
    const item = items.find((i) => i.id === id);
    return item ? nameOf(item) : "";
  };
  const position = (id: string | number | undefined) => (id === undefined ? 0 : ids.indexOf(String(id)) + 1);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: t("instructions") },
        announcements: {
          onDragStart: ({ active }) => t("picked", { name: name(active.id), position: position(active.id), total: ids.length }),
          onDragOver: ({ active, over }) =>
            over ? t("moved", { name: name(active.id), position: position(over.id), total: ids.length }) : undefined,
          onDragEnd: ({ active, over }) =>
            over ? t("dropped", { name: name(active.id), position: position(over.id), total: ids.length }) : undefined,
          onDragCancel: ({ active }) => t("cancelled", { name: name(active.id) }),
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={t("handle", { name: nameOf(item) })} disabled={disabled}>
              {(handle) => renderRow(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      disabled={disabled}
      className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
    >
      <GripVerticalIcon aria-hidden className="size-4" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 shadow-lg")}
    >
      {children(handle)}
    </li>
  );
}
