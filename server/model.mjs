export const CATEGORIES = ['Asistencia', 'Tareas', 'Participación', 'Orden y limpieza', 'Extras'];
export function iso(d = new Date()) { return d.toISOString().slice(0, 10); }
export function months(date, count) { const d = new Date(date + 'T12:00:00Z'); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + count); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return iso(d); }
export function dateLabel(s) { return new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); }
export const sum = (rows) => rows.reduce((a, r) => a + Number(r.points), 0);
