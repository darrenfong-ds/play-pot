import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const shifts = sqliteTable(
  "shifts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    mode: text("mode").notNull().default("quiet"),
  },
  (table) => [
    index("idx_shifts_active").on(table.endedAt),
    check("shifts_mode_check", sql`${table.mode} IN ('quiet', 'busy')`),
  ],
);

export const families = sqliteTable(
  "families",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shiftId: integer("shift_id")
      .notNull()
      .references(() => shifts.id),
    familyNumber: integer("family_number").notNull(),
    operationId: text("operation_id").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull(),
    visual: text("visual").notNull().default(""),
    ageStatus: text("age_status").notNull().default("unchecked"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    queuedAt: text("queued_at"),
    enteredAt: text("entered_at"),
    dueAt: text("due_at"),
    departedAt: text("departed_at"),
  },
  (table) => [
    uniqueIndex("idx_families_shift_number").on(
      table.shiftId,
      table.familyNumber,
    ),
    uniqueIndex("idx_families_operation_id").on(table.operationId),
    index("idx_families_shift_status_entered").on(
      table.shiftId,
      table.status,
      table.enteredAt,
    ),
    index("idx_families_shift_status_queued").on(
      table.shiftId,
      table.status,
      table.queuedAt,
    ),
    check("families_adults_check", sql`${table.adults} >= 1`),
    check("families_children_check", sql`${table.children} >= 1`),
    check(
      "families_age_status_check",
      sql`${table.ageStatus} IN ('unchecked', 'under4', '4plus')`,
    ),
    check(
      "families_status_check",
      sql`${table.status} IN ('waiting', 'inside', 'completed', 'left_queue')`,
    ),
  ],
);
