import type { Dictionary } from "@/lib/i18n/fr";
import { QUOTE_WAIT_DAYS, type TodoKey } from "@/lib/todo";

/** Label of an "À traiter" line, with the quote delay filled in. */
export const todoLabel = (t: Dictionary, key: TodoKey) => t.todo.items[key].replace("{n}", String(QUOTE_WAIT_DAYS));
