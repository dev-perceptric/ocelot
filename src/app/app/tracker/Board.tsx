"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { Menu } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { CompanyLogo, Table, Tag, Td, Th } from "@/components/ui";
import { CLOSED_STAGES, OPEN_STAGES, positionBetween, STAGE_LABEL, STAGE_TONE, STAGES, type Stage } from "@/lib/tracker";
import { setStage } from "./actions";

export type Card = { id: string; title: string; company: string; logo: string | null; stage: Stage; position: number; next: string; updated_at: string };

const byPosition = (a: Card, b: Card) => a.position - b.position || b.updated_at.localeCompare(a.updated_at);

// The tracker as a board (columns per stage) or a list. Cards move by drag and drop, or with the card's menu,
// which works from the keyboard. Changes show at once and roll back if saving fails.
export function Board({ cards: initial, view, closed }: { cards: Card[]; view: "board" | "list"; closed: boolean }) {
  const [cards, setCards] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) { setSeen(initial); setCards(initial); }
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const move = async (id: string, stage: Stage) => {
    const before = cards;
    const inColumn = cards.filter((c) => c.stage === stage && c.id !== id).sort(byPosition);
    const position = positionBetween(inColumn.at(-1)?.position ?? null, null);
    setCards(cards.map((c) => (c.id === id ? { ...c, stage, position } : c)));
    const r = await setStage(id, stage, position);
    if (!r.ok) { setCards(before); toast(r.message ?? "That didn't move. Try again."); }
    else toast(`Moved to ${STAGE_LABEL[stage]}`);
  };

  const menu = (c: Card) => (
    <Menu label={`Move ${c.title}`} items={STAGES.filter((s) => s !== c.stage).map((s) => ({ label: `Move to ${STAGE_LABEL[s]}`, onSelect: () => move(c.id, s) }))} />
  );
  const stages: readonly Stage[] = closed ? CLOSED_STAGES : OPEN_STAGES;
  const shown = cards.filter((c) => stages.includes(c.stage));

  if (view === "list") {
    return shown.length ? (
      <Table label="Tracked jobs">
        <thead><tr><Th>Job</Th><Th>Stage</Th><Th>Next</Th><Th className="w-14"><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {[...shown].sort((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage) || byPosition(a, b)).map((c) => (
            <tr key={c.id}>
              <Td>
                <span className="flex items-center gap-2">
                  {c.logo ? <CompanyLogo name={c.company} src={c.logo} size={20} /> : null}
                  <Link href={`/app/tracker/${c.id}`} className="font-bold hover:underline">{c.title}</Link>
                  {c.company ? <span className="text-meta text-muted">{c.company}</span> : null}
                </span>
              </Td>
              <Td><Tag tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</Tag></Td>
              <Td className="text-meta">{c.next}</Td>
              <Td>{menu(c)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    ) : <p className="text-body text-muted">{closed ? "Nothing closed yet." : "No jobs here yet."}</p>;
  }

  const drop = (stage: Stage) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    const card = cards.find((c) => c.id === id);
    if (card && card.stage !== stage) void move(card.id, stage);
  };

  return (
    <div className={`grid gap-4 ${closed ? "md:grid-cols-3" : "md:grid-cols-3 xl:grid-cols-5"}`}>
      {stages.map((stage) => {
        const col = cards.filter((c) => c.stage === stage).sort(byPosition);
        return (
          <section
            key={stage}
            aria-label={`${STAGE_LABEL[stage]}, ${col.length}`}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={drop(stage)}
            className={`flex min-h-40 flex-col gap-3 bg-border/40 p-3 rounded-[var(--radius-card)] ${over === stage ? "outline outline-2 outline-ink" : ""}`}
          >
            <h2 className="px-1 text-body font-bold">{STAGE_LABEL[stage]} <span className="text-muted">{col.length}</span></h2>
            {col.map((c) => (
              <article
                key={c.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); setDragging(c.id); }}
                onDragEnd={() => setDragging(null)}
                className={`flex items-start justify-between gap-2 border border-border bg-surface p-3 rounded-[var(--radius-card)] ${dragging === c.id ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <Link href={`/app/tracker/${c.id}`} className="block break-words text-body font-bold hover:underline">{c.title}</Link>
                  {c.company ? (
                    <p className="flex items-center gap-2 text-meta">{c.logo ? <CompanyLogo name={c.company} src={c.logo} size={18} /> : null}{c.company}</p>
                  ) : null}
                  <p className="mt-1 text-meta text-muted">{c.next}</p>
                </div>
                {menu(c)}
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
