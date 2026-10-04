"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { moveOpportunity } from "@/lib/data/actions";
import { formatBRL } from "@/lib/utils";

type Stage = { id: string; name: string; color: string; is_won: boolean; is_lost: boolean };
type Opp = {
  id: string;
  title: string | null;
  value: number;
  status: string;
  pipeline_stage_id: string;
  contact?: { name: string; company: string | null } | null;
};

export function PipelineBoard({
  stages,
  opportunities,
  lossReasons,
}: {
  stages: Stage[];
  opportunities: Opp[];
  lossReasons: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(opportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ oppId: string; stageId: string } | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeOpp = items.find((o) => o.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const oppId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || overId === items.find((o) => o.id === oppId)?.pipeline_stage_id) return;

    const target = stages.find((s) => s.id === overId);
    if (!target) return;

    // Perdido exige motivo.
    if (target.is_lost && lossReasons.length > 0) {
      setPendingLoss({ oppId, stageId: target.id });
      return;
    }

    applyMove(oppId, target.id, null);
  }

  function applyMove(oppId: string, stageId: string, lostReasonId: string | null) {
    setItems((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, pipeline_stage_id: stageId } : o)),
    );
    startTransition(() => {
      void moveOpportunity(oppId, stageId, lostReasonId);
    });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const col = items.filter((o) => o.pipeline_stage_id === stage.id);
            const total = col.reduce((s, o) => s + Number(o.value), 0);
            return (
              <DroppableColumn key={stage.id} stage={stage} total={total} count={col.length}>
                {col.map((opp) => (
                  <DraggableCard key={opp.id} opp={opp} color={stage.color} />
                ))}
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeOpp ? <CardView opp={activeOpp} color="#6366f1" dragging /> : null}
        </DragOverlay>
      </DndContext>

      {pendingLoss && (
        <LossReasonModal
          reasons={lossReasons}
          onCancel={() => setPendingLoss(null)}
          onConfirm={(reasonId) => {
            applyMove(pendingLoss.oppId, pendingLoss.stageId, reasonId);
            setPendingLoss(null);
          }}
        />
      )}
    </>
  );
}

function DroppableColumn({
  stage,
  total,
  count,
  children,
}: {
  stage: Stage;
  total: number;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
          <span className="text-sm font-bold">{stage.name}</span>
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
            {count}
          </span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{formatBRL(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-2xl border border-dashed p-2 transition-colors ${
          isOver ? "bg-accent/50" : "bg-muted/30"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function DraggableCard({ opp, color }: { opp: Opp; color: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`cursor-grab touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <CardView opp={opp} color={color} />
    </div>
  );
}

function CardView({ opp, color, dragging }: { opp: Opp; color: string; dragging?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-sm ${dragging ? "rotate-2 shadow-lg" : ""}`}
    >
      <div className="mb-1 h-1 w-8 rounded-full" style={{ background: color }} />
      <p className="text-sm font-semibold leading-tight">{opp.contact?.name ?? "Sem contato"}</p>
      {opp.contact?.company && (
        <p className="text-xs text-muted-foreground">{opp.contact.company}</p>
      )}
      <p className="mt-1.5 text-sm font-bold text-emerald-600">{formatBRL(Number(opp.value))}</p>
    </div>
  );
}

function LossReasonModal({
  reasons,
  onCancel,
  onConfirm,
}: {
  reasons: { id: string; name: string }[];
  onCancel: () => void;
  onConfirm: (reasonId: string | null) => void;
}) {
  const [reason, setReason] = useState<string>(reasons[0]?.id ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl">
        <h3 className="text-base font-bold">Motivo da perda</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe por que esta oportunidade foi perdida.
        </p>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-4 w-full rounded-xl border bg-background px-3 py-2 text-sm"
        >
          {reasons.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Marcar como perdido
          </button>
        </div>
      </div>
    </div>
  );
}
